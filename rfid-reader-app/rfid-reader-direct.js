/**
 * Módulo de conexão direta com leitor RFID
 * Suporta múltiplos métodos: Serial, HID, USB direto
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');
const config = require('./src/infrastructure/config/config');
const DatabaseQuery = require('./db-query');

// Tentar carregar bibliotecas opcionais
let HID, USB, Noble, BluetoothSerialPort;
try {
  HID = require('node-hid');
} catch (e) {
  console.log('[RFID] node-hid não instalado (opcional)');
}

try {
  USB = require('usb');
} catch (e) {
  console.log('[RFID] usb não instalado (opcional)');
}

try {
  Noble = require('@abandonware/noble');
} catch (e) {
  console.log('[RFID] @abandonware/noble não instalado (opcional para Bluetooth)');
}

try {
  BluetoothSerialPort = require('bluetooth-serial-port');
} catch (e) {
  console.log('[RFID] bluetooth-serial-port não instalado (opcional para Bluetooth Serial)');
}

class RFIDReaderDirect extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.isReading = false;
    this.readingInterval = null;
    this.lastReadTags = new Map();
    this.dbQuery = null;
    this.connectionType = null; // 'serial', 'hid', 'usb'
    this.hidDevice = null;
    this.usbDevice = null;
    this.bluetoothDevice = null;
    this.bluetoothSerial = null;
    
    // Inicializar busca no banco se configurado
    if (config.database && config.database.enabled) {
      this.dbQuery = new DatabaseQuery(config.database);
      this.dbQuery.connect().catch(err => {
        console.warn('[RFID-Reader] Banco de dados não disponível, funcionando sem busca de SKU');
      });
    }
  }

  /**
   * Detecta leitores RFID disponíveis usando múltiplos métodos
   */
  async detectReaders() {
    const readers = {
      serial: [],
      hid: [],
      usb: [],
      bluetooth: [],
      bluetoothSerial: [],
      all: []
    };

    // 1. Detectar portas seriais
    try {
      const serialPorts = await SerialPort.list();
      readers.serial = serialPorts.map(port => ({
        type: 'serial',
        path: port.path,
        manufacturer: port.manufacturer || 'Desconhecido',
        vendorId: port.vendorId,
        productId: port.productId,
        friendlyName: `${port.path} - ${port.manufacturer || 'Desconhecido'}`,
        id: `serial:${port.path}`
      }));
    } catch (error) {
      console.error('[RFID] Erro ao detectar portas seriais:', error.message);
    }

    // 2. Detectar dispositivos HID (Human Interface Device)
    if (HID) {
      try {
        const hidDevices = HID.devices();
        // Filtrar possíveis leitores RFID (vendor IDs comuns)
        const rfidVendors = [
          0x0acd, // Feig Electronic (comum em leitores RFID)
          0x0483, // STMicroelectronics
          0x1a86, // QinHeng Electronics
          0x04b4, // Cypress Semiconductor
        ];

        const rfidHIDDevices = hidDevices.filter(device => 
          device.vendorId && rfidVendors.includes(device.vendorId)
        );

        readers.hid = rfidHIDDevices.map(device => ({
          type: 'hid',
          path: device.path,
          vendorId: device.vendorId,
          productId: device.productId,
          manufacturer: device.manufacturer || 'Desconhecido',
          product: device.product || 'Leitor RFID',
          friendlyName: `${device.manufacturer || 'RFID'} ${device.product || device.vendorId}:${device.productId}`,
          id: `hid:${device.vendorId}:${device.productId}`
        }));
      } catch (error) {
        console.error('[RFID] Erro ao detectar dispositivos HID:', error.message);
      }
    }

    // 3. Detectar dispositivos USB direto
    if (USB) {
      try {
        const usbDevices = USB.getDeviceList();
        const rfidUSBDevices = usbDevices
          .filter(device => {
            // Filtrar por vendor IDs comuns de leitores RFID
            const vid = device.deviceDescriptor.idVendor;
            const rfidVendors = [0x0acd, 0x0483, 0x1a86, 0x04b4];
            return rfidVendors.includes(vid);
          })
          .map(device => ({
            type: 'usb',
            vendorId: device.deviceDescriptor.idVendor,
            productId: device.deviceDescriptor.idProduct,
            id: `usb:${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`,
            friendlyName: `USB RFID Reader (${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct})`,
            device: device
          }));

        readers.usb = rfidUSBDevices;
      } catch (error) {
        console.error('[RFID] Erro ao detectar dispositivos USB:', error.message);
      }
    }

    // 4. Detectar dispositivos Bluetooth via Noble
    if (Noble) {
      try {
        // Noble precisa ser iniciado primeiro
        if (Noble.state === 'poweredOn') {
          const bluetoothDevices = [];
          // A busca via BLE será feita sob demanda quando o usuário solicitar
          readers.bluetooth = [];
        } else {
          console.log('[RFID] Bluetooth precisa ser habilitado para busca');
          readers.bluetooth = [];
        }
      } catch (error) {
        console.error('[RFID] Erro ao detectar Bluetooth (BLE):', error.message);
      }
    }

    // 5. Detectar dispositivos Bluetooth Serial (SPP)
    if (BluetoothSerialPort) {
      try {
        const BtSerialPort = BluetoothSerialPort.BluetoothSerialPort;
        // A busca de Bluetooth Serial será feita sob demanda
        readers.bluetoothSerial = [];
      } catch (error) {
        console.error('[RFID] Erro ao detectar Bluetooth Serial:', error.message);
      }
    }

    // Combinar todos
    readers.all = [...readers.serial, ...readers.hid, ...readers.usb, ...readers.bluetooth, ...readers.bluetoothSerial];

    return readers;
  }

  /**
   * Busca dispositivos Bluetooth
   */
  async scanBluetooth() {
    if (!Noble) {
      throw new Error('@abandonware/noble não está instalado. Execute: npm install @abandonware/noble');
    }

    return new Promise((resolve, reject) => {
      const foundDevices = [];
      const timeout = setTimeout(() => {
        Noble.stopScanning();
        resolve(foundDevices);
      }, 10000); // 10 segundos de busca

      Noble.on('stateChange', (state) => {
        if (state === 'poweredOn') {
          Noble.startScanning([], true); // Buscar todos os serviços
        } else {
          Noble.stopScanning();
          reject(new Error('Bluetooth não está habilitado'));
        }
      });

      Noble.on('discover', (peripheral) => {
        // Filtrar por nome ou características de leitores RFID
        const name = peripheral.advertisement.localName || '';
        const isRFIDReader = 
          name.toLowerCase().includes('rfid') ||
          name.toLowerCase().includes('reader') ||
          name.toLowerCase().includes('scanner');
        
        if (isRFIDReader || foundDevices.length < 5) {
          foundDevices.push({
            type: 'bluetooth',
            id: peripheral.id,
            uuid: peripheral.uuid,
            address: peripheral.address,
            name: name || peripheral.id,
            rssi: peripheral.rssi,
            friendlyName: name || `Bluetooth ${peripheral.address}`,
            peripheral: peripheral
          });
        }
      });

      if (Noble.state === 'poweredOn') {
        Noble.startScanning([], true);
      } else {
        clearTimeout(timeout);
        reject(new Error('Bluetooth não está habilitado. Habilite o Bluetooth e tente novamente.'));
      }
    });
  }

  /**
   * Busca dispositivos Bluetooth Serial (SPP)
   */
  async scanBluetoothSerial() {
    if (!BluetoothSerialPort) {
      throw new Error('bluetooth-serial-port não está instalado. Execute: npm install bluetooth-serial-port');
    }

    return new Promise((resolve, reject) => {
      const BtSerialPort = BluetoothSerialPort.BluetoothSerialPort;
      const foundDevices = [];

      BtSerialPort.listPairedDevices((list) => {
        // Filtrar leitores RFID por nome
        const rfidDevices = list.filter(device => {
          const name = (device.name || '').toLowerCase();
          return name.includes('rfid') || 
                 name.includes('reader') || 
                 name.includes('scanner');
        });

        rfidDevices.forEach(device => {
          foundDevices.push({
            type: 'bluetoothSerial',
            id: device.address,
            address: device.address,
            name: device.name || device.address,
            friendlyName: device.name || `Bluetooth Serial ${device.address}`,
            device: device
          });
        });

        resolve(foundDevices);
      }, (err) => {
        reject(err);
      });
    });
  }

  /**
   * Lista todas as portas/dispositivos disponíveis
   */
  async listPorts() {
    const detection = await this.detectReaders();
    return detection.all;
  }

  /**
   * Conecta ao leitor usando o método apropriado
   */
  async connect(deviceId, options = {}) {
    // Determinar tipo de conexão pelo deviceId
    if (deviceId.startsWith('serial:')) {
      return this.connectSerial(deviceId.replace('serial:', ''), options);
    } else if (deviceId.startsWith('hid:')) {
      return this.connectHID(deviceId, options);
    } else if (deviceId.startsWith('usb:')) {
      return this.connectUSB(deviceId, options);
    } else if (deviceId.startsWith('bluetooth:')) {
      return this.connectBluetooth(deviceId, options);
    } else if (deviceId.startsWith('bluetoothSerial:')) {
      return this.connectBluetoothSerial(deviceId, options);
    } else {
      // Tentar como serial por padrão
      return this.connectSerial(deviceId, options);
    }
  }

  /**
   * Conecta via porta serial (método tradicional)
   */
  async connectSerial(portPath, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const defaultOptions = {
          baudRate: options.baudRate || config.defaultBaudRate,
          dataBits: options.dataBits || 8,
          stopBits: options.stopBits || 1,
          parity: options.parity || 'none',
          rtscts: options.rtscts !== undefined ? options.rtscts : true,
          autoOpen: false
        };

        this.port = new SerialPort({
          path: portPath,
          ...defaultOptions
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        this.port.on('open', () => {
          console.log('✅ Conectado ao leitor RFID (Serial):', portPath);
          this.connectionType = 'serial';
          this.emit('connected');
          resolve();
        });

        this.port.on('error', (error) => {
          console.error('Erro na conexão serial:', error);
          this.emit('error', error);
          reject(error);
        });

        this.port.on('close', () => {
          console.log('Conexão serial fechada');
          this.isReading = false;
          this.connectionType = null;
          this.emit('disconnected');
        });

        this.parser.on('data', (data) => {
          this.processRFIDData(data.toString().trim());
        });

        this.port.open((error) => {
          if (error) {
            console.error('Erro ao abrir porta serial:', error);
            reject(error);
          }
        });

      } catch (error) {
        console.error('Erro ao conectar serial:', error);
        reject(error);
      }
    });
  }

  /**
   * Conecta via HID (Human Interface Device)
   */
  async connectHID(deviceId, options = {}) {
    if (!HID) {
      throw new Error('node-hid não está instalado. Execute: npm install node-hid');
    }

    try {
      // Parse deviceId: hid:vendorId:productId
      const parts = deviceId.split(':');
      const vendorId = parseInt(parts[1], 16);
      const productId = parseInt(parts[2], 16);

      // Encontrar dispositivo
      const devices = HID.devices();
      const device = devices.find(d => 
        d.vendorId === vendorId && d.productId === productId && d.path
      );

      if (!device || !device.path) {
        throw new Error(`Dispositivo HID não encontrado: ${deviceId}`);
      }

      this.hidDevice = new HID.HID(device.path);
      this.connectionType = 'hid';

      // Ler dados do HID
      this.hidDevice.on('data', (data) => {
        // Converter buffer para string
        const dataStr = data.toString('utf8').trim();
        if (dataStr) {
          this.processRFIDData(dataStr);
        }
      });

      this.hidDevice.on('error', (error) => {
        console.error('Erro no dispositivo HID:', error);
        this.emit('error', error);
      });

      console.log('✅ Conectado ao leitor RFID (HID):', deviceId);
      this.emit('connected');
      return true;

    } catch (error) {
      console.error('Erro ao conectar HID:', error);
      throw error;
    }
  }

  /**
   * Conecta via USB direto
   */
  async connectUSB(deviceId, options = {}) {
    if (!USB) {
      throw new Error('usb não está instalado. Execute: npm install usb');
    }

    try {
      // Parse deviceId: usb:vendorId:productId
      const parts = deviceId.split(':');
      const vendorId = parseInt(parts[1], 16);
      const productId = parseInt(parts[2], 16);

      const device = USB.findByIds(vendorId, productId);
      
      if (!device) {
        throw new Error(`Dispositivo USB não encontrado: ${deviceId}`);
      }

      device.open();
      
      // Tentar configurar interface (ajustar conforme necessário)
      if (device.interfaces.length > 0) {
        const intf = device.interfaces[0];
        if (intf.isKernelDriverActive()) {
          intf.detachKernelDriver();
        }
        intf.claim();
      }

      this.usbDevice = device;
      this.connectionType = 'usb';

      // Configurar leitura (ajustar endpoints conforme necessário)
      if (device.interfaces.length > 0) {
        const intf = device.interfaces[0];
        const endpoints = intf.endpoints;
        
        // Encontrar endpoint de entrada (IN)
        const inEndpoint = endpoints.find(ep => ep.direction === 'in');
        
        if (inEndpoint) {
          // Iniciar leitura contínua
          inEndpoint.startPoll(1, 64);
          inEndpoint.on('data', (data) => {
            const dataStr = data.toString('utf8').trim();
            if (dataStr) {
              this.processRFIDData(dataStr);
            }
          });

          inEndpoint.on('error', (error) => {
            console.error('Erro no endpoint USB:', error);
            this.emit('error', error);
          });
        }
      }

      console.log('✅ Conectado ao leitor RFID (USB):', deviceId);
      this.emit('connected');
      return true;

    } catch (error) {
      console.error('Erro ao conectar USB:', error);
      throw error;
    }
  }

  /**
   * Conecta via Bluetooth (BLE - Bluetooth Low Energy)
   */
  async connectBluetooth(deviceId, options = {}) {
    if (!Noble) {
      throw new Error('@abandonware/noble não está instalado. Execute: npm install @abandonware/noble');
    }

    return new Promise((resolve, reject) => {
      // Parse deviceId: bluetooth:uuid ou bluetooth:address
      const parts = deviceId.split(':');
      const deviceIdentifier = parts.slice(1).join(':'); // Pode ser UUID ou address

      if (Noble.state !== 'poweredOn') {
        reject(new Error('Bluetooth não está habilitado. Habilite o Bluetooth e tente novamente.'));
        return;
      }

      Noble.startScanning([], true);

      const timeout = setTimeout(() => {
        Noble.stopScanning();
        reject(new Error('Timeout ao conectar ao dispositivo Bluetooth'));
      }, 15000);

      Noble.on('discover', (peripheral) => {
        if (peripheral.id === deviceIdentifier || peripheral.address === deviceIdentifier || peripheral.uuid === deviceIdentifier) {
          clearTimeout(timeout);
          Noble.stopScanning();

          peripheral.connect((error) => {
            if (error) {
              reject(error);
              return;
            }

            this.bluetoothDevice = peripheral;
            this.connectionType = 'bluetooth';

            // Descobrir serviços e características
            peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
              if (error) {
                reject(error);
                return;
              }

              // Procurar característica de notificação/leitura
              const readCharacteristic = characteristics.find(char => 
                char.properties.includes('read') || char.properties.includes('notify')
              );

              if (readCharacteristic) {
                // Subscrever a notificações
                if (readCharacteristic.properties.includes('notify')) {
                  readCharacteristic.notify(true);
                  readCharacteristic.on('data', (data) => {
                    const dataStr = data.toString('utf8').trim();
                    if (dataStr) {
                      this.processRFIDData(dataStr);
                    }
                  });
                } else {
                  // Ler periodicamente
                  setInterval(() => {
                    readCharacteristic.read((error, data) => {
                      if (!error && data) {
                        const dataStr = data.toString('utf8').trim();
                        if (dataStr) {
                          this.processRFIDData(dataStr);
                        }
                      }
                    });
                  }, config.readInterval || 100);
                }
              }

              console.log('✅ Conectado ao leitor RFID (Bluetooth):', deviceIdentifier);
              this.emit('connected');
              resolve(true);
            });
          });
        }
      });
    });
  }

  /**
   * Conecta via Bluetooth Serial (SPP - Serial Port Profile)
   */
  async connectBluetoothSerial(deviceId, options = {}) {
    if (!BluetoothSerialPort) {
      throw new Error('bluetooth-serial-port não está instalado. Execute: npm install bluetooth-serial-port');
    }

    return new Promise((resolve, reject) => {
      const BtSerialPort = BluetoothSerialPort.BluetoothSerialPort;
      
      // Parse deviceId: bluetoothSerial:address
      const parts = deviceId.split(':');
      const address = parts.slice(1).join(':');

      this.bluetoothSerial = new BtSerialPort();

      this.bluetoothSerial.findSerialPortChannel(address, (channel) => {
        this.bluetoothSerial.connect(address, channel, () => {
          console.log('✅ Conectado ao leitor RFID (Bluetooth Serial):', address);
          this.connectionType = 'bluetoothSerial';

          // Ler dados
          this.bluetoothSerial.on('data', (buffer) => {
            const data = buffer.toString('utf8').trim();
            if (data) {
              this.processRFIDData(data);
            }
          });

          this.bluetoothSerial.on('failure', (error) => {
            console.error('Erro no Bluetooth Serial:', error);
            this.emit('error', error);
          });

          this.emit('connected');
          resolve(true);
        }, (error) => {
          console.error('Erro ao conectar Bluetooth Serial:', error);
          reject(error);
        });
      }, (error) => {
        console.error('Erro ao encontrar canal serial:', error);
        reject(error);
      });
    });
  }

  /**
   * Processa dados recebidos do leitor RFID
   */
  processRFIDData(data) {
    if (!data || data.length === 0) return;

    console.log('Dados recebidos:', data);

    let epc = null;

    // Tentar extrair EPC usando prefixos configurados
    const hasPrefix = config.readerCommands.prefixes.some(prefix => data.startsWith(prefix));
    if (hasPrefix) {
      epc = data.split(':')[1]?.trim();
    } else if (data.startsWith('E200') || data.startsWith('E300')) {
      epc = data.trim();
    } else if (/^[0-9A-F]{24,32}$/i.test(data)) {
      epc = data.trim().toUpperCase();
    } else if (/^[0-9]{24,32}$/.test(data.trim())) {
      epc = data.trim();
    } else {
      const epcMatch = data.match(/([0-9A-F]{24,32})/i) || data.match(/([0-9]{24,32})/);
      if (epcMatch) {
        epc = epcMatch[1].toUpperCase();
      }
    }

    if (epc) {
      const now = Date.now();
      if (this.lastReadTags.has(epc)) {
        const lastReadTime = this.lastReadTags.get(epc);
        if (now - lastReadTime < config.duplicateTimeout) {
          return;
        }
      }
      this.lastReadTags.set(epc, now);

      // Limpar leituras antigas
      for (const [tag, time] of this.lastReadTags.entries()) {
        if (now - time > 5000) {
          this.lastReadTags.delete(tag);
        }
      }

      // Decodificar EPC
      this.decodeEPC(epc).then(decodedData => {
        this.emit('data', {
          epc: epc,
          timestamp: new Date().toISOString(),
          ...decodedData
        });
      }).catch(error => {
        console.error('[RFID-Reader] Erro ao decodificar EPC:', error);
        this.emit('data', {
          epc: epc,
          timestamp: new Date().toISOString(),
          error: error.message
        });
      });
    }
  }

  /**
   * Decodifica o EPC RFID (mesmo método do rfid-reader.js)
   */
  async decodeEPC(epc) {
    try {
      let epcDecimal = epc;
      
      if (/[A-Fa-f]/.test(epc)) {
        try {
          epcDecimal = BigInt('0x' + epc).toString();
        } catch (e) {
          epcDecimal = epc;
        }
      }

      if (epcDecimal.length >= 12) {
        const barcode = epcDecimal.substring(0, 12);
        let poNumber = '0000';
        if (epcDecimal.length >= 16) {
          poNumber = epcDecimal.substring(12, 16);
        }
        
        const result = {
          barcode: barcode,
          poNumber: poNumber,
          epcRaw: epc,
          epcDecimal: epcDecimal,
          sku: null,
          vpm: null,
          variant: null,
          styleName: null,
          color: null,
          size: null
        };
        
        // Buscar no banco se configurado
        if (this.dbQuery && this.dbQuery.isConnected()) {
          try {
            let dbResult = await this.dbQuery.lookupByBarcodeAndPO(barcode, poNumber);
            if (!dbResult) {
              dbResult = await this.dbQuery.lookupByBarcode(barcode);
            }
            
            if (dbResult) {
              result.sku = dbResult.vpm || dbResult.sku;
              result.vpm = dbResult.vpm || dbResult.sku;
              result.variant = dbResult.variant;
              result.styleName = dbResult.styleName;
              result.color = dbResult.color;
              result.size = dbResult.size;
              result.referencia = dbResult.referencia;
              result.qty = dbResult.qty;
              
              if (dbResult.poNumber && dbResult.poNumber !== poNumber) {
                result.poNumber = dbResult.poNumber;
              }
            }
          } catch (dbError) {
            console.warn('[RFID-Reader] Erro ao buscar no banco:', dbError.message);
          }
        }
        
        return result;
      }

      return {
        epcRaw: epc,
        epcDecimal: epcDecimal,
        error: 'Formato EPC não reconhecido (mínimo 12 dígitos)'
      };

    } catch (error) {
      console.error('Erro ao decodificar EPC:', error);
      return {
        epcRaw: epc,
        error: error.message
      };
    }
  }

  /**
   * Inicia leitura contínua
   */
  async startReading() {
    if (!this.isConnected()) {
      throw new Error('Leitor não está conectado');
    }

    if (this.isReading) {
      return;
    }

    this.isReading = true;

    // Método depende do tipo de conexão
    if (this.connectionType === 'serial') {
      // Enviar comandos periódicos para leitores serial
      this.readingInterval = setInterval(() => {
        if (this.port && this.port.isOpen) {
          const command = config.readerCommands.start || 'R\r';
          this.port.write(command, (error) => {
            if (error) {
              console.error('Erro ao enviar comando:', error);
            }
          });
        }
      }, config.readInterval);
    } else if (this.connectionType === 'bluetoothSerial' && this.bluetoothSerial) {
      // Enviar comandos periódicos para Bluetooth Serial
      this.readingInterval = setInterval(() => {
        const command = config.readerCommands.start || 'R\r';
        this.bluetoothSerial.write(Buffer.from(command), (error) => {
          if (error) {
            console.error('Erro ao enviar comando Bluetooth:', error);
          }
        });
      }, config.readInterval);
    } else if (this.connectionType === 'hid' || this.connectionType === 'usb' || this.connectionType === 'bluetooth') {
      // HID/USB/Bluetooth geralmente enviam dados automaticamente
      console.log(`[RFID] Leitura contínua iniciada (${this.connectionType.toUpperCase()})`);
    }
  }

  /**
   * Para a leitura contínua
   */
  async stopReading() {
    this.isReading = false;
    if (this.readingInterval) {
      clearInterval(this.readingInterval);
      this.readingInterval = null;
    }
  }

  /**
   * Desconecta do leitor
   */
  async disconnect() {
    await this.stopReading();
    
    if (this.dbQuery) {
      await this.dbQuery.disconnect();
    }
    
    if (this.connectionType === 'serial' && this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close((error) => {
          if (error) {
            console.error('Erro ao fechar porta serial:', error);
          }
          this.port = null;
          this.parser = null;
          this.connectionType = null;
          resolve();
        });
      });
    } else if (this.connectionType === 'hid' && this.hidDevice) {
      this.hidDevice.close();
      this.hidDevice = null;
      this.connectionType = null;
    } else if (this.connectionType === 'usb' && this.usbDevice) {
      try {
        if (this.usbDevice.interfaces.length > 0) {
          const intf = this.usbDevice.interfaces[0];
          intf.release(true);
          if (intf.isKernelDriverActive !== undefined) {
            try {
              intf.attachKernelDriver();
            } catch (e) {
              // Ignorar erro
            }
          }
        }
        this.usbDevice.close();
      } catch (error) {
        console.error('Erro ao fechar USB:', error);
      }
      this.usbDevice = null;
      this.connectionType = null;
    }
  }

  /**
   * Verifica se está conectado
   */
  isConnected() {
    if (this.connectionType === 'serial') {
      return this.port && this.port.isOpen;
    } else if (this.connectionType === 'hid') {
      return this.hidDevice !== null;
    } else if (this.connectionType === 'usb') {
      return this.usbDevice !== null;
    } else if (this.connectionType === 'bluetooth') {
      return this.bluetoothDevice !== null && this.bluetoothDevice.state === 'connected';
    } else if (this.connectionType === 'bluetoothSerial') {
      return this.bluetoothSerial !== null;
    }
    return false;
  }

  /**
   * Verifica se está lendo
   */
  isReadingActive() {
    return this.isReading;
  }
}

module.exports = RFIDReaderDirect;

