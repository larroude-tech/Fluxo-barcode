# IP Estático Configurado para Cloud Run - fluxo-barcode

## IP Estático de Entrada

**IP Estático:** `34.149.180.170`

**Status:** Configurado e Ativo

## URLs de Acesso

- **IP Estático:** http://34.149.180.170
- **URL Original Cloud Run:** https://fluxo-barcode-z55lw2s5iq-uc.a.run.app
- **URL Alternativa:** https://fluxo-barcode-797216664522.us-central1.run.app

## Componentes Criados

### 1. IP Estático Global
- **Nome:** `fluxo-barcode-static-ip`
- **IP:** `34.149.180.170`
- **Tipo:** EXTERNAL, PREMIUM
- **Status:** IN_USE

### 2. Serverless Network Endpoint Group (NEG)
- **Nome:** `fluxo-barcode-neg`
- **Região:** `us-central1`
- **Tipo:** serverless
- **Serviço Cloud Run:** `fluxo-barcode`

### 3. Backend Service
- **Nome:** `fluxo-barcode-backend`
- **Escopo:** Global
- **Protocolo:** HTTP
- **Backend:** fluxo-barcode-neg (us-central1)

### 4. URL Map
- **Nome:** `fluxo-barcode-url-map`
- **Serviço Padrão:** fluxo-barcode-backend

### 5. HTTP Proxy
- **Nome:** `fluxo-barcode-http-proxy`
- **URL Map:** fluxo-barcode-url-map

### 6. Forwarding Rule
- **Nome:** `fluxo-barcode-forwarding-rule`
- **IP:** `34.149.180.170`
- **Protocolo:** HTTP (porta 80)
- **Status:** Ativo

## Tempo de Propagação

O Load Balancer pode levar **5-10 minutos** para propagar completamente. Se o IP não estiver respondendo imediatamente, aguarde alguns minutos.

## Testar Acesso

```bash
# Testar via IP estático
curl http://34.149.180.170

# Testar via URL original
curl https://fluxo-barcode-z55lw2s5iq-uc.a.run.app
```

## Verificar Status

```bash
# Verificar IP estático
gcloud compute addresses describe fluxo-barcode-static-ip \
  --project=larroude-data-prod \
  --global

# Verificar Forwarding Rule
gcloud compute forwarding-rules describe fluxo-barcode-forwarding-rule \
  --project=larroude-data-prod \
  --global

# Verificar Backend Service
gcloud compute backend-services describe fluxo-barcode-backend \
  --project=larroude-data-prod \
  --global

# Verificar NEG
gcloud compute network-endpoint-groups describe fluxo-barcode-neg \
  --project=larroude-data-prod \
  --region=us-central1
```

## Configurar HTTPS (Opcional)

Para habilitar HTTPS no IP estático:

1. **Criar certificado SSL:**
```bash
gcloud compute ssl-certificates create fluxo-barcode-ssl-cert \
  --project=larroude-data-prod \
  --domains=seu-dominio.com
```

2. **Criar HTTPS Proxy:**
```bash
gcloud compute target-https-proxies create fluxo-barcode-https-proxy \
  --project=larroude-data-prod \
  --url-map=fluxo-barcode-url-map \
  --ssl-certificates=fluxo-barcode-ssl-cert
```

3. **Criar Forwarding Rule para HTTPS (porta 443):**
```bash
gcloud compute forwarding-rules create fluxo-barcode-https-forwarding-rule \
  --project=larroude-data-prod \
  --global \
  --load-balancing-scheme=EXTERNAL \
  --address=fluxo-barcode-static-ip \
  --target-https-proxy=fluxo-barcode-https-proxy \
  --ports=443
```

## Custos Estimados

- **Load Balancer:** ~$18/mês (~$0.025/hora)
- **IP Estático Global:** ~$1.50/mês
- **Total:** ~$19.50/mês

*Custos adicionais por tráfego podem se aplicar.*

## Remover Configuração

Para remover toda a configuração:

```bash
# 1. Deletar Forwarding Rule
gcloud compute forwarding-rules delete fluxo-barcode-forwarding-rule \
  --project=larroude-data-prod \
  --global

# 2. Deletar HTTP Proxy
gcloud compute target-http-proxies delete fluxo-barcode-http-proxy \
  --project=larroude-data-prod

# 3. Deletar URL Map
gcloud compute url-maps delete fluxo-barcode-url-map \
  --project=larroude-data-prod

# 4. Deletar Backend Service
gcloud compute backend-services delete fluxo-barcode-backend \
  --project=larroude-data-prod \
  --global

# 5. Deletar NEG
gcloud compute network-endpoint-groups delete fluxo-barcode-neg \
  --project=larroude-data-prod \
  --region=us-central1

# 6. Deletar IP Estático (opcional - só se não for mais necessário)
gcloud compute addresses delete fluxo-barcode-static-ip \
  --project=larroude-data-prod \
  --global
```

## Notas

- O IP estático permanecerá o mesmo mesmo que você faça redeploy do serviço Cloud Run
- O Load Balancer distribui o tráfego automaticamente para o Cloud Run
- O serviço Cloud Run continua acessível pela URL original
- O IP estático funciona em HTTP (porta 80). Para HTTPS, configure SSL conforme instruções acima

## Data de Configuração

Configurado em: 2025-01-25

