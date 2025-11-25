// Estado da aplicação
let state = {
  connected: false,
  reading: false,
  currentRead: null,
  readings: [],
  error: null
};

// Elementos DOM
const elements = {
  statusConnection: document.getElementById('status-connection'),
  statusReading: document.getElementById('status-reading'),
  portSelect: document.getElementById('port-select'),
  refreshPortsBtn: document.getElementById('refresh-ports-btn'),
  baudRate: document.getElementById('baud-rate'),
  connectBtn: document.getElementById('connect-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  startReadingBtn: document.getElementById('start-reading-btn'),
  stopReadingBtn: document.getElementById('stop-reading-btn'),
  currentRead: document.getElementById('current-read'),
  readingsHistory: document.getElementById('readings-history'),
  readCount: document.getElementById('read-count'),
  clearHistoryBtn: document.getElementById('clear-history-btn')
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  // Configurar event listeners
  setupEventListeners();
  
  // Carregar portas disponíveis
  await loadPorts();
  
  // Verificar status atual
  await updateStatus();
  
  // Configurar listeners de eventos do RFID
  setupRFIDListeners();
});

function setupEventListeners() {
  elements.refreshPortsBtn.addEventListener('click', loadPorts);
  elements.connectBtn.addEventListener('click', connect);
  elements.disconnectBtn.addEventListener('click', disconnect);
  elements.startReadingBtn.addEventListener('click', startReading);
  elements.stopReadingBtn.addEventListener('click', stopReading);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
}

function setupRFIDListeners() {
  // Escutar dados do RFID
  window.rfidAPI.onData((data) => {
    handleRFIDData(data);
  });
  
  // Escutar erros
  window.rfidAPI.onError((error) => {
    showError(error);
  });
}

async function loadPorts() {
  try {
    elements.portSelect.innerHTML = '<option value="">Detectando leitores RFID...</option>';
    elements.portSelect.disabled = true;
    
    // Buscar todos os tipos de dispositivos
    const [portsResult, btSerialResult] = await Promise.allSettled([
      window.rfidAPI.listPorts(),
      window.rfidAPI.scanBluetoothSerial().catch(() => ({ success: false, devices: [] }))
    ]);
    
    const allDevices = [];
    
    // Adicionar portas seriais, HID e USB
    if (portsResult.status === 'fulfilled' && portsResult.value.success) {
      allDevices.push(...(portsResult.value.ports || []));
    }
    
    // Adicionar Bluetooth Serial
    if (btSerialResult.status === 'fulfilled' && btSerialResult.value.success) {
      allDevices.push(...(btSerialResult.value.devices || []));
    }
    
    elements.portSelect.innerHTML = '<option value="">Selecione um leitor RFID...</option>';
    
    if (allDevices.length > 0) {
      // Agrupar por tipo para melhor visualização
      const serialPorts = allDevices.filter(p => p.type === 'serial');
      const hidDevices = allDevices.filter(p => p.type === 'hid');
      const usbDevices = allDevices.filter(p => p.type === 'usb');
      const bluetoothSerialDevices = allDevices.filter(p => p.type === 'bluetoothSerial');
      
      // Adicionar portas seriais
      if (serialPorts.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Portas Seriais';
        serialPorts.forEach(port => {
          const option = document.createElement('option');
          option.value = port.id || port.path;
          option.textContent = port.friendlyName || port.path;
          optgroup.appendChild(option);
        });
        elements.portSelect.appendChild(optgroup);
      }
      
      // Adicionar dispositivos HID
      if (hidDevices.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Dispositivos HID';
        hidDevices.forEach(port => {
          const option = document.createElement('option');
          option.value = port.id;
          option.textContent = port.friendlyName || `HID ${port.vendorId}:${port.productId}`;
          optgroup.appendChild(option);
        });
        elements.portSelect.appendChild(optgroup);
      }
      
      // Adicionar dispositivos USB
      if (usbDevices.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'USB Direto';
        usbDevices.forEach(port => {
          const option = document.createElement('option');
          option.value = port.id;
          option.textContent = port.friendlyName || `USB ${port.vendorId}:${port.productId}`;
          optgroup.appendChild(option);
        });
        elements.portSelect.appendChild(optgroup);
      }
      
      // Adicionar Bluetooth Serial
      if (bluetoothSerialDevices.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = '📶 Bluetooth Serial (SPP)';
        bluetoothSerialDevices.forEach(port => {
          const option = document.createElement('option');
          option.value = port.id || `bluetoothSerial:${port.address}`;
          option.textContent = port.friendlyName || port.name || port.address;
          optgroup.appendChild(option);
        });
        elements.portSelect.appendChild(optgroup);
      }
      
      // Botão para buscar Bluetooth BLE
      const btBleOption = document.createElement('option');
      btBleOption.value = '__scan_ble__';
      btBleOption.textContent = '📱 Buscar Bluetooth (BLE)...';
      elements.portSelect.appendChild(btBleOption);
    } else {
      elements.portSelect.innerHTML = '<option value="">Nenhum leitor RFID encontrado</option>';
      const btBleOption = document.createElement('option');
      btBleOption.value = '__scan_ble__';
      btBleOption.textContent = '📱 Buscar Bluetooth (BLE)...';
      elements.portSelect.appendChild(btBleOption);
      showError('Nenhum leitor RFID detectado. Clique em "Buscar Bluetooth" para procurar leitores Bluetooth.');
    }
  } catch (error) {
    showError(`Erro ao detectar leitores: ${error.message}`);
    elements.portSelect.innerHTML = '<option value="">Erro ao detectar leitores</option>';
  } finally {
    elements.portSelect.disabled = false;
  }
}

// Handler para busca Bluetooth BLE
elements.portSelect.addEventListener('change', async (e) => {
  if (e.target.value === '__scan_ble__') {
    try {
      elements.portSelect.disabled = true;
      showSuccess('Buscando dispositivos Bluetooth... Isso pode levar alguns segundos.');
      
      const result = await window.rfidAPI.scanBluetooth();
      
      if (result.success && result.devices && result.devices.length > 0) {
        // Adicionar dispositivos BLE encontrados
        const optgroup = document.createElement('optgroup');
        optgroup.label = '📱 Bluetooth (BLE)';
        
        result.devices.forEach(device => {
          const option = document.createElement('option');
          option.value = `bluetooth:${device.id || device.uuid || device.address}`;
          option.textContent = device.friendlyName || device.name || device.address;
          optgroup.appendChild(option);
        });
        
        // Remover opção de busca e adicionar dispositivos
        e.target.remove(e.target.selectedIndex);
        e.target.appendChild(optgroup);
        
        showSuccess(`${result.devices.length} dispositivo(s) Bluetooth encontrado(s)!`);
      } else {
        showError('Nenhum dispositivo Bluetooth encontrado. Verifique se o leitor está ligado e próximo.');
      }
    } catch (error) {
      showError(`Erro ao buscar Bluetooth: ${error.message}`);
    } finally {
      elements.portSelect.disabled = false;
      e.target.value = '';
    }
  }
});

async function connect() {
  const deviceId = elements.portSelect.value;
  if (!deviceId) {
    showError('Por favor, selecione um leitor RFID');
    return;
  }
  
  try {
    elements.connectBtn.disabled = true;
    elements.connectBtn.textContent = 'Conectando...';
    
    // Para dispositivos serial, ainda usar baudRate
    // Para HID/USB, baudRate é ignorado
    const baudRate = parseInt(elements.baudRate.value);
    const result = await window.rfidAPI.connect(deviceId, { baudRate });
    
    if (result.success) {
      state.connected = true;
      updateUI();
      showSuccess('Conectado com sucesso!');
    } else {
      showError(`Erro ao conectar: ${result.error}`);
    }
  } catch (error) {
    showError(`Erro ao conectar: ${error.message}`);
  } finally {
    elements.connectBtn.disabled = false;
    elements.connectBtn.textContent = 'Conectar';
  }
}

async function disconnect() {
  try {
    await stopReading();
    
    const result = await window.rfidAPI.disconnect();
    
    if (result.success) {
      state.connected = false;
      state.reading = false;
      state.currentRead = null;
      updateUI();
      showSuccess('Desconectado com sucesso');
    } else {
      showError(`Erro ao desconectar: ${result.error}`);
    }
  } catch (error) {
    showError(`Erro ao desconectar: ${error.message}`);
  }
}

async function startReading() {
  try {
    const result = await window.rfidAPI.startReading();
    
    if (result.success) {
      state.reading = true;
      updateUI();
      showSuccess('Leitura iniciada');
    } else {
      showError(`Erro ao iniciar leitura: ${result.error}`);
    }
  } catch (error) {
    showError(`Erro ao iniciar leitura: ${error.message}`);
  }
}

async function stopReading() {
  try {
    const result = await window.rfidAPI.stopReading();
    
    if (result.success) {
      state.reading = false;
      updateUI();
    } else {
      showError(`Erro ao parar leitura: ${result.error}`);
    }
  } catch (error) {
    showError(`Erro ao parar leitura: ${error.message}`);
  }
}

async function updateStatus() {
  try {
    const status = await window.rfidAPI.getStatus();
    state.connected = status.connected;
    state.reading = status.reading;
    updateUI();
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
  }
}

function handleRFIDData(data) {
  // Atualizar leitura atual
  state.currentRead = {
    ...data,
    timestamp: new Date(data.timestamp).toLocaleString('pt-BR')
  };
  
  // Adicionar ao histórico (evitar duplicatas muito próximas)
  const isDuplicate = state.readings.some(read => 
    read.epc === data.epc && 
    Math.abs(new Date(read.timestamp) - new Date(data.timestamp)) < 2000
  );
  
  if (!isDuplicate) {
    state.readings.unshift({
      ...data,
      timestamp: new Date(data.timestamp).toLocaleString('pt-BR')
    });
    
    // Limitar histórico (configurável via constante no topo do arquivo)
    const MAX_HISTORY = 100;
    if (state.readings.length > MAX_HISTORY) {
      state.readings = state.readings.slice(0, MAX_HISTORY);
    }
  }
  
  // Buscar SKU completo se tiver barcode
  if (data.barcode) {
    lookupSKU(data);
  }
  
  updateUI();
}

async function lookupSKU(data) {
  // A busca de SKU agora é feita automaticamente pelo rfid-reader.js
  // quando está conectado ao PostgreSQL (se configurado em config.js)
  // Não é necessário fazer nada aqui, os dados já vêm preenchidos
}

function updateUI() {
  // Atualizar status
  if (state.connected) {
    elements.statusConnection.textContent = 'Conectado';
    elements.statusConnection.className = 'status-badge connected';
    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.startReadingBtn.disabled = false;
    elements.portSelect.disabled = true;
  } else {
    elements.statusConnection.textContent = 'Desconectado';
    elements.statusConnection.className = 'status-badge disconnected';
    elements.connectBtn.disabled = false;
    elements.disconnectBtn.disabled = true;
    elements.startReadingBtn.disabled = true;
    elements.stopReadingBtn.disabled = true;
    elements.portSelect.disabled = false;
  }
  
  if (state.reading) {
    elements.statusReading.textContent = 'Lendo';
    elements.statusReading.className = 'status-badge reading';
    elements.startReadingBtn.disabled = true;
    elements.stopReadingBtn.disabled = false;
  } else {
    elements.statusReading.textContent = 'Parado';
    elements.statusReading.className = 'status-badge stopped';
    elements.startReadingBtn.disabled = !state.connected;
    elements.stopReadingBtn.disabled = true;
  }
  
  // Atualizar leitura atual
  if (state.currentRead) {
    elements.currentRead.innerHTML = createReadingHTML(state.currentRead, true);
  } else {
    elements.currentRead.innerHTML = `
      <div class="read-placeholder">
        <p>Nenhuma tag lida ainda</p>
        <small>Aproxime uma tag RFID do leitor</small>
      </div>
    `;
  }
  
  // Atualizar histórico
  elements.readCount.textContent = state.readings.length;
  
  if (state.readings.length > 0) {
    elements.readingsHistory.innerHTML = state.readings
      .map((read, index) => createReadingHTML(read, index === 0))
      .join('');
  } else {
    elements.readingsHistory.innerHTML = `
      <div class="empty-history">
        <p>Nenhuma leitura registrada</p>
      </div>
    `;
  }
}

function createReadingHTML(read, isCurrent = false) {
  const sku = read.sku || read.vpm || 'N/A';
  const variant = read.variant || (read.color && read.size ? `${read.color} - ${read.size}` : 'N/A');
  
  return `
    <div class="reading-item ${isCurrent ? 'current' : ''}">
      <div class="reading-header">
        <h3>EPC: ${read.epc || read.epcRaw || 'N/A'}</h3>
        <span class="reading-time">${read.timestamp || new Date().toLocaleString('pt-BR')}</span>
      </div>
      <div class="reading-details">
        <div class="detail-item">
          <span class="detail-label">SKU/VPM</span>
          <span class="detail-value sku">${sku}</span>
        </div>
        ${variant !== 'N/A' ? `
        <div class="detail-item">
          <span class="detail-label">Variant</span>
          <span class="detail-value">${variant}</span>
        </div>
        ` : ''}
        ${read.barcode ? `
        <div class="detail-item">
          <span class="detail-label">Barcode</span>
          <span class="detail-value">${read.barcode}</span>
        </div>
        ` : ''}
        ${read.poNumber ? `
        <div class="detail-item">
          <span class="detail-label">PO Number</span>
          <span class="detail-value">${read.poNumber}</span>
        </div>
        ` : ''}
        ${read.error ? `
        <div class="detail-item">
          <span class="detail-label">Erro</span>
          <span class="detail-value error">${read.error}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function clearHistory() {
  state.readings = [];
  state.currentRead = null;
  updateUI();
  showSuccess('Histórico limpo');
}

function showError(message) {
  state.error = message;
  console.error(message);
  
  // Remover mensagens anteriores
  const existingErrors = document.querySelectorAll('.error-message');
  existingErrors.forEach(el => el.remove());
  
  // Adicionar nova mensagem de erro
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  document.querySelector('.container').insertBefore(errorDiv, document.querySelector('main'));
  
  // Remover após 5 segundos
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function showSuccess(message) {
  // Remover mensagens anteriores
  const existingMessages = document.querySelectorAll('.success-message');
  existingMessages.forEach(el => el.remove());
  
  // Adicionar nova mensagem de sucesso
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  document.querySelector('.container').insertBefore(successDiv, document.querySelector('main'));
  
  // Remover após 3 segundos
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}


