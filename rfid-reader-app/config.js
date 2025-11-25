/**
 * Configurações do aplicativo RFID Reader
 * Este arquivo pode ser editado para personalizar o comportamento do app
 */

module.exports = {
  // Configurações de conexão padrão
  // Para Zebra RFD40P: geralmente 115200 ou 9600
  defaultBaudRate: 115200,
  
  // Configurações de leitura
  // Para Zebra RFD40P: muitos modelos enviam dados automaticamente
  // Se o leitor enviar automaticamente, aumente este intervalo ou desabilite comandos
  readInterval: 100, // Intervalo entre comandos de leitura (ms) - 0 para desabilitar
  duplicateTimeout: 500, // Tempo mínimo entre leituras do mesmo EPC (ms)
  
  // Configurações de histórico
  maxHistoryItems: 100,
  
  // Configuração do PostgreSQL (opcional)
  // Se configurado, busca SKU diretamente na view do banco
  // ⚠️ SEGURANÇA: Use variáveis de ambiente para senhas!
  // Configure: DB_PASSWORD=suasenha (ou crie arquivo .env)
  database: {
    enabled: false, // Habilitar busca no PostgreSQL
    host: process.env.DB_HOST || '10.0.20.2',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_DATABASE || 'senda',
    user: process.env.DB_USER || 'bsolutions',
    password: process.env.DB_PASSWORD || '', // ⚠️ NUNCA coloque senha aqui! Use variável de ambiente
    ssl: process.env.DB_SSL === 'true' || false,
    // View do PostgreSQL usada pelo gerador
    viewName: 'senda.vw_labels_variants_barcode'
  },
  
  // URL da API para buscar SKU (opcional - alternativa ao PostgreSQL)
  // Deixe null para desabilitar busca automática de SKU
  // Exemplo: 'http://localhost:3002/api/rfid/lookup'
  apiUrl: null,
  
  // Timeout para requisições à API (ms)
  apiTimeout: 3000,
  
  // Comandos do leitor RFID (ajustar conforme o modelo)
  readerCommands: {
    // Comando para iniciar leitura
    // Zebra RFD40P: geralmente envia dados automaticamente
    // Se não funcionar, tente: 'R\r', 'READ\r', ou deixe vazio se enviar automaticamente
    start: '', // Vazio = leitor envia automaticamente (comum em RFD40P)
    
    // Comando para parar leitura
    stop: 'S\r',
    
    // Prefixos comuns para EPC nos dados recebidos do Zebra RFD40P
    // O RFD40P geralmente envia EPC direto ou com prefixos como:
    prefixes: ['TAG:', 'EPC:', 'ID:', 'RFID:', 'E200', 'E300']
  },
  
  // Formato EPC esperado (ZebraDesigner)
  // Estrutura: [Barcode 12 dígitos] + [PO 4 dígitos] + [Sequencial] + [Zeros]
  epcFormat: {
    // Tipo: 'hexadecimal' ou 'decimal'
    type: 'decimal',
    
    // Tamanho esperado em caracteres
    length: 24,
    
    // Posições fixas no formato ZebraDesigner
    barcodeLength: 12,    // Primeiros 12 dígitos
    poLength: 4,          // Próximos 4 dígitos
    poStart: 12           // Início do PO (após barcode)
  },
  
  // Interface
  ui: {
    // Tema: 'light' ou 'dark'
    theme: 'light',
    
    // Idioma: 'pt-BR' ou 'en-US'
    language: 'pt-BR'
  }
};

