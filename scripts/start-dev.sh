#!/bin/bash
echo "========================================"
echo "Iniciando Sistema em Modo Desenvolvimento"
echo "========================================"
echo ""

# Obter diretório do script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "[1/2] Iniciando Frontend na porta 3000..."
(
  cd "$PROJECT_ROOT/frontend" &&
  npm start
) &
FRONTEND_PID=$!

sleep 3

echo "[2/2] Iniciando Backend na porta 3005..."
cd "$PROJECT_ROOT/backend"
npm run dev &
BACKEND_PID=$!

echo ""
echo "========================================"
echo "Servicos iniciados em modo desenvolvimento!"
echo "========================================"
echo ""
echo "Frontend: http://localhost:3000 (com hot reload)"
echo "Backend: http://localhost:3005 (com hot reload)"
echo ""
echo "PIDs: Frontend=$FRONTEND_PID, Backend=$BACKEND_PID"
echo ""
echo "Pressione Ctrl+C para encerrar os servicos..."
echo ""

# Aguardar Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait


