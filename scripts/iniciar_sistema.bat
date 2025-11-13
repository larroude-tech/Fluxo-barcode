@echo off
echo ========================================
echo Iniciando Sistema RFID Larroudé
echo ========================================
echo.

echo [1/2] Iniciando Backend na porta 3005...
start "Backend RFID - Porta 3005" cmd /k "cd /d %~dp0.. && cd backend && npm start"
timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend na porta 3000...
start "Frontend RFID - Porta 3000" cmd /k "cd /d %~dp0.. && cd frontend && npm start"

echo.
echo ========================================
echo Sistema iniciado!
echo ========================================
echo.
echo Backend: http://localhost:3005
echo Frontend: http://localhost:3000
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul

