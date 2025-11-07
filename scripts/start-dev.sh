#!/bin/bash
echo "========================================"
echo "Iniciando Sistema em Modo Desenvolvimento"
echo "========================================"
echo ""

# Obter diretório do script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "[1/2] Iniciando Backend na porta 3002..."
cd "$PROJECT_ROOT/backend"
npm run dev &
BACKEND_PID=$!

sleep 3

echo "[2/2] Iniciando Frontend na porta 3000..."
cd "$PROJECT_ROOT/frontend"
npm start &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "Servicos iniciados em modo desenvolvimento!"
echo "========================================"
echo ""
echo "Backend: http://localhost:3002 (com hot reload)"
echo "Frontend: http://localhost:3000"
echo ""
echo "PIDs: Backend=$BACKEND_PID, Frontend=$FRONTEND_PID"
echo ""
echo "Pressione Ctrl+C para encerrar os servicos..."
echo ""

# Aguardar Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait


