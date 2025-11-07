@echo off
echo ========================================
echo Iniciando Sistema em Modo Desenvolvimento
echo ========================================
echo.

echo [1/2] Iniciando Backend na porta 3002...
start "Backend RFID - Porta 3002" cmd /k "cd /d %~dp0.. && cd backend && npm run dev"
timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend na porta 3000...
start "Frontend RFID - Porta 3000" cmd /k "cd /d %~dp0.. && cd frontend && npm start"

echo.
echo ========================================
echo Servicos iniciados em modo desenvolvimento!
echo ========================================
echo.
echo Backend: http://localhost:3002 (com hot reload)
echo Frontend: http://localhost:3000
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul


