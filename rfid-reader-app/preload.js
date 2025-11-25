const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rfidAPI', {
  // Listar portas disponíveis
  listPorts: () => ipcRenderer.invoke('rfid:list-ports'),
  
  // Buscar dispositivos Bluetooth
  scanBluetooth: () => ipcRenderer.invoke('rfid:scan-bluetooth'),
  
  // Buscar dispositivos Bluetooth Serial
  scanBluetoothSerial: () => ipcRenderer.invoke('rfid:scan-bluetooth-serial'),
  
  // Conectar ao leitor
  connect: (deviceId, options) => ipcRenderer.invoke('rfid:connect', deviceId, options),
  
  // Desconectar
  disconnect: () => ipcRenderer.invoke('rfid:disconnect'),
  
  // Iniciar leitura
  startReading: () => ipcRenderer.invoke('rfid:start-reading'),
  
  // Parar leitura
  stopReading: () => ipcRenderer.invoke('rfid:stop-reading'),
  
  // Obter status
  getStatus: () => ipcRenderer.invoke('rfid:get-status'),
  
  // Eventos
  onData: (callback) => {
    ipcRenderer.on('rfid:data', (event, data) => callback(data));
  },
  
  onError: (callback) => {
    ipcRenderer.on('rfid:error', (event, error) => callback(error));
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

