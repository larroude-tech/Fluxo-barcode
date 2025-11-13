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
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source (without node_modules from host)
COPY backend/ ./

# -------------------------------
# Stage 3 - Production runnable
# -------------------------------
FROM node:20-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005

# Copy backend (code + node_modules)
COPY --from=backend-deps /app/backend ./backend

# Copy frontend build into backend public assets
COPY --from=frontend-builder /app/frontend/build ./backend/public/app

# Optional: create non-root user for better security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

EXPOSE 3005

CMD ["node", "backend/server.js"]

