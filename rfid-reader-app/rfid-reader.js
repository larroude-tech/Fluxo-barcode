const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');
const config = require('./src/infrastructure/config/config');
const DatabaseQuery = require('./db-query');

class RFIDReader extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.isReading = false;
    this.readingInterval = null;
    this.lastReadTags = new Map(); // Para evitar leituras duplicadas
    this.dbQuery = null;
    
    // Inicializar busca no banco se configurado
    if (config.database && config.database.enabled) {
      this.dbQuery = new DatabaseQuery(config.database);
      this.dbQuery.connect().catch(err => {
        console.warn('[RFID-Reader] Banco de dados não disponível, funcionando sem busca de SKU');
      });
    }
  }

  /**
   * Lista todas as portas seriais disponíveis
   */
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Desconhecido',
        vendorId: port.vendorId,
        productId: port.productId,
        friendlyName: `${port.path} - ${port.manufacturer || 'Desconhecido'}`
      }));
    } catch (error) {
      console.error('Erro ao listar portas:', error);
      throw error;
    }
  }

  /**
   * Conecta ao leitor RFID via porta serial
   */
  async connect(portPath, options = {}) {
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

        // Criar parser para ler linhas
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        // Event handlers
        this.port.on('open', () => {
          console.log('Conectado ao leitor RFID:', portPath);
          this.emit('connected');
          resolve();
        });

        this.port.on('error', (error) => {
          console.error('Erro na conexão:', error);
          this.emit('error', error);
          reject(error);
        });

        this.port.on('close', () => {
          console.log('Conexão fechada');
          this.isReading = false;
          this.emit('disconnected');
        });

        // Processar dados recebidos
        this.parser.on('data', (data) => {
          this.processRFIDData(data.toString().trim());
        });

        // Abrir porta
        this.port.open((error) => {
          if (error) {
            console.error('Erro ao abrir porta:', error);
            reject(error);
          }
        });

      } catch (error) {
        console.error('Erro ao conectar:', error);
        reject(error);
      }
    });
  }

  /**
   * Processa dados recebidos do leitor RFID
   * Ajustar conforme o protocolo do seu leitor
   */
  processRFIDData(data) {
    if (!data || data.length === 0) return;

    console.log('Dados recebidos:', data);

    // Diferentes formatos de leitores RFID
    // Formato comum: EPC hexadecimal (ex: E20034120001140000000000)
    // Ou formato ASCII com prefixo (ex: TAG: E20034120001140000000000)
    
    let epc = null;

    // Tentar extrair EPC usando prefixos configurados
    const hasPrefix = config.readerCommands.prefixes.some(prefix => data.startsWith(prefix));
    if (hasPrefix) {
      epc = data.split(':')[1]?.trim();
    } else if (data.startsWith('E200') || data.startsWith('E300')) {
      // Formato EPC direto (hexadecimal)
      epc = data.trim();
    } else if (/^[0-9A-F]{24,32}$/i.test(data)) {
      // EPC hexadecimal sem prefixo
      epc = data.trim().toUpperCase();
    } else if (/^[0-9]{24,32}$/.test(data.trim())) {
      // EPC decimal sem prefixo
      epc = data.trim();
    } else {
      // Tentar encontrar EPC em qualquer lugar da string
      const epcMatch = data.match(/([0-9A-F]{24,32})/i) || data.match(/([0-9]{24,32})/);
      if (epcMatch) {
        epc = epcMatch[1].toUpperCase();
      }
    }

    if (epc) {
      // Evitar leituras duplicadas muito rápidas
      const now = Date.now();
      if (this.lastReadTags.has(epc)) {
        const lastReadTime = this.lastReadTags.get(epc);
        if (now - lastReadTime < config.duplicateTimeout) {
          return; // Ignorar leitura duplicada
        }
      }
      this.lastReadTags.set(epc, now);

      // Limpar leituras antigas (mais de 5 segundos)
      for (const [tag, time] of this.lastReadTags.entries()) {
        if (now - time > 5000) {
          this.lastReadTags.delete(tag);
        }
      }

      // Decodificar EPC para SKU (agora é async)
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
   * Decodifica o EPC RFID para extrair informações do SKU
   * Baseado no formato ZebraDesigner: Barcode(12) + PO(4) + Seq + Zeros
   * Formato EPC: 24 dígitos numéricos (ex: 197416145132046412345678)
   */
  async decodeEPC(epc) {
    try {
      // Converter EPC hexadecimal para decimal se necessário
      let epcDecimal = epc;
      
      // Se for hexadecimal (contém letras A-F), converter para decimal
      if (/[A-Fa-f]/.test(epc)) {
        // Tentar converter hex para decimal
        try {
          epcDecimal = BigInt('0x' + epc).toString();
        } catch (e) {
          // Se falhar, tentar como string decimal mesmo
          epcDecimal = epc;
        }
      }

      // Formato ZebraDesigner: [Barcode 12 dígitos] + [PO 4 dígitos] + [Sequencial] + [Zeros]
      // Exemplo: 197416145132046412345678
      //           ^^^^^^^^^^^^ (12) ^^^^ (4) ^^^^^^ (resto)
      
      if (epcDecimal.length >= 12) {
        // Extrair barcode (primeiros 12 dígitos)
        const barcode = epcDecimal.substring(0, 12);
        
        // Extrair PO (próximos 4 dígitos, se houver)
        let poNumber = '0000';
        if (epcDecimal.length >= 16) {
          poNumber = epcDecimal.substring(12, 16);
        }
        
        // Preparar resultado básico
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
        
        // Buscar no banco de dados se configurado
        if (this.dbQuery && this.dbQuery.isConnected()) {
          try {
            // Tentar buscar por barcode + PO primeiro
            let dbResult = await this.dbQuery.lookupByBarcodeAndPO(barcode, poNumber);
            
            // Se não encontrar com PO específico, tentar só por barcode
            if (!dbResult) {
              dbResult = await this.dbQuery.lookupByBarcode(barcode);
            }
            
            // Se encontrou no banco, preencher os dados
            if (dbResult) {
              result.sku = dbResult.vpm || dbResult.sku;
              result.vpm = dbResult.vpm || dbResult.sku;
              result.variant = dbResult.variant;
              result.styleName = dbResult.styleName;
              result.color = dbResult.color;
              result.size = dbResult.size;
              result.referencia = dbResult.referencia;
              result.qty = dbResult.qty;
              
              // Se PO foi encontrado no banco e diferente, atualizar
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
   * Inicia leitura contínua de tags RFID
   * Envia comandos periódicos ao leitor (ajustar conforme protocolo)
   */
  async startReading() {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Leitor não está conectado');
    }

    if (this.isReading) {
      return;
    }

    this.isReading = true;

    // Muitos leitores RFID enviam dados automaticamente (como Zebra RFD40P)
    // Mas alguns precisam de comandos periódicos
    // Ajustar conforme o modelo do seu leitor
    
    // Se readInterval for 0 ou comando start estiver vazio, não enviar comandos
    // (leitor envia dados automaticamente)
    const command = config.readerCommands.start || '';
    const shouldSendCommands = command.trim() !== '' && config.readInterval > 0;
    
    if (shouldSendCommands) {
      // Enviar comando de leitura periódico conforme configuração
      this.readingInterval = setInterval(() => {
        if (this.port && this.port.isOpen) {
          this.port.write(command, (error) => {
            if (error) {
              console.error('Erro ao enviar comando:', error);
            }
          });
        }
      }, config.readInterval);
    } else {
      console.log('Leitor configurado para modo automático (sem comandos periódicos)');
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
    
    // Desconectar do banco também
    if (this.dbQuery) {
      await this.dbQuery.disconnect();
    }
    
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close((error) => {
          if (error) {
            console.error('Erro ao fechar porta:', error);
          }
          this.port = null;
          this.parser = null;
          resolve();
        });
      });
    }
  }

  /**
   * Verifica se está conectado
   */
  isConnected() {
    return this.port && this.port.isOpen;
  }

  /**
   * Verifica se está lendo
   */
  isReadingActive() {
    return this.isReading;
  }
}

module.exports = RFIDReader;

