# Fluxo-barcode

Sistema completo para geração e impressão de etiquetas RFID com integração de imagens do GitHub.

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 16+
- Python 3.8+
- PostgreSQL (para dados de POs)
- Token do GitHub (para buscar imagens)

### Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/larroude-tech/Fluxo-barcode.git
cd Fluxo-barcode
```

2. **Configure as variáveis de ambiente**

Crie um arquivo `.env` na raiz do projeto:

```bash
# GitHub Token (obrigatório para Image Proxy API)
GITHUB_TOKEN=seu_token_github_aqui

# Image Proxy API URL (opcional, padrão: http://localhost:8000)
IMAGE_PROXY_URL=http://localhost:8000

# PostgreSQL (se usar banco de dados)
DATABASE_URL=postgresql://user:password@host:port/database
```

3. **Instale as dependências**

```bash
# Backend Node.js
cd backend
npm install

# Frontend React
cd ../frontend
npm install

# API Python (Image Proxy)
cd ..
pip install -r requirements.txt
```

4. **Inicie os serviços**

**Windows:**
```bash
scripts\start-dev-with-image-proxy.bat
```

**Linux/Mac:**
```bash
chmod +x scripts/start-dev-with-image-proxy.sh
./scripts/start-dev-with-image-proxy.sh
```

Ou inicie manualmente:

```bash
# Terminal 1: Image Proxy API (Python)
uvicorn image_proxy:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Backend Node.js
cd backend
npm run dev

# Terminal 3: Frontend React
cd frontend
npm start
```

## 📋 Funcionalidades

### 1. Seleção de PO (Purchase Order)
- Busca POs do banco de dados PostgreSQL
- Filtra por SKU/VPN
- Atualização automática de dados

### 2. Busca Automática de Imagens
- **Integração automática com GitHub**: Quando uma PO é selecionada, o sistema busca automaticamente imagens baseadas na referência (REF) do produto
- As imagens são buscadas do repositório GitHub usando a API Python Image Proxy
- Se a imagem não for encontrada no GitHub, o sistema continua normalmente

### 3. Geração de Etiquetas
- Preview em tempo real
- Suporte a múltiplos layouts
- Impressão via USB ou rede
- Conversão automática de imagens para ZPL

## 🔧 Arquitetura

```
┌─────────────┐
│  Frontend   │ (React - Porta 3000)
│   React     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │ (Node.js - Porta 3005)
│  Express    │
└──────┬──────┘
       │
       ├──► PostgreSQL (Dados de POs)
       │
       └──► Image Proxy API (Python - Porta 8000)
                    │
                    └──► GitHub (Imagens por referência)
```

## 📚 Documentação

- [Configuração de Variáveis de Ambiente](ENV_SETUP.md)
- [Image Proxy API - Documentação Completa](docs/IMAGE_PROXY_API.md)

## 🎯 Como Usar

1. **Inicie todos os serviços** usando o script de desenvolvimento
2. **Acesse o frontend** em `http://localhost:3000`
3. **Selecione uma PO** na interface
4. **O sistema busca automaticamente** as imagens dos produtos baseado na referência (REF)
5. **Visualize o preview** das etiquetas
6. **Imprima** as etiquetas

## 🔍 Formato de Referência

As imagens no GitHub devem seguir o formato:
- Nome do arquivo: `XXX-XXXX.ext` (ex: `100-0001.jpeg`, `123-4567.png`)
- Localização: Pasta `images/` no repositório
- Referência extraída: `XXXXXXX` (ex: `1000001`, `1234567`)

## 🛠️ Desenvolvimento

### Estrutura do Projeto

```
Fluxo-barcode/
├── backend/          # Backend Node.js (Express)
├── frontend/         # Frontend React
├── image_proxy.py    # API Python (FastAPI) - Image Proxy
├── requirements.txt  # Dependências Python
└── scripts/          # Scripts de inicialização
```

### Variáveis de Ambiente

Veja [ENV_SETUP.md](ENV_SETUP.md) para detalhes completos.

## 📝 Licença

MIT