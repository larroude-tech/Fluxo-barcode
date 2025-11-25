@echo off
setlocal enabledelayedexpansion
cls
echo ========================================
echo   SISTEMA LARROUDE RFID - INICIALIZACAO
echo   Modo Desenvolvimento
echo ========================================
echo.

REM ========================================
REM ETAPA 0: VERIFICACAO DE PORTAS
REM ========================================
echo [ETAPA 0/4] Verificando portas necessarias...
echo.
echo    Verificando porta 3005 (Backend Node.js)...
netstat -ano | findstr :3005 >nul 2>&1
if %errorlevel% equ 0 (
    echo    [AVISO] Porta 3005 em uso! Limpando processos...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3005 ^| findstr LISTENING') do (
        echo    [ACAO] Encerrando processo PID: %%a
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
    echo    [OK] Porta 3005 liberada!
) else (
    echo    [OK] Porta 3005 livre!
)
echo.

echo    Verificando portas 8000-8002 (API Python Image Proxy)...
set PYTHON_PORT_FOUND=0
for /L %%p in (8000,1,8002) do (
    netstat -ano | findstr :%%p >nul 2>&1
    if %errorlevel% equ 0 (
        echo    [INFO] Porta %%p em uso (pode ser API Python anterior)
    )
)
echo    [OK] Verificacao de portas concluida
echo.

REM ========================================
REM ETAPA 1: INICIALIZACAO DO FRONTEND
REM ========================================
echo [ETAPA 1/4] Iniciando Frontend React...
echo.
echo    [INFO] Frontend sera iniciado na porta 3000
echo    [INFO] Aguarde as seguintes mensagens no console do Frontend:
echo.
echo    Mensagens esperadas:
echo      - Compiled successfully!
echo      - webpack compiled
echo      - Local: http://localhost:3000
echo.
start "Frontend RFID - Porta 3000" cmd /k "cd /d %~dp0.. && cd frontend && npm start"
echo    [OK] Frontend iniciado! Verifique a janela do Frontend para acompanhar o progresso.
echo    [INFO] Aguardando 3 segundos para o Frontend iniciar...
timeout /t 3 /nobreak >nul
echo.

REM ========================================
REM ETAPA 2: INICIALIZACAO DO BACKEND
REM ========================================
echo [ETAPA 2/4] Iniciando Backend Node.js...
echo.
echo    [INFO] Backend sera iniciado na porta 3005
echo    [INFO] Backend iniciara automaticamente a API Python Image Proxy
echo    [INFO] API Python sera iniciada na porta 8000 (ou 8001/8002 se 8000 estiver em uso)
echo    [INFO] Aguarde as seguintes mensagens no console do Backend:
echo.
echo    Mensagens esperadas:
echo      - [STARTUP] Iniciando API Python Image Proxy antes do servidor...
echo      - [IMAGE-PROXY] 🚀 Iniciando API Python Image Proxy...
echo      - [IMAGE-PROXY] 🔍 Porta selecionada: 8000 (ou 8001/8002)
echo      - [IMAGE-PROXY] ✅ API iniciada com sucesso na porta XXXX
echo      - [CACHE] Imagens totais em images/: XXXX
echo      - [CACHE] Imagens com reference valida: XXXX
echo      - [STARTUP] ✅ API Python Image Proxy esta pronta em http://127.0.0.1:XXXX!
echo      - ✅ Servidor rodando na porta 3005
echo.
start "Backend RFID - Porta 3005" cmd /k "cd /d %~dp0.. && cd backend && npm run dev"
echo    [OK] Backend iniciado! Verifique a janela do Backend para acompanhar o progresso.
echo    [INFO] Aguardando 5 segundos para o Backend iniciar...
timeout /t 5 /nobreak >nul
echo.

REM ========================================
REM ETAPA 3: VERIFICACAO DA API PYTHON
REM ========================================
echo [ETAPA 3/4] Verificando API Python Image Proxy...
echo.
echo    [INFO] Verificando se a API Python esta respondendo...
echo    [INFO] Tentando portas 8000, 8001, 8002...
set API_READY=0
set PYTHON_PORT=
for /L %%p in (8000,1,8002) do (
    if !API_READY! equ 0 (
        REM Tentar verificar se a porta esta em uso e respondendo
        netstat -ano | findstr :%%p | findstr LISTENING >nul 2>&1
        if !errorlevel! equ 0 (
            echo    [INFO] Porta %%p esta em uso, pode ser a API Python
            REM Tentar fazer uma requisicao HTTP simples (se PowerShell estiver disponivel)
            powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:%%p/status' -TimeoutSec 2 -UseBasicParsing; if ($response.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
            if !errorlevel! equ 0 (
                echo    [OK] API Python encontrada e respondendo na porta %%p
                set API_READY=1
                set PYTHON_PORT=%%p
            )
        )
    )
)
if !API_READY! equ 0 (
    echo    [AVISO] API Python ainda nao esta respondendo
    echo    [INFO] Isso e normal - a API pode levar alguns segundos para iniciar
    echo    [INFO] O Backend detectara automaticamente a porta quando a API estiver pronta
    echo    [INFO] Verifique a janela do Backend para ver o progresso da inicializacao
) else (
    echo    [OK] API Python esta pronta na porta !PYTHON_PORT!
)
echo.

REM ========================================
REM ETAPA 4: RESUMO E INFORMACOES
REM ========================================
echo [ETAPA 4/4] Resumo da inicializacao
echo.
echo ========================================
echo   SERVICOS INICIADOS
echo ========================================
echo.
echo   [1] Frontend React
echo       URL: http://localhost:3000
echo       Status: Verifique a janela do Frontend
echo       Funcao: Interface web para o sistema
echo       Hot Reload: Ativado (webpack)
echo.
echo   [2] Backend Node.js
echo       URL: http://localhost:3005
echo       Status: Verifique a janela do Backend
echo       Funcao: API REST para gerenciamento de etiquetas
echo       Hot Reload: Ativado (nodemon)
echo.
echo   [3] API Python Image Proxy
echo       URL: http://localhost:8000 (ou 8001/8002)
echo       Status: Verifique a janela do Backend
echo       Funcao: Busca imagens do GitHub baseado em referencias
echo       Endpoint: /image/reference/{referencia}
echo.
echo ========================================
echo   FLUXO DE FUNCIONAMENTO
echo ========================================
echo.
echo   1. Usuario seleciona uma PO no Frontend
echo   2. Frontend faz requisicao: GET /api/labels?po=XXX
echo   3. Backend consulta PostgreSQL e retorna dados da PO
echo   4. Backend busca imagens da API Python para todas as referencias
echo   5. Backend retorna dados + URLs das imagens
echo   6. Frontend exibe dados e imagens nas etiquetas
echo.
echo ========================================
echo   LOGS IMPORTANTES
echo ========================================
echo.
echo   No console do Backend, procure por:
echo   - [IMAGE-PROXY] 🔄 Referencia normalizada: "XXX.XXXX" -^> "XXXXXXX"
echo   - [IMAGE-PROXY] ✅ URL gerada: "XXX.XXXX" -^> http://127.0.0.1:8000/...
echo   - [IMAGE-PROXY] ✅ Busca de imagens concluida: X/Y imagens encontradas
echo.
echo   Se houver problemas:
echo   - Verifique se Python esta instalado e no PATH
echo   - Verifique se GITHUB_TOKEN esta configurado no .env
echo   - Verifique se as portas 3005, 8000-8002 estao disponiveis
echo.
echo ========================================
echo.
echo   Pressione qualquer tecla para fechar esta janela...
echo   (Os servicos continuarao rodando nas janelas abertas)
pause >nul


