const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let imageProxyProcess = null;
let restartAttempts = 0;
const maxRestartAttempts = 2;

/**
 * Inicia a API Python Image Proxy como processo filho
 */
async function startImageProxy() {
  // Verificar se já está rodando
  if (imageProxyProcess) {
    console.log('[IMAGE-PROXY] API já está rodando');
    return;
  }

  // Verificar se o arquivo image_proxy.py existe
  const projectRoot = path.join(__dirname, '..');
  const imageProxyPath = path.join(projectRoot, 'image_proxy.py');
  
  if (!fs.existsSync(imageProxyPath)) {
    console.warn('[IMAGE-PROXY] ⚠️ Arquivo image_proxy.py não encontrado, pulando inicialização');
    return;
  }

  // Verificar e encontrar porta disponível
  const { execSync } = require('child_process');
  let imageProxyPort = process.env.IMAGE_PROXY_PORT || '8000';
  
  // Função para verificar se uma porta está em uso
  function isPortInUse(port) {
    try {
      if (process.platform === 'win32') {
        const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' });
        return result && result.trim().length > 0;
      } else {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' });
        return result && result.trim().length > 0;
      }
    } catch (e) {
      return false; // Porta não está em uso
    }
  }
  
  // Função para liberar uma porta
  function clearPort(port) {
    try {
      if (process.platform === 'win32') {
        const portCheck = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' });
        if (portCheck && portCheck.trim()) {
          const lines = portCheck.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid)) {
              try {
                execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', stdio: 'pipe' });
                console.log(`[IMAGE-PROXY] ✅ Processo ${pid} encerrado na porta ${port}`);
              } catch (killError) {
                // Ignorar erros
              }
            }
          }
        }
      } else {
        const portCheck = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' });
        if (portCheck && portCheck.trim()) {
          const pids = portCheck.trim().split('\n');
          for (const pid of pids) {
            if (pid && !isNaN(pid)) {
              try {
                execSync(`kill -9 ${pid}`, { encoding: 'utf8', stdio: 'pipe' });
                console.log(`[IMAGE-PROXY] ✅ Processo ${pid} encerrado na porta ${port}`);
              } catch (killError) {
                // Ignorar erros
              }
            }
          }
        }
      }
      // Aguardar um pouco para a porta ser liberada
      return new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      return Promise.resolve();
    }
  }
  
  // Se IMAGE_PROXY_PORT não estiver definido, tentar encontrar porta disponível
  if (!process.env.IMAGE_PROXY_PORT) {
    const portsToTry = ['8000', '8001', '8002'];
    let foundPort = null;
    
    for (const port of portsToTry) {
      if (!isPortInUse(port)) {
        foundPort = port;
        break;
      } else {
        // Tentar liberar a porta
        console.log(`[IMAGE-PROXY] ⚠️ Porta ${port} em uso, tentando liberar...`);
        await clearPort(port);
        // Verificar novamente após limpar
        if (!isPortInUse(port)) {
          foundPort = port;
          break;
        }
      }
    }
    
    if (foundPort) {
      imageProxyPort = foundPort;
      console.log(`[IMAGE-PROXY] 🔍 Porta selecionada: ${imageProxyPort}`);
    } else {
      console.log(`[IMAGE-PROXY] ⚠️ Nenhuma porta disponível (8000-8002), usando ${imageProxyPort} mesmo assim`);
    }
  } else {
    // Se IMAGE_PROXY_PORT estiver definido, verificar se está disponível
    if (isPortInUse(imageProxyPort)) {
      console.log(`[IMAGE-PROXY] ⚠️ Porta ${imageProxyPort} (definida em IMAGE_PROXY_PORT) está em uso, tentando liberar...`);
      await clearPort(imageProxyPort);
    }
  }
  
  // Armazenar a porta usada em uma variável de ambiente para o processo atual
  // Isso ajuda o backend a detectar a porta correta
  process.env._IMAGE_PROXY_ACTUAL_PORT = imageProxyPort;

  // Detectar comando Python (tentar python3 primeiro, depois python)
  let pythonCmd;
  if (process.platform === 'win32') {
    pythonCmd = 'python';
  } else {
    // Linux/Mac: tentar python3 primeiro
    pythonCmd = 'python3';
  }

  console.log('[IMAGE-PROXY] 🚀 Iniciando API Python Image Proxy...');
  console.log(`[IMAGE-PROXY] Comando Python: ${pythonCmd}`);
  console.log(`[IMAGE-PROXY] Diretório: ${projectRoot}`);
  
  // Comando para iniciar uvicorn (imageProxyPort já foi definido acima)
  const uvicornArgs = [
    '-m',
    'uvicorn',
    'image_proxy:app',
    '--host',
    '127.0.0.1',  // Usar localhost ao invés de 0.0.0.0 para evitar problemas de permissão
    '--port',
    imageProxyPort
  ];

  // Em desenvolvimento, adicionar --reload apenas se não estiver rodando com nodemon
  // O nodemon já faz reload do Node.js, e o --reload do uvicorn cria arquivos temporários
  // que o nodemon detecta, causando loops de reinicialização
  if (process.env.NODE_ENV !== 'production' && !process.env.NODEMON_RUNNING) {
    uvicornArgs.push('--reload');
    console.log('[IMAGE-PROXY] Modo desenvolvimento: --reload habilitado');
  } else {
    console.log('[IMAGE-PROXY] Modo desenvolvimento: --reload desabilitado (nodemon ativo)');
  }

  // Iniciar processo Python
  // No Windows, usar shell: true para garantir que funcione
  const spawnOptions = {
    cwd: projectRoot,
    stdio: 'pipe'
  };

  if (process.platform === 'win32') {
    spawnOptions.shell = true;
  }

  imageProxyProcess = spawn(pythonCmd, uvicornArgs, spawnOptions);

  // Log de saída
  imageProxyProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`[IMAGE-PROXY] ${output}`);
    }
  });

  imageProxyProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    // Filtrar avisos comuns do uvicorn
    if (!output.includes('WARNING:') && !output.includes('INFO:')) {
      console.error(`[IMAGE-PROXY] [ERRO] ${output}`);
    }
  });

  // Quando o processo terminar
  imageProxyProcess.on('close', (code) => {
    console.log(`[IMAGE-PROXY] Processo finalizado com código ${code}`);
    const wasSkipped = imageProxyProcess._skipRestart;
    imageProxyProcess = null;
    
    // Se não foi intencional e não foi marcado para pular reinicialização
    if (code !== 0 && code !== null && !wasSkipped && restartAttempts < maxRestartAttempts) {
      restartAttempts++;
      console.log(`[IMAGE-PROXY] Tentando reiniciar em 5 segundos... (tentativa ${restartAttempts}/${maxRestartAttempts})`);
      setTimeout(() => {
        if (!imageProxyProcess) {
          // Tratar promise para evitar unhandledRejection
          startImageProxy().catch((error) => {
            console.error('[IMAGE-PROXY] Erro ao reiniciar:', error.message);
            restartAttempts = maxRestartAttempts; // Parar tentativas
          });
        }
      }, 5000);
    } else if (restartAttempts >= maxRestartAttempts) {
      console.log('[IMAGE-PROXY] ⚠️ Muitas tentativas de reinicialização. Parando tentativas automáticas.');
      console.log('[IMAGE-PROXY] 💡 Verifique se a porta está disponível ou se há problemas de permissão.');
    }
  });

  // Tratar erros
  imageProxyProcess.on('error', (error) => {
    if (error.code === 'ENOENT') {
      console.error('[IMAGE-PROXY] ❌ Python não encontrado! Instale Python 3.8+ e tente novamente.');
      console.error('[IMAGE-PROXY] 💡 Dica: Verifique se Python está no PATH do sistema');
    } else {
      console.error(`[IMAGE-PROXY] ❌ Erro ao iniciar: ${error.message}`);
    }
    imageProxyProcess = null;
  });

  // Capturar erros de stderr que indicam problemas de porta
  imageProxyProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('WinError 10013') || output.includes('address already in use') || output.includes('EADDRINUSE')) {
      console.error('[IMAGE-PROXY] ❌ Erro: Porta 8000 está em uso ou bloqueada por permissões');
      console.error('[IMAGE-PROXY] 💡 Soluções:');
      console.error('[IMAGE-PROXY]    1. Encerre o processo que está usando a porta 8000');
      console.error('[IMAGE-PROXY]    2. Execute como administrador');
      console.error('[IMAGE-PROXY]    3. Use uma porta diferente definindo IMAGE_PROXY_PORT no .env');
      // Não tentar reiniciar se for erro de porta
      if (imageProxyProcess) {
        imageProxyProcess._skipRestart = true;
      }
    }
  });

  // Aguardar um pouco para verificar se iniciou corretamente
  setTimeout(() => {
    if (imageProxyProcess && !imageProxyProcess.killed) {
      const port = process.env.IMAGE_PROXY_PORT || '8000';
      console.log(`[IMAGE-PROXY] ✅ API iniciada com sucesso na porta ${port}`);
      restartAttempts = 0; // Resetar contador se iniciou com sucesso
    }
  }, 2000);
}

/**
 * Para a API Python Image Proxy
 */
function stopImageProxy() {
  if (imageProxyProcess) {
    console.log('[IMAGE-PROXY] Parando API...');
    imageProxyProcess.kill();
    imageProxyProcess = null;
  }
}

// Parar ao encerrar o processo Node.js
process.on('SIGINT', () => {
  stopImageProxy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopImageProxy();
  process.exit(0);
});

module.exports = {
  startImageProxy,
  stopImageProxy
};



