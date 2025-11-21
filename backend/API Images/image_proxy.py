import os
import re
from typing import Optional, Dict
from urllib.parse import quote
from pathlib import Path
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from dotenv import load_dotenv

# =======================
# CONFIG
# =======================
# Carregar .env da raiz do projeto (2 níveis acima: backend/API Images/ -> backend/ -> raiz)
env_path = Path(__file__).parent.parent.parent / '.env'

# Tentar carregar .env com tratamento de encoding
def load_env_safe(env_path):
    """Carrega .env com tratamento de encoding"""
    try:
        # Tentar carregar normalmente
        load_dotenv(env_path)
    except UnicodeDecodeError as e:
        # Se falhar, tentar diferentes encodings
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
        for encoding in encodings:
            try:
                with open(env_path, 'r', encoding=encoding) as f:
                    content = f.read()
                # Recriar arquivo com UTF-8
                with open(env_path, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(content)
                # Tentar carregar novamente
                load_dotenv(env_path)
                print(f"[IMAGE-PROXY] Arquivo .env convertido de {encoding} para UTF-8")
                return
            except Exception:
                continue
        # Se todos falharem, mostrar erro
        print(f"[IMAGE-PROXY] [ERRO] Não foi possível ler .env com nenhum encoding")
        print(f"[IMAGE-PROXY] [ERRO] Caminho: {env_path}")
        print(f"[IMAGE-PROXY] [ERRO] Erro original: {e}")
        raise

load_env_safe(env_path)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
OWNER = "larroude-tech"
REPO = "Fluxo-barcode"
BRANCH = "main"
IMAGES_PREFIX = "images/"
REF_REGEX = re.compile(r"(\d{3})-(\d{4})")  # 100-0001

if not GITHUB_TOKEN:
    raise RuntimeError("Defina GITHUB_TOKEN no .env")

# Log para confirmar que o token foi carregado (sem mostrar o valor completo por segurança)
token_preview = GITHUB_TOKEN[:10] + "..." if len(GITHUB_TOKEN) > 10 else "***"
print(f"[IMAGE-PROXY] GITHUB_TOKEN carregado do .env: {token_preview}")

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}

app = FastAPI(title="Image proxy GitHub por reference (sem banco)")

# cache em memória: reference -> path
REF_TO_PATH: Dict[str, str] = {}


def extract_reference_from_name(name: str) -> Optional[str]:
    """
    "100-0001 CANDY.jpeg" -> "1000001"
    """
    m = REF_REGEX.search(name)
    if not m:
        return None
    return m.group(1) + m.group(2)


def build_cache() -> None:
    """
    Monta o dicionário REF_TO_PATH lendo o repo no GitHub.
    Usa Git Trees API (sem limite de 1000 arquivos).
    """
    global REF_TO_PATH
    REF_TO_PATH = {}

    # 1) pegar SHA do último commit da branch
    ref_url = f"https://api.github.com/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}"
    ref_resp = requests.get(ref_url, headers=HEADERS)
    ref_resp.raise_for_status()
    commit_sha = ref_resp.json()["object"]["sha"]

    # 2) pegar SHA da tree
    commit_url = f"https://api.github.com/repos/{OWNER}/{REPO}/git/commits/{commit_sha}"
    commit_resp = requests.get(commit_url, headers=HEADERS)
    commit_resp.raise_for_status()
    tree_sha = commit_resp.json()["tree"]["sha"]

    # 3) pegar árvore recursiva
    tree_url = f"https://api.github.com/repos/{OWNER}/{REPO}/git/trees/{tree_sha}?recursive=1"
    tree_resp = requests.get(tree_url, headers=HEADERS)
    tree_resp.raise_for_status()
    tree_data = tree_resp.json()["tree"]

    count_total = 0
    count_com_ref = 0

    for item in tree_data:
        if item["type"] != "blob":
            continue

        path = item["path"]
        if not path.startswith(IMAGES_PREFIX):
            continue

        count_total += 1
        name = path.split("/")[-1]
        ref = extract_reference_from_name(name)

        if not ref:
            continue

        # se tiver duplicado, mantém o primeiro e ignora o resto
        if ref not in REF_TO_PATH:
            REF_TO_PATH[ref] = path
            count_com_ref += 1

    print(f"[CACHE] Imagens totais em {IMAGES_PREFIX}: {count_total}")
    print(f"[CACHE] Imagens com reference valida: {count_com_ref}")


@app.on_event("startup")
def on_startup():
    # monta cache uma vez ao subir o servidor
    build_cache()


@app.get("/image/reference/{reference}")
@app.head("/image/reference/{reference}")
def image_by_reference(reference: str, request: Request):
    """
    Exemplo: /image/reference/1000001 ou /image/reference/100.0001
    → aceita referência no formato XXXXXXX ou XXX.XXXX ou XXX-XXXX
    → procura qualquer arquivo em images/ que tenha "XXX-XXXX" no nome
    →  baixa do GitHub com token
    → devolve a imagem
    → Suporta GET (retorna imagem) e HEAD (verifica se existe)
    """
    # Normalizar referência: converter XXX.XXXX ou XXX-XXXX para XXXXXXX
    normalized_ref = reference.strip().replace('.', '').replace('-', '')
    
    # Log da normalização (apenas se houve mudança)
    if normalized_ref != reference.strip():
        print(f"[IMAGE-PROXY] Referencia normalizada: '{reference}' -> '{normalized_ref}'")
    
    # Verificar se tem formato válido (7 dígitos)
    if not normalized_ref.isdigit() or len(normalized_ref) != 7:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato de referencia invalido: {reference}. Esperado: XXXXXXX (7 digitos) ou XXX.XXXX ou XXX-XXXX"
        )
    
    # garante que o cache existe (se der algum problema no startup)
    if not REF_TO_PATH:
        build_cache()

    path = REF_TO_PATH.get(normalized_ref)
    if not path:
        raise HTTPException(
            status_code=404, 
            detail=f"Reference '{reference}' (normalizada: {normalized_ref}) nao encontrada no cache"
        )

    encoded_path = quote(path)
    raw_url = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/{encoded_path}"

    # Verificar se é requisição HEAD
    is_head = request.method == "HEAD"
    
    if is_head:
        # Para HEAD, apenas verificar se existe sem baixar o conteúdo completo
        try:
            head_resp = requests.head(raw_url, headers=HEADERS, timeout=15)
            if head_resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"GitHub retornou {head_resp.status_code} para {path}",
                )
            
            # Retornar apenas headers (FastAPI automaticamente não envia body para HEAD)
            content_type = head_resp.headers.get("Content-Type", "image/jpeg")
            return Response(
                content=b"",  # Vazio para HEAD
                media_type=content_type,
                headers={
                    "Content-Length": head_resp.headers.get("Content-Length", "0"),
                    "Content-Type": content_type
                }
            )
        except requests.exceptions.RequestException as e:
            raise HTTPException(
                status_code=502,
                detail=f"Erro ao verificar imagem no GitHub: {str(e)}",
            )
    else:
        # Para GET, baixar e retornar a imagem completa
        try:
            resp = requests.get(raw_url, headers=HEADERS, timeout=15)
            
            if resp.status_code != 200:
                # Log detalhado do erro
                print(f"[IMAGE-PROXY] ERRO: GitHub retornou {resp.status_code}")
                print(f"[IMAGE-PROXY] URL: {raw_url}")
                print(f"[IMAGE-PROXY] Path no cache: {path}")
                print(f"[IMAGE-PROXY] Referencia normalizada: {normalized_ref}")
                
                if resp.status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Imagem nao encontrada no GitHub para referencia '{reference}' (normalizada: {normalized_ref}). Path: {path}",
                    )
                elif resp.status_code == 403:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Acesso negado pelo GitHub. Verifique se o GITHUB_TOKEN esta valido e tem permissoes para acessar o repositorio.",
                    )
                elif resp.status_code == 429:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Rate limit do GitHub atingido. Aguarde alguns minutos e tente novamente. Path: {path}",
                    )
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"GitHub retornou {resp.status_code} para {path}. Verifique se a imagem existe no repositorio.",
                    )

            content_type = resp.headers.get("Content-Type", "image/jpeg")
            print(f"[IMAGE-PROXY] Imagem baixada com sucesso: {len(resp.content)} bytes, tipo: {content_type}")
            return Response(content=resp.content, media_type=content_type)
        except requests.exceptions.Timeout:
            print(f"[IMAGE-PROXY] ERRO: Timeout ao buscar imagem do GitHub")
            raise HTTPException(
                status_code=504,
                detail=f"Timeout ao buscar imagem do GitHub para {path}",
            )
        except requests.exceptions.RequestException as e:
            print(f"[IMAGE-PROXY] ERRO: Excecao ao buscar imagem: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail=f"Erro ao buscar imagem do GitHub: {str(e)}",
            )


@app.post("/cache/reload")
def reload_cache():
    """
    Endpoint opcional para recarregar o cache manualmente.
    """
    build_cache()
    return {"status": "ok", "refs": len(REF_TO_PATH)}


@app.get("/")
def root():
    """
    Endpoint raiz com informações da API.
    """
    return {
        "service": "Image Proxy GitHub por Reference",
        "endpoints": {
            "get_image": "/image/reference/{reference}",
            "reload_cache": "POST /cache/reload",
            "status": "/status"
        },
        "cache_size": len(REF_TO_PATH)
    }


@app.get("/status")
def status():
    """
    Endpoint de status da API.
    """
    return {
        "status": "online",
        "cache_size": len(REF_TO_PATH),
        "cache_loaded": len(REF_TO_PATH) > 0
    }
