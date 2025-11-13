@echo off
echo ========================================
echo   Limpar Porta 3005 - Backend
echo ========================================
echo.

echo Verificando processos usando porta 3005...
echo.

netstat -ano | findstr :3005
if %errorlevel% neq 0 (
    echo.
    echo Nenhum processo encontrado na porta 3005.
    echo A porta esta livre!
    pause
    exit /b
)

echo.
echo Processos encontrados. Encerrando...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3005 ^| findstr LISTENING') do (
    echo Encerrando processo PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo Processos encerrados!
echo.
echo Aguarde 2 segundos e verifique novamente...
timeout /t 2 >nul

netstat -ano | findstr :3005
if %errorlevel% neq 0 (
    echo.
    echo ✅ Porta 3005 liberada com sucesso!
) else (
    echo.
    echo ⚠️  Ainda ha processos usando a porta 3005.
    echo    Execute este script novamente ou verifique manualmente.
)

echo.
pause



