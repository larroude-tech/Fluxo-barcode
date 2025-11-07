const { SerialPort } = require('serialport');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ZebraUSBConnection {
    constructor() {
        this.port = null;
        this.isConnected = false;
        this.connectionType = null;
    }

    /**
     * Verifica se uma porta é de uma impressora Zebra
     */
    isZebraPrinter(port) {
        if (!port) return false;
        
        const manufacturer = (port.manufacturer || '').toLowerCase();
        const product = (port.productId || '').toLowerCase();
        const path = (port.path || '').toLowerCase();
        const vendorId = (port.vendorId || '').toLowerCase();
        
        // Vendor IDs conhecidos da Zebra Technologies
        const zebraVendorIds = ['0a5f', '05e0'];
        
        // Modelos Zebra comuns (ZD, ZT, GK, GC, ZM, etc)
        const zebraModelPatterns = ['zd', 'zt', 'gk', 'gc', 'zm', 'zq', 'zxp'];
        
        // Verificar se contém "zebra" em qualquer campo
        const hasZebraName = manufacturer.includes('zebra') || 
                            product.includes('zebra') || 
                            path.includes('zebra');
        
        // Verificar vendor ID
        const hasZebraVendorId = zebraVendorIds.some(vid => vendorId.includes(vid));
        
        // Verificar padrões de modelo Zebra no path ou product
        const hasZebraModel = zebraModelPatterns.some(pattern => 
            path.includes(pattern) || product.includes(pattern)
        );
        
        return hasZebraName || hasZebraVendorId || hasZebraModel;
    }

    /**
     * Detecta impressoras Zebra usando diferentes métodos
     */
    async detectPrinters() {
        console.log('[DEBUG] Detectando impressoras Zebra...');
        
        const results = {
            serial: [],
            usb: [],
            network: [],
            windows: []
        };

        try {
            // 1. Tentar detectar via SerialPort
            console.log('[RFID] Verificando portas seriais...');
            const allSerialPorts = await SerialPort.list();
            
            // FILTRAR apenas portas Zebra
            const zebraPorts = allSerialPorts.filter(port => this.isZebraPrinter(port));
            results.serial = zebraPorts;
            
            console.log(`[RFID] Total de portas encontradas: ${allSerialPorts.length}`);
            console.log(`[RFID] Portas Zebra filtradas: ${zebraPorts.length}`);
            
            if (zebraPorts.length > 0) {
                zebraPorts.forEach(port => {
                    console.log(`[ZEBRA] ${port.path} - ${port.manufacturer || 'N/A'} ${port.productId || ''}`);
                });
            } else {
                console.warn('[AVISO] Nenhuma porta Zebra detectada. Listando todas as portas para debug:');
                allSerialPorts.forEach(port => {
                    console.log(`[DEBUG] ${port.path} - Manufacturer: ${port.manufacturer || 'N/A'}, VendorId: ${port.vendorId || 'N/A'}`);
                });
            }

            // 2. Tentar detectar via Windows Device Manager
            console.log('[WINDOWS] Verificando dispositivos Windows...');
            const allWindowsDevices = await this.getWindowsDevices();
            // FILTRAR apenas dispositivos Zebra
            const zebraWindowsDevices = allWindowsDevices.filter(device => 
                device.toLowerCase().includes('zebra')
            );
            results.windows = zebraWindowsDevices;
            
            if (zebraWindowsDevices.length > 0) {
                console.log(`[ZEBRA] Dispositivos Windows Zebra encontrados: ${zebraWindowsDevices.length}`);
            }

            // 3. Tentar detectar via USB (usando comando do sistema)
            console.log('[USB] Verificando dispositivos USB...');
            const usbDevices = await this.getUSBDevices();
            // Considerar TODOS os dispositivos USB detectados
            results.usb = usbDevices;

        } catch (error) {
            console.error('[ERRO] Erro na detecção:', error.message);
        }

        return results;
    }

    /**
     * Obtém dispositivos do Windows Device Manager
     */
    async getWindowsDevices() {
        return new Promise((resolve, reject) => {
            exec('powershell "Get-PnpDevice | Select-Object FriendlyName"', (error, stdout, stderr) => {
                if (error) {
                    console.error('[ERRO] Erro ao obter dispositivos Windows:', error);
                    resolve([]);
                    return;
                }
                
                const devices = stdout.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && line !== 'FriendlyName' && line !== '----');
                
                resolve(devices);
            });
        });
    }

    /**
     * Obtém dispositivos USB
     */
    async getUSBDevices() {
        return new Promise((resolve, reject) => {
            exec('powershell "Get-WmiObject Win32_USBHub | Select-Object Name, DeviceID"', (error, stdout, stderr) => {
                if (error) {
                    console.error('[ERRO] Erro ao obter dispositivos USB:', error);
                    resolve([]);
                    return;
                }
                
                const devices = stdout.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && line !== 'Name' && line !== '----');
                
                resolve(devices);
            });
        });
    }

    /**
     * Tenta conectar usando diferentes métodos
     */
    async connect(portPath = null, options = {}) {
        console.log('[USB] Tentando conectar à impressora Zebra...');

        // Se não foi especificada uma porta, tentar auto-detectar
        if (!portPath) {
            const detection = await this.detectPrinters();
            
            if (detection.serial.length > 0) {
                portPath = detection.serial[0].path;
                this.connectionType = 'serial';
            } else if (detection.windows.length > 0) {
                // Tentar usar o primeiro dispositivo Windows encontrado
                console.log('[WINDOWS] Tentando conectar via dispositivo Windows...');
                return await this.connectViaWindows(detection.windows[0]);
            } else {
                throw new Error('Nenhuma impressora Zebra detectada');
            }
        }

        // Tentar conexão serial
        try {
            await this.connectSerial(portPath, options);
            return true;
        } catch (error) {
            console.log(`[ERRO] Conexão serial falhou: ${error.message}`);
            
            // Tentar outras abordagens
            return await this.tryAlternativeConnections();
        }
    }

    /**
     * Conecta via porta serial
     */
    async connectSerial(portPath, options = {}) {
        const defaultOptions = {
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            rtscts: true,
            timeout: 5000
        };

        const connectionOptions = { ...defaultOptions, ...options };

        return new Promise((resolve, reject) => {
            this.port = new SerialPort({
                path: portPath,
                ...connectionOptions
            });

            const timeout = setTimeout(() => {
                reject(new Error('Timeout de conexão serial'));
            }, connectionOptions.timeout);

            this.port.on('open', () => {
                console.log('[OK] Conexão serial estabelecida');
                this.isConnected = true;
                this.connectionType = 'serial';
                clearTimeout(timeout);
                resolve(true);
            });

            this.port.on('error', (error) => {
                console.error('[ERRO] Erro na conexão serial:', error);
                this.isConnected = false;
                clearTimeout(timeout);
                reject(error);
            });

            this.port.on('close', () => {
                console.log('[USB] Conexão serial fechada');
                this.isConnected = false;
            });
        });
    }

    /**
     * Tenta conectar via Windows
     */
    async connectViaWindows(deviceName) {
        console.log(`[WINDOWS] Tentando conectar via Windows: ${deviceName}`);
        
        // Para impressoras Zebra, muitas vezes precisamos usar o driver do Windows
        // Vou tentar enviar um comando via arquivo temporário
        
        try {
            const tempFile = path.join(__dirname, 'temp_zpl.txt');
            const testZPL = '^XA^FO50,50^A0N,30,30^FDTeste Windows^FS^XZ';
            
            fs.writeFileSync(tempFile, testZPL);
            
            // Tentar usar o comando copy do Windows para enviar para a impressora
            const printerName = deviceName.replace(/"/g, '');
            
            return new Promise((resolve, reject) => {
                exec(`copy "${tempFile}" "${printerName}"`, (error, stdout, stderr) => {
                    fs.unlinkSync(tempFile); // Limpar arquivo temporário
                    
                    if (error) {
                        console.error('[ERRO] Erro ao enviar via Windows:', error);
                        reject(error);
                    } else {
                        console.log('[OK] Comando enviado via Windows');
                        this.isConnected = true;
                        this.connectionType = 'windows';
                        resolve(true);
                    }
                });
            });
            
        } catch (error) {
            console.error('[ERRO] Erro na conexão Windows:', error);
            throw error;
        }
    }

    /**
     * Tenta conexões alternativas
     */
    async tryAlternativeConnections() {
        console.log('[RETRY] Tentando conexões alternativas...');
        
        // Tentar diferentes baud rates
        const baudRates = [9600, 19200, 38400, 57600, 115200];
        
        for (const baudRate of baudRates) {
            try {
                console.log(`[RFID] Tentando baud rate: ${baudRate}`);
                await this.connectSerial('COM1', { baudRate });
                return true;
            } catch (error) {
                console.log(`[ERRO] Baud rate ${baudRate} falhou: ${error.message}`);
            }
        }
        
        throw new Error('Nenhuma conexão alternativa funcionou');
    }

    /**
     * Envia comando ZPL
     */
    async sendZPL(zplCommand) {
        if (!this.isConnected) {
            throw new Error('Impressora não está conectada');
        }

        try {
            console.log('[SEND] Enviando comando ZPL...');
            
            if (this.connectionType === 'serial') {
                return await this.sendZPLSerial(zplCommand);
            } else if (this.connectionType === 'windows') {
                return await this.sendZPLWindows(zplCommand);
            } else {
                throw new Error('Tipo de conexão não suportado');
            }
        } catch (error) {
            console.error('[ERRO] Erro ao enviar ZPL:', error);
            throw error;
        }
    }

    /**
     * Envia ZPL via conexão serial
     */
    async sendZPLSerial(zplCommand) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout ao enviar ZPL'));
            }, 10000);

            this.port.write(zplCommand, (error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                } else {
                    console.log('[OK] Comando ZPL enviado via serial');
                    resolve(true);
                }
            });
        });
    }

    /**
     * Envia ZPL via Windows
     */
    async sendZPLWindows(zplCommand) {
        const tempFile = path.join(__dirname, 'temp_zpl.txt');
        
        try {
            fs.writeFileSync(tempFile, zplCommand);
            
            return new Promise((resolve, reject) => {
                exec(`copy "${tempFile}" "Zebra ZD621R"`, (error, stdout, stderr) => {
                    fs.unlinkSync(tempFile);
                    
                    if (error) {
                        reject(error);
                    } else {
                        console.log('[OK] Comando ZPL enviado via Windows');
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            throw error;
        }
    }

    /**
     * Desconecta da impressora
     */
    async disconnect() {
        try {
            if (this.port && this.isConnected) {
                await this.port.close();
            }
            this.isConnected = false;
            console.log('[USB] Desconectado da impressora');
        } catch (error) {
            console.error('[ERRO] Erro ao desconectar:', error);
            throw error;
        }
    }

    /**
     * Testa a conectividade
     */
    async testConnection() {
        try {
            console.log('[TEST] Testando conectividade...');
            
            const testZPL = `^XA
^FO50,50^A0N,50,50^FDTeste Zebra USB^FS
^FO50,120^BY3^BCN,100,Y,N,N^FD123456789^FS
^FO50,250^A0N,30,30^FDUSB Test^FS
^FO50,290^A0N,30,30^FDData: ${new Date().toLocaleString('pt-BR')}^FS
^XZ`;

            await this.sendZPL(testZPL);
            
            return {
                success: true,
                connectionType: this.connectionType,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = ZebraUSBConnection;
