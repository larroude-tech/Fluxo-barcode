# syntax=docker/dockerfile:1

##
## Fluxo Barcode - Multi-stage build for backend + frontend bundle
##
## This image installs production dependencies for the Express backend,
## pre-builds the React frontend, and serves both through the same Node
## process. Designed for GitHub Actions workflows that publish images to
## Google Cloud (Artifact Registry / Cloud Run).
##

# -----------------------------
# Stage 1 - Build React frontend
# -----------------------------
FROM node:20-bullseye-slim AS frontend-builder
WORKDIR /app/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Build static assets
COPY frontend/ ./
RUN npm run build

# ---------------------------------------
# Stage 2 - Install backend dependencies
# ---------------------------------------
FROM node:20-bullseye-slim AS backend-deps
WORKDIR /app/backend

# Install system dependencies required by native Node modules (e.g. sharp)
# python3 e pip são necessários para a API Python que roda junto com o backend
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci --omit=dev

# Install Python dependencies for API Python Image Proxy
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy backend source (without node_modules from host)
# This includes the API Images folder with image_proxy.py and image-proxy-starter.js
COPY backend/ ./

# -------------------------------
# Stage 3 - Production runnable
# -------------------------------
FROM node:20-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Python dependencies in runner stage (needed for API Python)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy backend (code + node_modules)
COPY --from=backend-deps /app/backend ./backend

# Copy frontend build into backend public assets
# COPY cria o diretório automaticamente se não existir
COPY --from=frontend-builder /app/frontend/build ./backend/public/app

# Copy templates and layouts from project root
# Templates are loaded from ../templates/ relative to backend/server.js
# Layouts are loaded from backend/layouts/
# Note: layouts já estão incluídos em backend/ copiado acima
COPY templates/ ./templates/
# Layouts já estão em ./backend/layouts/ (copiados com COPY --from=backend-deps /app/backend ./backend)

# Optional: create non-root user for better security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Garantir permissões do frontend e backend antes de mudar para nodejs
# Criar diretório public se não existir (garantir antes de mudar permissões)
RUN mkdir -p /app/backend/public && \
    chown -R nodejs:nodejs /app/backend && \
    chmod -R 755 /app/backend/public

USER nodejs

# Cloud Run will set PORT automatically (default: 8080)
# The app uses process.env.PORT || 3005, so it will use Cloud Run's PORT
EXPOSE 8080

CMD ["node", "backend/server.js"]

