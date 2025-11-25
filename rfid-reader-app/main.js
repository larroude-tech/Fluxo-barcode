const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// Usar versão com conexão direta que suporta HID/USB
const RFIDReader = require('./rfid-reader-direct');

let mainWindow;
let rfidReader = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Abrir DevTools em desenvolvimento
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (rfidReader) {
      rfidReader.disconnect();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (rfidReader) {
    rfidReader.disconnect();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('rfid:list-ports', async () => {
  try {
    if (!rfidReader) {
      rfidReader = new RFIDReader();
    }
    const ports = await rfidReader.listPorts();
    return { success: true, ports };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:scan-bluetooth', async () => {
  try {
    if (!rfidReader) {
      rfidReader = new RFIDReader();
    }
    const devices = await rfidReader.scanBluetooth();
    return { success: true, devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:scan-bluetooth-serial', async () => {
  try {
    if (!rfidReader) {
      rfidReader = new RFIDReader();
    }
    const devices = await rfidReader.scanBluetoothSerial();
    return { success: true, devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:connect', async (event, deviceId, options) => {
  try {
    if (!rfidReader) {
      rfidReader = new RFIDReader();
    }
    // Agora aceita deviceId que pode ser serial:, hid: ou usb:
    await rfidReader.connect(deviceId, options);
    
    // Enviar dados lidos para o renderer
    rfidReader.on('data', (data) => {
      mainWindow.webContents.send('rfid:data', data);
    });
    
    rfidReader.on('error', (error) => {
      mainWindow.webContents.send('rfid:error', error.message);
    });
    
    rfidReader.on('connected', () => {
      mainWindow.webContents.send('rfid:connected');
    });
    
    rfidReader.on('disconnected', () => {
      mainWindow.webContents.send('rfid:disconnected');
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:disconnect', async () => {
  try {
    if (rfidReader) {
      await rfidReader.disconnect();
      rfidReader = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:start-reading', async () => {
  try {
    if (!rfidReader || !rfidReader.isConnected()) {
      return { success: false, error: 'Leitor não conectado' };
    }
    await rfidReader.startReading();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:stop-reading', async () => {
  try {
    if (rfidReader) {
      await rfidReader.stopReading();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rfid:get-status', async () => {
  try {
    if (!rfidReader) {
      return { connected: false, reading: false };
    }
    return {
      connected: rfidReader.isConnected(),
      reading: rfidReader.isReadingActive()
    };
  } catch (error) {
    return { connected: false, reading: false, error: error.message };
  }
});

