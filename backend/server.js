console.log('[INIT] Iniciando carregamento de módulos...');

const express = require('express');
console.log('[INIT] express carregado');

const cors = require('cors');
console.log('[INIT] cors carregado');

const path = require('path');
const fs = require('fs');
console.log('[INIT] path e fs carregados');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
console.log('[INIT] dotenv configurado');

const { Pool } = require('pg');
console.log('[INIT] pg carregado');

const QRCode = require('qrcode');
console.log('[INIT] qrcode carregado');

const JsBarcode = require('jsbarcode');
console.log('[INIT] jsbarcode carregado');

const { PDFDocument, rgb } = require('pdf-lib');
console.log('[INIT] pdf-lib carregado');

const archiver = require('archiver');
console.log('[INIT] archiver carregado');

const sharp = require('sharp');
console.log('[INIT] sharp carregado');

const axios = require('axios');
console.log('[INIT] axios carregado');

const { Label } = require('node-zpl');
console.log('[INIT] node-zpl carregado');

// Image Proxy Starter (opcional - inicia API Python automaticamente)
let imageProxyStarter;
try {
  imageProxyStarter = require('./API Images/image-proxy-starter');
  console.log('[INIT] image-proxy-starter carregado');
} catch (error) {
  console.warn('[INIT] image-proxy-starter não encontrado (continuando...):', error.message);
  imageProxyStarter = null;
}

// QRCodeFinder pode não existir, tornar opcional
let QRCodeFinder;
try {
  QRCodeFinder = require('./qr-code-finder');
  console.log('[INIT] qr-code-finder carregado');
} catch (error) {
  console.warn('[INIT] qr-code-finder não encontrado (continuando...):', error.message);
  // Criar classe dummy
  QRCodeFinder = class {
    constructor() {}
    find() { return null; }
  };
}

const upload = {
  single: () => (req, res, next) => next()
};

// Rotas PostgreSQL podem falhar se pool for null
let registerPostgresLabelsRoutes;
try {
  registerPostgresLabelsRoutes = require('./routes/postgres-labels');
  console.log('[INIT] routes/postgres-labels carregado');
} catch (error) {
  console.warn('[INIT] routes/postgres-labels não encontrado (continuando...):', error.message);
  registerPostgresLabelsRoutes = () => {}; // Função vazia
}

console.log('[INIT] Todos os módulos principais carregados com sucesso');

/**
 * Utilitários RFID para conversão hexadecimal
 */
class RFIDUtils {
  /**
   * Converte string para hexadecimal
   */
  static stringToHex(str) {
    if (!str || typeof str !== 'string') {
      throw new Error('Dados inválidos para conversão hexadecimal');
    }
    
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      const hexValue = charCode.toString(16).padStart(2, '0').toUpperCase();
      hex += hexValue;
    }
    
    console.log(`[RFID] RFID Hex: "${str}" → "${hex}"`);
    return hex;
  }

  /**
   * Gera dados RFID no formato ZebraDesigner (Barcode + PO + Sequencial + Zeros)
   * Exemplo funcionou: 197416145132046412345678
   * Formato: [Barcode 12 chars] + [PO sem letras] + [Sequencial] + [Zeros para completar]
   */
  static generateZebraDesignerFormat(barcode, poNumber, sequence, targetLength = 24) {
    // Garantir que barcode tenha 12 caracteres
    const barcodeFormatted = String(barcode || '000000000000').substring(0, 12).padStart(12, '0');
    
    // PO sem letras (apenas números)
    const poFormatted = String(poNumber || '0000').replace(/[^0-9]/g, '');
    
    // Sequencial
    const seqFormatted = String(sequence || 1);
    
    // Montar dados base
    const baseData = `${barcodeFormatted}${poFormatted}${seqFormatted}`;
    
    // Completar com zeros até atingir o tamanho desejado
    const rfidData = baseData.padEnd(targetLength, '0');
    
    console.log(`[RFID] RFID ZebraDesigner Format:`);
    console.log(`   Barcode: ${barcodeFormatted} (12 chars)`);
    console.log(`   PO: ${poFormatted}`);
    console.log(`   Sequencial: ${seqFormatted}`);
    console.log(`   Base: ${baseData} (${baseData.length} chars)`);
    console.log(`   Final: ${rfidData} (${rfidData.length} chars)`);
    
    return rfidData;
  }

  /**
   * Valida dados RFID
   */
  static validateRFIDData(data) {
    if (!data || typeof data !== 'string') {
      throw new Error('Dados RFID são obrigatórios e devem ser string');
    }
    
    if (data.length === 0) {
      throw new Error('Dados RFID não podem estar vazios');
    }
    
    if (data.length > 50) {
      throw new Error('Dados RFID muito longos (máximo 50 caracteres)');
    }
    
    // Verificar se contém apenas caracteres válidos (apenas números para formato ZebraDesigner)
    const validChars = /^[0-9]+$/;
    if (!validChars.test(data)) {
      throw new Error('Dados RFID devem conter apenas números (formato ZebraDesigner)');
    }
    
    return true;
  }
}

const buildSslConfig = (mode) => {
  if (!mode) {
    return undefined;
  }

  const normalized = mode.toString().toLowerCase();
  if (normalized === 'require') {
    return { rejectUnauthorized: false };
  }

  if (normalized === 'disable' || normalized === 'allow' || normalized === 'prefer') {
    return false;
  }

  return undefined;
};

const createDatabasePool = () => {
  const {
    DATABASE_URL,
    PGHOST,
    PGPORT,
    PGUSER,
    PGPASSWORD,
    PGDATABASE,
    PGSSLMODE
  } = process.env;

  const ssl = buildSslConfig(PGSSLMODE);
  const usingDatabaseUrl = Boolean(DATABASE_URL);

  const baseConfig = usingDatabaseUrl
    ? { connectionString: DATABASE_URL }
    : {
        host: PGHOST,
        port: PGPORT ? Number(PGPORT) : undefined,
        user: PGUSER,
        password: PGPASSWORD,
        database: PGDATABASE
      };

  if (ssl !== undefined) {
    baseConfig.ssl = ssl;
  }

  const logDetails = usingDatabaseUrl
    ? 'source=DATABASE_URL'
    : `host=${baseConfig.host || 'localhost'}, db=${baseConfig.database || '(default)'}, user=${baseConfig.user || '(default)'}`;

  console.log(`[DB] Inicializando pool PostgreSQL (${logDetails}, sslMode=${PGSSLMODE || (ssl ? 'custom' : 'disabled')})`);
  if (ssl && typeof ssl === 'object') {
    console.log(`[DB] SSL config -> rejectUnauthorized=${ssl.rejectUnauthorized === false ? 'false' : 'true'}`);
  }

  return new Pool(baseConfig);
};

/**
 * Função para fazer refresh da view do banco de dados
 * Detecta automaticamente se é view normal ou materializada
 */
const refreshDatabaseView = async (pool) => {
  if (!pool) {
    console.log('[DB] [REFRESH] Pool não disponível, pulando refresh');
    return;
  }

  try {
    console.log('[DB] [REFRESH] Iniciando refresh automático da view...');
    
    // Verificar se a view é materializada
    const checkViewQuery = `
      SELECT 
        schemaname, 
        viewname, 
        definition
      FROM pg_views 
      WHERE schemaname = 'senda' 
      AND viewname = 'vw_labels_variants_barcode'
    `;
    
    const { rows: viewInfo } = await pool.query(checkViewQuery);
    
    if (viewInfo.length === 0) {
      // Verificar se é materializada
      const checkMatViewQuery = `
        SELECT 
          schemaname, 
          matviewname, 
          definition
        FROM pg_matviews 
        WHERE schemaname = 'senda' 
        AND matviewname = 'vw_labels_variants_barcode'
      `;
      
      const { rows: matViewInfo } = await pool.query(checkMatViewQuery);
      
      if (matViewInfo.length > 0) {
        // É uma view materializada, fazer REFRESH
        console.log('[DB] [REFRESH] View materializada detectada, executando REFRESH...');
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY senda.vw_labels_variants_barcode');
        console.log('[DB] [REFRESH] ✅ View materializada atualizada com sucesso');
      } else {
        console.log('[DB] [REFRESH] ⚠️ View não encontrada no banco de dados');
      }
    } else {
      // É uma view normal, forçar recarregamento agressivo
      console.log('[DB] [REFRESH] View normal detectada, forçando recarregamento completo...');
      
      const client = await pool.connect();
      try {
        // Limpar todos os planos de execução em cache
        await client.query('DEALLOCATE ALL');
        
        // Iniciar uma nova transação isolada
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        
        // Consultar a definição da view para forçar recarregamento
        await client.query(`
          SELECT definition 
          FROM pg_views 
          WHERE schemaname = 'senda' 
          AND viewname = 'vw_labels_variants_barcode'
        `);
        
        // Fazer uma consulta real na view para garantir que use a nova definição
        await client.query('SELECT COUNT(*) FROM senda.vw_labels_variants_barcode LIMIT 1');
        
        await client.query('COMMIT');
        
        // Descartar todas as configurações da sessão
        await client.query('DISCARD ALL');
        
        console.log('[DB] [REFRESH] ✅ View normal recarregada (cache completamente limpo)');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignorar erro de rollback
        }
        throw error;
      } finally {
        client.release();
      }
      
      // Aguardar um momento e fazer verificação final
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalClient = await pool.connect();
      try {
        await finalClient.query('SELECT 1 FROM senda.vw_labels_variants_barcode LIMIT 1');
        console.log('[DB] [REFRESH] ✅ Verificação final: view acessível e atualizada');
      } finally {
        finalClient.release();
      }
    }
  } catch (error) {
    console.error('[DB] [REFRESH] Erro ao fazer refresh da view:', error.message);
    // Não lançar o erro - apenas logar e continuar
    // Isso evita promises rejeitadas não tratadas
    console.warn('[DB] [REFRESH] Continuando sem refresh da view...');
  }
};

// Criar pool de banco de dados (não bloqueia inicialização)
let pool;
try {
  pool = createDatabasePool();
  
  pool.on('connect', (client) => {
    const pid = client?.processID || 'n/a';
    console.log(`[DB] Conexão estabelecida com PostgreSQL (pid=${pid})`);
  });

  pool.on('acquire', (client) => {
    const pid = client?.processID || 'n/a';
    console.log(`[DB] Cliente PostgreSQL adquirido do pool (pid=${pid})`);
  });

  pool.on('error', (err) => {
    console.error('[DB] Erro inesperado no pool PostgreSQL:', err);
    // Não encerra o servidor se houver erro no pool
  });
  
  console.log('[DB] Pool PostgreSQL criado com sucesso');
  
  // Testar conexão de forma assíncrona (não bloqueia startup)
  // Usar Promise.resolve().then() para garantir que todas as promises sejam tratadas
  Promise.resolve().then(async () => {
    try {
      await pool.query('SELECT 1');
    console.log('[DB] ✅ Teste de conexão bem-sucedido');
    
    // Refresh automático da view na inicialização
    try {
      await refreshDatabaseView(pool);
    } catch (refreshError) {
      console.warn('[DB] ⚠️ Erro ao fazer refresh da view na inicialização (continuando...):', refreshError.message);
    }
    } catch (err) {
    console.warn('[DB] ⚠️ Teste de conexão falhou (continuando...):', err.message);
    }
  }).catch((err) => {
    // Capturar qualquer erro não tratado na promise
    console.warn('[DB] ⚠️ Erro não tratado no teste de conexão (continuando...):', err.message);
  });
} catch (error) {
  console.error('[DB] Erro ao criar pool PostgreSQL:', error);
  console.log('[DB] Continuando sem pool (aplicação pode funcionar sem DB)');
  pool = null;
}

const app = express();
// Cloud Run define PORT automaticamente (padrão: 8080)
// Para desenvolvimento local, usa 3005 se PORT não estiver definido
const PORT = process.env.PORT || 3005;

console.log(`[INIT] Inicializando servidor na porta ${PORT}`);
console.log(`[INIT] NODE_ENV=${process.env.NODE_ENV || 'not set'}`);

// Configurar CORS PRIMEIRO (antes de qualquer rota)
app.use(cors({
  origin: true, // Permite qualquer origem (ajuste para produção)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware para parsing JSON
const maxUploadSize = process.env.MAX_UPLOAD_SIZE || '50mb';
app.use(express.json({ limit: maxUploadSize }));
app.use(express.urlencoded({ limit: maxUploadSize, extended: true }));
// express.static para frontend será configurado depois, se o frontend existir

// Registrar rotas (pode falhar se pool for null, mas não deve bloquear)
try {
  if (pool) {
    registerPostgresLabelsRoutes(app, pool);
    console.log('[INIT] ✅ Rotas PostgreSQL registradas com sucesso');
  } else {
    console.warn('[INIT] ⚠️ Pool PostgreSQL não disponível, rotas PostgreSQL não serão registradas');
    console.warn('[INIT] ⚠️ Configure as variáveis de ambiente do banco de dados para habilitar as rotas');
  }
} catch (error) {
  console.error('[INIT] ❌ Erro ao registrar rotas PostgreSQL:', error);
  console.log('[INIT] Continuando sem rotas PostgreSQL');
}

// Instanciar finder de QR codes (pode falhar se QRCodeFinder for dummy)
let qrCodeFinder;
try {
  qrCodeFinder = new QRCodeFinder();
  console.log('[INIT] QRCodeFinder instanciado');
} catch (error) {
  console.warn('[INIT] Erro ao instanciar QRCodeFinder (continuando...):', error.message);
  qrCodeFinder = { find: () => null };
}

/**
 * Simplifica URL e codifica em base64 para QR code mais simples e legível
 * 
 * ESTRATÉGIA DE SIMPLIFICAÇÃO:
 * 1. Remove partes desnecessárias da URL (ex: /collections/all-shoes/)
 * 2. Codifica a URL simplificada em base64 para reduzir tamanho e complexidade
 * 3. Cria URL de redirecionamento: https://dominio.com/r/<base64>
 * 4. O servidor deve ter endpoint /r/<base64> que decodifica e redireciona para URL original
 * 
 * EXEMPLO:
 *   Original: https://br.larroude.com/collections/all-shoes/products/black-verona-ballet-flat-suede
 *   Simplificada: https://br.larroude.com/products/black-verona-ballet-flat-suede
 *   Base64: aHR0cHM6Ly9ici5sYXJyb3VkZS5jb20vcHJvZHVjdHMvYmxhY2stdmVyb25hLWJhbGxldC1mbGF0LXN1ZWRl
 *   URL Redirecionamento no QR: https://br.larroude.com/r/aHR0cHM6Ly9ici5sYXJyb3VkZS5jb20vcHJvZHVjdHMvYmxhY2stdmVyb25hLWJhbGxldC1mbGF0LXN1ZWRl
 *   
 *   O QR code contém URL de redirecionamento que funciona automaticamente no celular
 *   O servidor Larroude deve ter endpoint /r/<base64> que decodifica e redireciona
 *   
 * BENEFÍCIOS:
 * - Reduz tamanho da URL em ~30-40%
 * - Base64 é mais compacto que URL completa
 * - QR code muito mais simples (menos quadrados)
 * - Facilita leitura em celulares
 * - Funciona automaticamente: celular abre navegador e redireciona
 * - URL válida que celulares reconhecem como link
 * 
 * NOTA: O servidor Larroude precisa implementar endpoint:
 *   GET /r/:base64
 *   Que decodifica o base64 e faz redirect 302 para a URL original
 */
function simplifyUrlForQRCode(url) {
  try {
    // URLs locais não são mais suportadas - apenas URLs HTTP/HTTPS
    if (url.includes('C:\\') || url.includes('Users\\') || url.includes('Downloads')) {
      console.warn(`[AVISO] URL contém caminho de sistema local, não suportado: ${url}`);
      return url; // Retornar como está, mas não processar
    }
    
    // Parsear URL uma vez
    const urlObj = new URL(url);
    let simplifiedUrl = url;
    
    // Se for URL do Larroude com /products/, simplificar removendo /collections/...
    // Exemplo: https://br.larroude.com/collections/all-shoes/products/black-verona...
    // Vira: https://br.larroude.com/products/black-verona...
    if (url.includes('larroude.com') && url.includes('/products/')) {
      const match = url.match(/\/products\/([^\/\?]+)/);
      if (match && match[1]) {
        // Construir URL simplificada: domínio + /products/ + slug
        simplifiedUrl = `${urlObj.protocol}//${urlObj.host}/products/${match[1]}`;
        console.log(`[QRCODE] URL simplificada: "${url}" → "${simplifiedUrl}"`);
      }
    } else {
      // Para outras URLs, tentar simplificar removendo partes intermediárias desnecessárias
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // Se tiver mais de 2 partes, pegar apenas as últimas 2
      if (pathParts.length > 2) {
        simplifiedUrl = `${urlObj.protocol}//${urlObj.host}/${pathParts.slice(-2).join('/')}`;
        console.log(`[QRCODE] URL simplificada: "${url}" → "${simplifiedUrl}"`);
      }
    }
    
    // Codificar URL simplificada em base64
    const urlBase64 = Buffer.from(simplifiedUrl, 'utf8').toString('base64');
    console.log(`[QRCODE] URL codificada em base64 (${urlBase64.length} chars): ${urlBase64.substring(0, 50)}...`);
    
    // Criar URL de redirecionamento com base64
    // Formato: https://br.larroude.com/r/<base64>
    // O servidor Larroude deve ter um endpoint /r/<base64> que decodifica e redireciona
    let redirectUrl;
    
    if (url.includes('larroude.com')) {
      // Extrair domínio (br.larroude.com, larroude.com, etc)
      const domain = urlObj.host;
      redirectUrl = `https://${domain}/r/${urlBase64}`;
    } else {
      // Para outras URLs, usar o domínio da URL original
      redirectUrl = `${urlObj.protocol}//${urlObj.host}/r/${urlBase64}`;
    }
    
    console.log(`[QRCODE] URL de redirecionamento criada: ${redirectUrl.substring(0, 80)}...`);
    console.log(`[QRCODE] Tamanho total: ${redirectUrl.length} caracteres`);
    
    // Retornar URL de redirecionamento (funciona automaticamente no celular)
    return redirectUrl;
    
  } catch (error) {
    // Se der erro ao processar URL, retornar original
    console.warn(`[AVISO] Erro ao simplificar/codificar URL, usando original: ${error.message}`);
    return url;
  }
}

/**
 * Aplica dilatação morfológica para engrossar linhas finas
 * Isso garante que linhas de 1 pixel não desapareçam na impressão
 * @param {Buffer} imageData - Dados da imagem binária (0 ou 255)
 * @param {number} width - Largura da imagem
 * @param {number} height - Altura da imagem
 * @param {number} radius - Raio de dilatação (padrão: 1 pixel)
 * @returns {Buffer} - Dados com dilatação aplicada
 */
function applyMorphologicalDilation(imageData, width, height, radius = 1) {
  const output = Buffer.from(imageData);
  const temp = Buffer.from(imageData);
  
  // Para cada pixel preto (0), verificar vizinhança e dilatar
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Se o pixel é preto (0), dilatar na vizinhança
      if (temp[idx] === 0) {
        // Verificar vizinhança (raio x raio)
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            // Verificar se está dentro dos limites
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              // Se estiver dentro do raio (distância euclidiana <= radius)
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance <= radius) {
                output[nIdx] = 0; // Tornar pixel preto
              }
            }
          }
        }
      }
    }
  }
  
  return output;
}

/**
 * Aplica dithering Floyd-Steinberg para melhor qualidade em imagens 1-bit
 * O dithering distribui o erro de quantização para pixels adjacentes,
 * criando a ilusão de tons de cinza mesmo em imagens binárias
 * @param {Buffer} imageData - Dados da imagem em escala de cinza (0-255)
 * @param {number} width - Largura da imagem
 * @param {number} height - Altura da imagem
 * @returns {Buffer} - Dados binarizados com dithering aplicado (0 ou 255)
 */
function applyFloydSteinbergDithering(imageData, width, height) {
  const output = Buffer.from(imageData);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldPixel = output[idx];
      const newPixel = oldPixel < 128 ? 0 : 255;
      const error = oldPixel - newPixel;
      
      output[idx] = newPixel;
      
      // Distribuir erro para pixels adjacentes (Floyd-Steinberg)
      // Padrão:     X  7/16
      //          3/16 5/16 1/16
      if (x + 1 < width) {
        output[idx + 1] = Math.max(0, Math.min(255, output[idx + 1] + error * 7 / 16));
      }
      if (x - 1 >= 0 && y + 1 < height) {
        output[(y + 1) * width + (x - 1)] = Math.max(0, Math.min(255, output[(y + 1) * width + (x - 1)] + error * 3 / 16));
      }
      if (y + 1 < height) {
        output[(y + 1) * width + x] = Math.max(0, Math.min(255, output[(y + 1) * width + x] + error * 5 / 16));
      }
      if (x + 1 < width && y + 1 < height) {
        output[(y + 1) * width + (x + 1)] = Math.max(0, Math.min(255, output[(y + 1) * width + (x + 1)] + error * 1 / 16));
      }
    }
  }
  
  return output;
}

/**
 * Converte imagem do QR code (URL ou caminho local) para formato ZPL ^GF
 * @param {string} imageUrl - URL ou caminho local da imagem
 * @param {number} width - Largura desejada em dots (padrão: 160 = ~2cm em 203 DPI)
 * @param {number} height - Altura desejada em dots (padrão: 160 = ~2cm em 203 DPI)
 * @returns {Promise<string>} - Comando ZPL ^GF com dados da imagem
 */
/**
 * Processa e calcula posição da imagem do produto baseado no layout
 * Retorna: { imageX, imageY, imageWidth, imageHeight, imageZPL }
 */
async function processProductImage(imageUrl, layout, context = '') {
  const contextLabel = context ? `[${context}] ` : '';
  
  // Valores padrão
  let imageX = 50;
  let imageY = 70;
  let imageWidth = 160;
  let imageHeight = 160;
  let imageZPL = null;
  
  if (!imageUrl || imageUrl.trim() === '') {
    console.log(`[IMAGE] ${contextLabel}⚠️ IMAGE_URL não disponível`);
    return { imageX, imageY, imageWidth, imageHeight, imageZPL: null };
  }
  
  // Validar que a imagem vem da API Python (pode ser localhost ou Cloud Run URL)
  const isFromPythonAPI = imageUrl.includes('/image/reference/') || 
                          imageUrl.includes('127.0.0.1') || 
                          imageUrl.includes('localhost') ||
                          (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
  if (!isFromPythonAPI) {
    console.warn(`[IMAGE] ${contextLabel}⚠️ Aviso: URL da imagem não parece ser da API Python: ${imageUrl}`);
  } else {
    console.log(`[IMAGE] ${contextLabel}✅ Confirmado: Imagem vem da API Python: ${imageUrl}`);
  }
  
  // Processar layout da imagem
  const imageLayout = layout?.image || layout?.productImage;
  
  if (imageLayout) {
    console.log(`[IMAGE] ${contextLabel}[LAYOUT] Coordenadas do editor detectadas: x=${imageLayout.x}, y=${imageLayout.y}, width=${imageLayout.width}, height=${imageLayout.height}`);
    
    // Comparar com QR code esquerdo para debug
    if (layout?.qrLeft) {
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] QR code esquerdo está em: (${layout.qrLeft.x}, ${layout.qrLeft.y})`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Comparação: Imagem Y=${imageLayout.y} vs QR Y=${layout.qrLeft.y} (imagem deve estar ACIMA se Y menor)`);
    }
    
    // Detectar se está em dots ou cm
    const absX = Math.abs(imageLayout.x || 0);
    const absY = Math.abs(imageLayout.y || 0);
    const absWidth = Math.abs(imageLayout.width || 0);
    const absHeight = Math.abs(imageLayout.height || 0);
    
    const hasSmallValues = absWidth < 20 && absHeight < 20 && absX < 20 && absY < 20;
    const hasNegativeValues = (imageLayout.x && imageLayout.x < 0) || (imageLayout.y && imageLayout.y < 0);
    const hasLargeValues = absWidth > 50 || absHeight > 50 || absX > 50 || absY > 50;
    
    const isInDots = hasLargeValues || hasNegativeValues || !hasSmallValues;
    const aspectRatio = absWidth && absHeight ? absWidth / absHeight : 1;
    const isDistorted = aspectRatio > 10 || aspectRatio < 0.1;
    
    if (isInDots) {
      // Já está em dots
      imageX = imageLayout.x || 50;
      imageY = imageLayout.y || 70;
      imageWidth = absWidth || 160;
      imageHeight = absHeight || 160;
      
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Coordenadas em DOTS detectadas - usando valores do editor diretamente`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Posição original do editor: (${imageX}, ${imageY})`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Tamanho original do editor: ${imageWidth}x${imageHeight} dots`);
      
      if (imageX < 0) {
        console.warn(`[IMAGE] ${contextLabel}[LAYOUT] Posição X negativa detectada (${imageX}). Ajustando para 50.`);
        imageX = 50;
      }
      if (imageY < 0) {
        console.warn(`[IMAGE] ${contextLabel}[LAYOUT] Posição Y negativa detectada (${imageY}). Ajustando para 70.`);
        imageY = 70;
      }
      
      console.log(`[IMAGE] ${contextLabel}Layout productImage detectado (em dots): posição (${imageX}, ${imageY}), tamanho ${imageWidth}x${imageHeight} dots`);
    } else if (isDistorted) {
      // Layout distorcido - usar tamanho padrão
      console.warn(`[IMAGE] ${contextLabel}⚠️ Layout com proporção muito distorcida detectada (${imageLayout.width}x${imageLayout.height}, ratio=${aspectRatio.toFixed(2)}). Usando tamanho padrão 160x160 dots.`);
      imageWidth = 160;
      imageHeight = 160;
      imageX = imageLayout.x ? (hasSmallValues ? Math.round(imageLayout.x * 80) : imageLayout.x) : 50;
      imageY = imageLayout.y ? (hasSmallValues ? Math.round(imageLayout.y * 80) : imageLayout.y) : 70;
      if (imageX < 0) imageX = 50;
      if (imageY < 0) imageY = 70;
    } else {
      // Converter de cm para dots
      imageWidth = Math.round((absWidth || 2) * 80);
      imageHeight = Math.round((absHeight || 2) * 80);
      imageX = Math.round((imageLayout.x || 0) * 80);
      imageY = Math.round((imageLayout.y || 0) * 80);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Coordenadas em CM detectadas - convertendo para DOTS`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Posição original (cm): (${imageLayout.x}, ${imageLayout.y}) -> (${imageX}, ${imageY}) dots`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Tamanho original (cm): ${imageLayout.width}x${imageLayout.height} -> ${imageWidth}x${imageHeight} dots`);
    }
    
    // Posicionar imagem sempre 1.5cm acima do QR code esquerdo
    if (layout?.qrLeft) {
      const qrY = layout.qrLeft.y;
      const distanceInCm = 1.5; // Distância em cm entre imagem e QR code
      const distanceInDots = Math.round(distanceInCm * 80); // 1.5 cm = 120 dots em 203 DPI
      
      const calculatedImageY = Math.round(qrY - distanceInDots - imageHeight);
      
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] QR code esquerdo está em: Y=${qrY} dots`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Posicionando imagem ${distanceInCm}cm (${distanceInDots} dots) acima do QR code`);
      console.log(`[IMAGE] ${contextLabel}[LAYOUT] Cálculo: QR Y(${qrY}) - ${distanceInCm}cm(${distanceInDots}) - altura(${imageHeight}) = ${calculatedImageY} dots`);
      
      if (calculatedImageY >= 0) {
        const oldImageY = imageY;
        imageY = calculatedImageY;
        console.log(`[IMAGE] ${contextLabel}[LAYOUT] ✅ Posição Y ajustada de ${oldImageY} para ${imageY} (${distanceInCm}cm acima do QR code)`);
        console.log(`[IMAGE] ${contextLabel}[LAYOUT] ✅ Imagem vai de Y=${imageY} até Y=${imageY + imageHeight} (${distanceInCm}cm acima do QR code em Y=${qrY})`);
      } else {
        console.warn(`[IMAGE] ${contextLabel}[LAYOUT] ⚠️ Posição calculada (${calculatedImageY}) seria negativa. Mantendo posição original do layout: Y=${imageY}`);
      }
    }
    
    // Validação: garantir tamanho mínimo e máximo
    if (imageWidth < 80 || imageHeight < 80) {
      console.warn(`[IMAGE] ${contextLabel}⚠️ Tamanho muito pequeno detectado: ${imageWidth}x${imageHeight} dots. Aplicando tamanho mínimo de 80x80 dots.`);
      imageWidth = Math.max(80, imageWidth);
      imageHeight = Math.max(80, imageHeight);
    }
    
    if (imageWidth > 400 || imageHeight > 400) {
      console.warn(`[IMAGE] ${contextLabel}⚠️ Tamanho muito grande detectado: ${imageWidth}x${imageHeight} dots. Limitando para 400x400 dots máximo.`);
      const maxDim = Math.max(imageWidth, imageHeight);
      const scale = 400 / maxDim;
      imageWidth = Math.round(imageWidth * scale);
      imageHeight = Math.round(imageHeight * scale);
    }
    
    // Validação final: garantir que posição está dentro dos limites
    const originalX = imageX;
    const originalY = imageY;
    imageX = Math.round(imageX);
    imageY = Math.round(imageY);
    if (imageX < 0) imageX = 50;
    if (imageY < 0) imageY = 70;
    if (imageX + imageWidth > 831) {
      console.warn(`[IMAGE] ${contextLabel}⚠️ Imagem ultrapassa largura da etiqueta (${imageX + imageWidth} > 831). Ajustando posição X de ${originalX} para ${Math.max(0, 831 - imageWidth)}.`);
      imageX = Math.max(0, 831 - imageWidth);
    }
    if (imageY + imageHeight > 500) {
      console.warn(`[IMAGE] ${contextLabel}⚠️ Imagem ultrapassa altura da etiqueta (${imageY + imageHeight} > 500). Ajustando posição Y de ${originalY} para ${Math.max(0, 500 - imageHeight)}.`);
      imageY = Math.max(0, 500 - imageHeight);
    }
    
    // Garantir que coordenadas finais são inteiras
    imageX = Math.round(imageX);
    imageY = Math.round(imageY);
    imageWidth = Math.round(imageWidth);
    imageHeight = Math.round(imageHeight);
    
    console.log(`[IMAGE] ${contextLabel}Posição final: (${imageX}, ${imageY}), Tamanho: ${imageWidth}x${imageHeight} dots`);
  } else {
    console.warn(`[IMAGE] ${contextLabel}⚠️ Layout productImage não encontrado - usando valores padrão: (${imageX}, ${imageY}), tamanho ${imageWidth}x${imageHeight} dots`);
  }
  
  // Converter imagem para ZPL
  try {
    console.log(`[IMAGE] ${contextLabel}✅ Processando imagem do sapato para posição separada: ${imageUrl}`);
    imageZPL = await convertImageToZPL(imageUrl, imageWidth, imageHeight);
    
    if (imageZPL && imageZPL.trim() !== '') {
      console.log(`[IMAGE] ${contextLabel}✅ Imagem do sapato convertida para ZPL com sucesso!`);
      console.log(`[IMAGE] ${contextLabel}   [SIZE] Tamanho aplicado: ${imageWidth}x${imageHeight} dots`);
    }
  } catch (error) {
    console.error(`[IMAGE] ${contextLabel}❌ Erro ao converter imagem para ZPL: ${error.message}`);
    imageZPL = null;
  }
  
  return { imageX, imageY, imageWidth, imageHeight, imageZPL };
}

async function convertImageToZPL(imageUrl, width = 160, height = 160) {
  try {
    // DEBUG CRÍTICO: Log dos parâmetros recebidos
    console.log(`\n[CONFIG] ========== convertImageToZPL CHAMADO ==========`);
    console.log(`   [DOWNLOAD] Parâmetros recebidos: width=${width}, height=${height}`);
    console.log(`   [SIZE] Tamanho esperado: ${(width/203*2.54).toFixed(2)}cm x ${(height/203*2.54).toFixed(2)}cm`);
    console.log(`   [IMAGE] Image URL: ${imageUrl.substring(0, 80)}...`);
    
    let imageBuffer;
    
    // Detectar se é URL ou caminho local
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // Verificar se é claramente uma URL de página (não de imagem)
      // Se não tiver extensão de imagem conhecida e não for Imgur/Google Drive, assumir que é página
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
      const hasImageExtension = imageExtensions.some(ext => 
        imageUrl.toLowerCase().includes(ext) || imageUrl.toLowerCase().endsWith(ext)
      );
      const isKnownImageService = imageUrl.includes('imgur.com') || imageUrl.includes('drive.google.com') || 
                                  imageUrl.includes('i.imgur.com') || imageUrl.includes('cdn.') ||
                                  imageUrl.includes('/images/') || imageUrl.includes('/image/') ||
                                  imageUrl.includes('/image/reference/') || imageUrl.includes('127.0.0.1') ||
                                  imageUrl.includes('localhost') ||
                                  (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
      
      // NUNCA gerar QR code se a URL for da API Python - sempre tratar como imagem
      // Suporta localhost (dev) e Cloud Run URL (produção)
      const isPythonAPI = imageUrl.includes('/image/reference/') || 
                         imageUrl.includes('127.0.0.1') || 
                         imageUrl.includes('localhost') ||
                         (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
      if (isPythonAPI) {
        console.log(`[IMAGE] ✅ URL da API Python detectada - sempre tratar como imagem (nunca gerar QR code)`);
        // Forçar que seja tratada como imagem conhecida, pular geração de QR code
      } else if (!hasImageExtension && !isKnownImageService) {
        // Simplificar URL para QR code mais legível
        const simplifiedUrl = simplifyUrlForQRCode(imageUrl);
        console.log(`[QRCODE] URL parece ser de página web (não de imagem). Gerando QR code a partir da URL: ${imageUrl}`);
        console.log(`[QRCODE] URL simplificada para QR code: ${simplifiedUrl}`);
        
        // ============================================================
        // OTIMIZAÇÕES PARA FACILITAR LEITURA NO CELULAR:
        // ============================================================
        // 
        // 1. NÍVEL DE CORREÇÃO DE ERRO 'L' (LOW):
        //    - Menos dados de correção = QR code mais simples
        //    - Reduz complexidade visual (menos quadrados = mais fácil de ler)
        //    - Nível L suporta até ~7% de dano/corrupção, suficiente para leitura normal
        //    - QR codes mais simples são mais rápidos para celulares processarem
        //
        // 2. MARGEM AUMENTADA (2 módulos):
        //    - Margem maior cria "zona de silêncio" ao redor do código
        //    - Facilita detecção automática pelos leitores de celular
        //    - Reduz interferência visual com outros elementos da etiqueta
        //
        // 3. TAMANHO DE GERAÇÃO MAIOR (width * 6):
        //    - Gera QR code em alta resolução (360x360 pixels para 60 dots finais)
        //    - Ao redimensionar para 60x60, mantém melhor qualidade
        //    - Reduz perda de definição durante redimensionamento
        //    - Resultado: QR code impresso mais nítido e legível
        //
        // 4. URL SIMPLIFICADA:
        //    - Remove partes desnecessárias da URL (ex: /collections/...)
        //    - Reduz tamanho em ~30-40%, diminuindo complexidade do QR code
        //    - Mantém URL válida e funcional
        //
        // RESULTADO ESPERADO:
        // - QR code mais simples visualmente (menos quadrados)
        // - Leitura mais rápida e precisa em celulares
        // - Melhor qualidade de impressão (mais nítido)
        // - Maior taxa de sucesso na leitura
        // ============================================================
        console.log(`[QRCODE] Otimizando QR code para leitura móvel (tamanho do texto: ${simplifiedUrl.length} chars)`);
        
        try {
          const qrCodeBuffer = await QRCode.toBuffer(simplifiedUrl, {
            errorCorrectionLevel: 'L', // Low = menos dados de correção = QR code mais simples e fácil de ler
            type: 'png',
            width: Math.max(width * 8, 400), // Gerar em tamanho maior (8x ou mínimo 400px) para melhor qualidade
            margin: 3, // Margem maior (3 módulos) para melhor isolamento e leitura
            color: {
              dark: '#000000', // Preto puro para máximo contraste
              light: '#FFFFFF' // Branco puro para máximo contraste
            }
          });
          
          console.log(`[OK] QR code gerado com sucesso (${qrCodeBuffer.length} bytes)`);
          imageBuffer = qrCodeBuffer;
          // Pular para o processamento da imagem (depois do bloco if/else)
        } catch (qrError) {
          console.warn(`[AVISO] Erro ao gerar QR code diretamente, tentando baixar URL: ${qrError.message}`);
          // Continuar com o fluxo normal de download
        }
      }
      
      // Se já gerou QR code, pular o download
      if (imageBuffer) {
        // Continuar para o processamento da imagem
      } else {
        // Converter URLs para formato de download direto se necessário
        let downloadUrl = imageUrl;
        
        // Detectar e converter URL do Imgur
        if (imageUrl.includes('imgur.com')) {
          console.log(`[DEBUG] URL do Imgur detectada: ${imageUrl}`);
          
          // Extrair ID da imagem do Imgur
          // Formatos: https://imgur.com/ID, https://imgur.com/a/ID, https://i.imgur.com/ID.jpg
          let imgurId = null;
          
          // Formato: imgur.com/ID ou imgur.com/a/ID
          const imgurMatch = imageUrl.match(/imgur\.com\/(?:a\/)?([a-zA-Z0-9]+)/);
          if (imgurMatch) {
            imgurId = imgurMatch[1];
          }
          
          if (imgurId) {
            // Converter para link direto da imagem (tentar primeiro .png, depois .jpg)
            // Imgur suporta ambos os formatos
            downloadUrl = `https://i.imgur.com/${imgurId}.png`;
            console.log(`[DEBUG] URL do Imgur convertida para download direto: ${downloadUrl}`);
          } else {
            console.warn(`[AVISO] Não foi possível extrair ID da imagem do Imgur. Tentando URL original...`);
          }
        }
      
      // Detectar se é URL do Google Drive
      if (imageUrl.includes('drive.google.com')) {
        console.log(`[DEBUG] URL do Google Drive detectada: ${imageUrl}`);
        
        // Extrair ID do arquivo do Google Drive
        // Formato: https://drive.google.com/file/d/FILE_ID/view ou /open?id=FILE_ID
        let fileId = null;
        
        // Tentar extrair ID de diferentes formatos de URL do Google Drive
        const fileIdMatch = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          fileId = fileIdMatch[1];
        } else {
          // Tentar formato ?id=
          const idMatch = imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (idMatch) {
            fileId = idMatch[1];
          }
        }
        
        if (fileId) {
          // Converter para URL de download direto do Google Drive
          downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          console.log(`[DEBUG] URL convertida para download direto: ${downloadUrl}`);
        } else {
          console.warn(`[AVISO] Não foi possível extrair ID do arquivo do Google Drive. Tentando URL original...`);
        }
      }
      
      // Baixar imagem de URL
      console.log(`[DOWNLOAD] Baixando imagem de URL: ${downloadUrl}`);
      const timeout = parseInt(process.env.IMAGE_DOWNLOAD_TIMEOUT) || 30000; // Aumentar timeout para Google Drive
      
      try {
        const response = await axios.get(downloadUrl, { 
          responseType: 'arraybuffer', 
          timeout,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        imageBuffer = Buffer.from(response.data);
        console.log(`[OK] Imagem baixada com sucesso (${imageBuffer.length} bytes)`);
        
        // Verificar se o buffer é realmente uma imagem (não HTML)
        // Verificar magic numbers de formatos de imagem
        const isImage = imageBuffer.length > 0 && (
          imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF // JPEG
          || imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47 // PNG
          || imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 // GIF
          || imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4D // BMP
        );
        
        if (!isImage) {
          // NUNCA gerar QR code se a URL for da API Python
          // Suporta localhost (dev) e Cloud Run URL (produção)
          const isPythonAPI = imageUrl.includes('/image/reference/') || 
                             imageUrl.includes('127.0.0.1') || 
                             imageUrl.includes('localhost') ||
                             (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
          if (isPythonAPI) {
            console.error(`[ERRO] API Python retornou dados que não são uma imagem válida!`);
            console.error(`[ERRO] Verifique se a API Python está funcionando corretamente e retornando imagens.`);
            throw new Error(`API Python retornou dados inválidos (não é uma imagem). URL: ${imageUrl}`);
          }
          
          // Pode ser HTML retornado (página web ou erro)
          const contentStr = imageBuffer.toString('utf8', 0, Math.min(200, imageBuffer.length));
          if (contentStr.includes('<html') || contentStr.includes('<!DOCTYPE')) {
            // Se receber HTML, assumir que é uma URL de página e gerar QR code a partir dela
            // Simplificar URL para QR code mais legível
            const simplifiedUrl = simplifyUrlForQRCode(imageUrl);
            console.log(`[QRCODE] URL retornou HTML (página web). Gerando QR code a partir da URL: ${imageUrl}`);
            console.log(`[QRCODE] URL simplificada para QR code: ${simplifiedUrl}`);
            
            // OTIMIZAÇÃO PARA LEITURA NO CELULAR
            console.log(`[QRCODE] Otimizando QR code para leitura móvel (tamanho do texto: ${simplifiedUrl.length} chars)`);
            
            try {
              // Gerar QR code a partir da URL simplificada da página
              const qrCodeBuffer = await QRCode.toBuffer(simplifiedUrl, {
                errorCorrectionLevel: 'L', // Low = menos complexidade = mais fácil de ler
                type: 'png',
                width: Math.max(width * 8, 400), // Gerar em tamanho maior (8x ou mínimo 400px) para melhor qualidade
                margin: 3, // Margem maior (3 módulos) para melhor isolamento e leitura
                color: {
                  dark: '#000000', // Preto puro para máximo contraste
                  light: '#FFFFFF' // Branco puro para máximo contraste
                }
              });
              
              console.log(`[OK] QR code gerado com sucesso (${qrCodeBuffer.length} bytes)`);
              imageBuffer = qrCodeBuffer;
              
              // Não tentar mais baixar imagem, já temos o QR code
              // Pular para o processamento da imagem
            } catch (qrError) {
              // Se falhar ao gerar QR code, tentar métodos alternativos para Imgur
              if (imageUrl.includes('imgur.com') && !downloadUrl.includes('i.imgur.com')) {
                const imgurMatch = imageUrl.match(/imgur\.com\/(?:a\/)?([a-zA-Z0-9]+)/);
                if (imgurMatch) {
                  const imgurId = imgurMatch[1];
                  // Tentar com .jpg se .png falhou
                  const altUrl = `https://i.imgur.com/${imgurId}.jpg`;
                  console.log(`[DEBUG] Tentando formato .jpg do Imgur: ${altUrl}`);
                  try {
                    const jpgResponse = await axios.get(altUrl, { 
                      responseType: 'arraybuffer', 
                      timeout,
                      maxRedirects: 5
                    });
                    imageBuffer = Buffer.from(jpgResponse.data);
                    console.log(`[OK] Imagem baixada com formato .jpg (${imageBuffer.length} bytes)`);
                  } catch (jpgError) {
                    throw new Error(`Erro ao gerar QR code e ao baixar imagem: ${qrError.message}`);
                  }
                } else {
                  throw new Error(`Erro ao gerar QR code: ${qrError.message}`);
                }
              } else {
                throw new Error(`Erro ao gerar QR code: ${qrError.message}`);
              }
            }
          }
        }
      } catch (downloadError) {
        // Se falhar com download direto, tentar método alternativo para Google Drive
        if (imageUrl.includes('drive.google.com') && fileId) {
          console.log(`[DEBUG] Tentando método alternativo de download do Google Drive...`);
          try {
            // Tentar com uc?export=download&confirm=t&id=
            const altUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
            const response = await axios.get(altUrl, { 
              responseType: 'arraybuffer', 
              timeout,
              maxRedirects: 5,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            imageBuffer = Buffer.from(response.data);
            console.log(`[OK] Imagem baixada com método alternativo (${imageBuffer.length} bytes)`);
            
            // Verificar se é realmente uma imagem
            const isImage = imageBuffer.length > 0 && (
              imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF // JPEG
              || imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47 // PNG
              || imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 // GIF
              || imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4D // BMP
            );
            
            if (!isImage) {
              // NUNCA gerar QR code se a URL for da API Python
              // Suporta localhost (dev) e Cloud Run URL (produção)
          const isPythonAPI = imageUrl.includes('/image/reference/') || 
                             imageUrl.includes('127.0.0.1') || 
                             imageUrl.includes('localhost') ||
                             (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
              if (isPythonAPI) {
                console.error(`[ERRO] API Python retornou dados que não são uma imagem válida!`);
                console.error(`[ERRO] Verifique se a API Python está funcionando corretamente e retornando imagens.`);
                throw new Error(`API Python retornou dados inválidos (não é uma imagem). URL: ${imageUrl}`);
              }
              
              const contentStr = imageBuffer.toString('utf8', 0, Math.min(200, imageBuffer.length));
              if (contentStr.includes('<html') || contentStr.includes('<!DOCTYPE')) {
                // Se receber HTML, assumir que é uma URL de página e gerar QR code
                // Simplificar URL para QR code mais legível
                const simplifiedUrl = simplifyUrlForQRCode(imageUrl);
                console.log(`[QRCODE] Google Drive retornou HTML (página web). Gerando QR code a partir da URL: ${imageUrl}`);
                console.log(`[QRCODE] URL simplificada para QR code: ${simplifiedUrl}`);
                
                // OTIMIZAÇÃO PARA LEITURA NO CELULAR
                console.log(`[QRCODE] Otimizando QR code para leitura móvel (tamanho do texto: ${simplifiedUrl.length} chars)`);
                
                try {
                  // Gerar QR code a partir da URL simplificada da página
                  const qrCodeBuffer = await QRCode.toBuffer(simplifiedUrl, {
                    errorCorrectionLevel: 'L', // Low = menos complexidade = mais fácil de ler
                    type: 'png',
                    width: Math.max(width * 8, 400), // Gerar em tamanho maior (8x ou mínimo 400px) para melhor qualidade
                    margin: 3, // Margem maior (3 módulos) para melhor isolamento e leitura
                    color: {
                      dark: '#000000', // Preto puro para máximo contraste
                      light: '#FFFFFF' // Branco puro para máximo contraste
                    }
                  });
                  
                  console.log(`[OK] QR code gerado com sucesso (${qrCodeBuffer.length} bytes)`);
                  imageBuffer = qrCodeBuffer;
                } catch (qrError) {
                  throw new Error(`Erro ao baixar imagem e ao gerar QR code: ${altError.message} / ${qrError.message}`);
                }
              }
            }
          } catch (altError) {
            // NUNCA gerar QR code se a URL for da API Python
            // Suporta localhost (dev) e Cloud Run URL (produção)
          const isPythonAPI = imageUrl.includes('/image/reference/') || 
                             imageUrl.includes('127.0.0.1') || 
                             imageUrl.includes('localhost') ||
                             (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
            if (isPythonAPI) {
              console.error(`[ERRO] Erro ao baixar imagem da API Python: ${altError.message}`);
              console.error(`[ERRO] Verifique se a API Python está funcionando corretamente.`);
              throw new Error(`Erro ao baixar imagem da API Python: ${altError.message}. URL: ${imageUrl}`);
            }
            
            // Se falhar completamente, tentar gerar QR code a partir da URL simplificada
            const simplifiedUrl = simplifyUrlForQRCode(imageUrl);
            console.log(`[QRCODE] Erro ao baixar imagem. Gerando QR code a partir da URL: ${imageUrl}`);
            console.log(`[QRCODE] URL simplificada para QR code: ${simplifiedUrl}`);
            
            // OTIMIZAÇÃO PARA LEITURA NO CELULAR
            console.log(`[QRCODE] Otimizando QR code para leitura móvel (tamanho do texto: ${simplifiedUrl.length} chars)`);
            
            try {
              const qrCodeBuffer = await QRCode.toBuffer(simplifiedUrl, {
                errorCorrectionLevel: 'L', // Low = menos complexidade = mais fácil de ler
                type: 'png',
                width: Math.max(width * 8, 400), // Gerar em tamanho maior (8x ou mínimo 400px) para melhor qualidade
                margin: 3, // Margem maior (3 módulos) para melhor isolamento e leitura
                color: {
                  dark: '#000000', // Preto puro para máximo contraste
                  light: '#FFFFFF' // Branco puro para máximo contraste
                }
              });
              
              console.log(`[OK] QR code gerado com sucesso (${qrCodeBuffer.length} bytes)`);
              imageBuffer = qrCodeBuffer;
            } catch (qrError) {
              throw new Error(`Erro ao baixar imagem e ao gerar QR code: ${altError.message} / ${qrError.message}`);
            }
          }
        } else {
          // NUNCA gerar QR code se a URL for da API Python
          // Suporta localhost (dev) e Cloud Run URL (produção)
          const isPythonAPI = imageUrl.includes('/image/reference/') || 
                             imageUrl.includes('127.0.0.1') || 
                             imageUrl.includes('localhost') ||
                             (process.env.IMAGE_PROXY_URL && imageUrl.includes(process.env.IMAGE_PROXY_URL));
          if (isPythonAPI) {
            console.error(`[ERRO] Erro ao baixar imagem da API Python: ${downloadError.message}`);
            console.error(`[ERRO] Verifique se a API Python está funcionando corretamente.`);
            throw new Error(`Erro ao baixar imagem da API Python: ${downloadError.message}. URL: ${imageUrl}`);
          }
          
          // Se falhar o download inicial e não for Google Drive, tentar gerar QR code
          const simplifiedUrl = simplifyUrlForQRCode(imageUrl);
          console.log(`[QRCODE] Erro ao baixar imagem. Gerando QR code a partir da URL: ${imageUrl}`);
          console.log(`[QRCODE] URL simplificada para QR code: ${simplifiedUrl}`);
          
          // OTIMIZAÇÃO PARA LEITURA NO CELULAR - SEMPRE USAR NÍVEL L (LOW)
          console.log(`[QRCODE] Otimizando QR code para leitura móvel com nível L (tamanho do texto: ${simplifiedUrl.length} chars)`);
          
          try {
            const qrCodeBuffer = await QRCode.toBuffer(simplifiedUrl, {
              errorCorrectionLevel: 'L', // Low = menos complexidade = mais fácil de ler
              type: 'png',
              width: Math.max(width * 8, 400), // Gerar em tamanho maior (8x ou mínimo 400px) para melhor qualidade
              margin: 2 // Margem maior para melhor isolamento
            });
            
            console.log(`[OK] QR code gerado com sucesso (${qrCodeBuffer.length} bytes)`);
            imageBuffer = qrCodeBuffer;
          } catch (qrError) {
            throw downloadError; // Re-throw o erro original se não conseguir gerar QR code
          }
        }
      }
      } // Fim do else do download (se imageBuffer não foi gerado antes)
    } else {
      // Verificar se é caminho local válido (permitir apenas dentro do projeto)
      if (imageUrl.includes('C:\\') || imageUrl.includes('Users\\') || imageUrl.includes('Downloads')) {
        console.error(`[ERRO] Caminho local do sistema detectado: ${imageUrl}`);
        console.error(`[ERRO] IMAGE_URL deve ser uma URL HTTP/HTTPS, não um caminho local de arquivo.`);
        throw new Error(`IMAGE_URL deve ser uma URL HTTP/HTTPS (ex: https://exemplo.com/imagem.png), não um caminho local (ex: C:\\Users\\...). Caminho recebido: ${imageUrl}`);
      }
      
      // Ler imagem de caminho local (apenas se for caminho relativo ao projeto)
      console.log(`[FILE] Lendo imagem de caminho local: ${imageUrl}`);
      
      // Resolver caminho relativo ao diretório do projeto
      const projectPath = path.resolve(__dirname, imageUrl);
      
      // Verificar se o caminho está dentro do diretório do projeto (segurança)
      const projectDir = path.resolve(__dirname);
      if (!projectPath.startsWith(projectDir)) {
        throw new Error(`Caminho de imagem está fora do diretório do projeto. Use URLs HTTP/HTTPS ou caminhos relativos ao projeto.`);
      }
      
      if (!fs.existsSync(projectPath)) {
        throw new Error(`Arquivo não encontrado: ${projectPath}`);
      }
      imageBuffer = fs.readFileSync(projectPath);
    }
    
    // Converter para bitmap 1-bit (monocromático) e redimensionar usando sharp
    // MELHORIAS DE QUALIDADE PARA IMPRESSÃO:
    // 1. Processar em resolução 2x maior e depois reduzir (melhor qualidade)
    // 2. Usar sharpening antes da binarização
    // 3. Melhorar contraste com normalise() e ajustes manuais
    // 4. Usar threshold adaptativo para melhor preservação de detalhes
    // 5. Usar kernel lanczos3 para melhor qualidade no redimensionamento
    
    // Primeiro, obter dimensões originais
    const originalMetadata = await sharp(imageBuffer).metadata();
    console.log(`   [QUALITY] Dimensões originais: ${originalMetadata.width}x${originalMetadata.height}`);
    console.log(`   [QUALITY] Processando com melhorias de qualidade para impressão`);
    
    // PROCESSAMENTO COM MELHORIAS DE QUALIDADE (CONSERVADOR)
    // Foco em garantir que a imagem apareça com boa qualidade
    
    // 1. Redimensionar diretamente para o tamanho final com kernel de alta qualidade
    const resizedBuffer = await sharp(imageBuffer)
      .resize(width, height, { 
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
        kernel: 'lanczos3', // Kernel de alta qualidade para melhor preservação de detalhes
        withoutEnlargement: false
      })
      .greyscale()
      .normalise() // Melhorar contraste automático
      .sharpen({ sigma: 0.5, flat: 1, jagged: 1.5 }) // Sharpening suave para melhor definição
      .linear(1.15, -(128 * 0.15)) // Aumentar brilho e contraste suavemente (1.15x multiplicador, -19.2 offset)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    console.log(`   [QUALITY] Redimensionado para tamanho final: ${resizedBuffer.info.width}x${resizedBuffer.info.height}`);
    
    // 2. Aplicar threshold adaptativo melhorado (mais conservador)
    const resizedData = resizedBuffer.data;
    const finalData = Buffer.from(resizedData);
    
    // Calcular threshold adaptativo baseado na média dos pixels
    let sum = 0;
    for (let i = 0; i < finalData.length; i++) {
      sum += finalData[i];
    }
    const mean = sum / finalData.length;
    // Threshold adaptativo: usar média ajustada (mais conservador para garantir que a imagem apareça)
    // Se a imagem for muito clara (média alta), usar threshold mais baixo para preservar detalhes
    // Se a imagem for muito escura (média baixa), usar threshold mais alto para não perder tudo
    let adaptiveThreshold;
    if (mean > 200) {
      // Imagem muito clara - usar threshold mais baixo
      adaptiveThreshold = Math.max(120, mean * 0.6);
    } else if (mean < 80) {
      // Imagem muito escura - usar threshold mais alto
      adaptiveThreshold = Math.min(140, mean * 1.2);
    } else {
      // Imagem normal - usar média ajustada
      adaptiveThreshold = Math.max(110, Math.min(150, mean * 0.9));
    }
    
    let blackPixels = 0;
    let whitePixels = 0;
    for (let i = 0; i < finalData.length; i++) {
      if (finalData[i] < adaptiveThreshold) {
        finalData[i] = 0; // Preto
        blackPixels++;
      } else {
        finalData[i] = 255; // Branco
        whitePixels++;
      }
    }
    console.log(`   [QUALITY] Threshold adaptativo aplicado: ${adaptiveThreshold.toFixed(1)} (média=${mean.toFixed(1)})`);
    console.log(`   [QUALITY] Pixels após threshold: ${blackPixels} pretos, ${whitePixels} brancos`);
    
    // Validação: garantir que temos pixels pretos (se não tiver, a imagem não aparecerá)
    if (blackPixels === 0) {
      console.warn(`   [QUALITY] ⚠️ AVISO: Nenhum pixel preto detectado! Aplicando threshold mais baixo...`);
      // Tentar com threshold mais baixo
      const lowerThreshold = Math.max(80, adaptiveThreshold * 0.7);
      blackPixels = 0;
      whitePixels = 0;
      for (let i = 0; i < finalData.length; i++) {
        if (finalData[i] < lowerThreshold) {
          finalData[i] = 0; // Preto
          blackPixels++;
        } else {
          finalData[i] = 255; // Branco
          whitePixels++;
        }
      }
      console.log(`   [QUALITY] Threshold ajustado para: ${lowerThreshold.toFixed(1)}`);
      console.log(`   [QUALITY] Pixels após ajuste: ${blackPixels} pretos, ${whitePixels} brancos`);
    }
    
    const info = resizedBuffer.info;
    
    console.log(`   [QUALITY] Processamento aplicado: resize + greyscale + normalise + sharpen + contrast + threshold adaptativo`);
    
    // DEBUG: Verificar dimensões após processamento
    console.log(`   [DEBUG] Dimensões finais: ${info.width}x${info.height}`);
    console.log(`   [OK] Dimensões esperadas (máximo): ${width}x${height}`);
    
    // Com fit: 'contain', a imagem pode ser menor que width x height para preservar aspect ratio
    // Isso é esperado e desejado para melhor qualidade (sem distorção)
    if (info.width > width || info.height > height) {
      console.error(`[ERRO] ERRO CRÍTICO: Sharp redimensionou para tamanho maior que o esperado!`);
      console.error(`   Obtido: ${info.width}x${info.height}`);
      console.error(`   Esperado (máximo): ${width}x${height}`);
      throw new Error(`Falha ao redimensionar imagem: obtido ${info.width}x${info.height} (maior que ${width}x${height})`);
    }
    
    console.log(`   [OK] Dimensões corretas confirmadas! (${info.width}x${info.height} dentro de ${width}x${height})`);
    console.log(`   [QUALITY] Aspect ratio preservado para melhor qualidade visual`);
    
    // Converter para formato hexadecimal do ZPL ^GF
    // ^GF formato: ^GFa,b,c,d,data^FS
    // a = compression type (A=ASCII hex)
    // b = binary byte count
    // c = graphic field count (total bytes)
    // d = bytes per row
    // IMPORTANTE: Usar dimensões reais da imagem (pode ser menor que width x height com fit: 'contain')
    const actualWidth = info.width;
    const actualHeight = info.height;
    const bytesPerRow = Math.ceil(actualWidth / 8);
    const totalBytes = bytesPerRow * actualHeight;
    
    console.log(`   [QUALITY] Dimensões reais da imagem: ${actualWidth}x${actualHeight} dots`);
    console.log(`   [QUALITY] Bytes por linha: ${bytesPerRow}, Total de bytes: ${totalBytes}`);
    
    // Converter pixels para bits (1 = preto, 0 = branco)
    // CRÍTICO: Cada pixel do bitmap = 1 dot na impressora
    // 80 pixels = 80 dots = 1.0 cm (em 203 DPI)
    let bitmapHex = '';
    let totalPixels = 0;
    let finalBlackPixels = 0;
    
    for (let row = 0; row < actualHeight; row++) {
      for (let colByte = 0; colByte < bytesPerRow; colByte++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = colByte * 8 + bit;
          if (pixelX < actualWidth) {
            // Dados raw greyscale tem 1 canal por pixel após processamento
            const pixelIndex = row * actualWidth + pixelX;
            if (pixelIndex < finalData.length) {
              totalPixels++;
              const pixelValue = finalData[pixelIndex];
              // Após o threshold adaptativo, pixels já estão binarizados (0 = preto, 255 = branco)
              // Usar threshold de 128 para garantir que apenas pixels pretos (0) sejam capturados
              if (pixelValue < 128) {
                byte |= (1 << (7 - bit));
                finalBlackPixels++;
              }
            }
          }
        }
        // Converter byte para hexadecimal (2 caracteres)
        bitmapHex += byte.toString(16).padStart(2, '0').toUpperCase();
      }
    }
    
    // Validação: garantir que temos exatamente o número correto de pixels
    const expectedPixels = actualWidth * actualHeight;
    if (totalPixels !== expectedPixels) {
      console.warn(`[AVISO] AVISO: Total de pixels processados (${totalPixels}) diferente do esperado (${expectedPixels})`);
    }
    
    // Gerar comando ZPL ^GF
    // Formato: ^GFa,b,c,d,data^FS
    // a = compression type (A=ASCII hex)
    // b = binary byte count
    // c = graphic field count (total bytes) 
    // d = bytes per row
    // O comando ^GF renderiza o bitmap na resolução nativa da impressora (203 DPI)
    // IMPORTANTE: O bitmap é renderizado pixel por pixel, então 80x80 pixels = 80x80 dots = 1.0 cm
    const zplCommand = `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${bitmapHex}^FS`;
    
    // Verificar dimensões finais
    const maxCm = (width / 203 * 2.54).toFixed(2);
    const actualCm = (actualWidth / 203 * 2.54).toFixed(2);
    const actualCmHeight = (actualHeight / 203 * 2.54).toFixed(2);
    
    // Com fit: 'contain', é normal que as dimensões sejam menores que width x height
    if (actualWidth > width || actualHeight > height) {
      console.error(`[ERRO] ERRO: Dimensões maiores que o esperado: máximo ${width}x${height} dots (${maxCm}cm), obtido ${actualWidth}x${actualHeight} dots (${actualCm}cm x ${actualCmHeight}cm)`);
      throw new Error(`Falha ao redimensionar: obtido ${actualWidth}x${actualHeight} (maior que ${width}x${height})`);
    } else {
      console.log(`[OK] Imagem convertida para ZPL: ${actualWidth}x${actualHeight} dots = ${actualCm}cm x ${actualCmHeight}cm`);
      console.log(`   [SIZE] Tamanho máximo disponível: ${width}x${height} dots (~${maxCm}cm)`);
      console.log(`   [SIZE] Tamanho real (preservando aspect ratio): ${actualWidth}x${actualHeight} dots (${actualCm}cm x ${actualCmHeight}cm)`);
      console.log(`   [QUALITY] Aspect ratio preservado para melhor qualidade visual (sem distorção)`);
      console.log(`   [SIZE] Bytes por linha: ${bytesPerRow}, Total de bytes: ${totalBytes}`);
      console.log(`   [DEBUG] Hex data length: ${bitmapHex.length} chars (esperado: ${totalBytes * 2})`);
      console.log(`   🎨 Pixels processados: ${totalPixels} (${finalBlackPixels} pretos, ${totalPixels - finalBlackPixels} brancos)`);
      console.log(`   [AVISO] IMPORTANTE: Este bitmap será renderizado EXATAMENTE como ${actualWidth}x${actualHeight} dots na impressora`);
      console.log(`   [AVISO] Se aparecer maior no preview, pode ser problema de escala do Labelary, mas a impressão física será correta`);
      console.log(`   [INFO] Comando ZPL gerado (amostra): ${zplCommand.substring(0, 150)}...`);
      console.log(`[CONFIG] ========== FIM convertImageToZPL ==========\n`);
    }
    return zplCommand;
    
  } catch (error) {
    console.error(`[ERRO] Erro ao converter imagem para ZPL: ${error.message}`);
    throw error;
  }
}

// Middleware já configurado acima (CORS e parsing JSON)

// Rotas
// A rota catch-all para servir o frontend React será definida no final,
// após todas as rotas de API serem registradas

// Health check endpoint para Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Endpoint de teste para verificar conexão com banco
app.get('/api/test-db', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ 
        error: 'Banco de dados não disponível',
        message: 'Configure as variáveis de ambiente do PostgreSQL (DATABASE_URL ou PGHOST, PGUSER, etc.)',
        poolAvailable: false
      });
    }
    
    // Testar conexão
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    
    res.json({
      success: true,
      message: 'Conexão com banco de dados OK',
      poolAvailable: true,
      databaseTime: result.rows[0].current_time,
      postgresVersion: result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao conectar com banco de dados',
      message: error.message,
      poolAvailable: pool !== null
    });
  }
});

// Endpoints de QR codes em pastas locais removidos - não são mais usados

// Upload e processamento do arquivo Excel
app.post('/api/upload-excel', upload.single('excel'), async (req, res) => {
  return res.status(410).json({
    error: 'Endpoint removido. Utilize /api/purchase-orders e /api/labels para acessar os dados.'
  });
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    let data;
    const fileExt = path.extname(req.file.path).toLowerCase();
    
    if (fileExt === '.csv') {
      // Ler arquivo CSV
      const csvContent = fs.readFileSync(req.file.path, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ error: 'Arquivo CSV deve ter pelo menos cabeÃ§alho e uma linha de dados' });
      }
      
      // Detectar delimitador (TAB, vírgula ou ponto-e-vírgula)
      // Contar ocorrências na primeira linha para determinar qual usar
      const firstLine = lines[0];
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      
      let delimiter;
      if (tabCount > commaCount && tabCount > semicolonCount) {
        delimiter = '\t';
      } else if (semicolonCount > commaCount) {
        delimiter = ';';
      } else {
        delimiter = ',';
      }
      
      const delimiterName = delimiter === '\t' ? 'TAB' : (delimiter === ';' ? 'ponto-e-vírgula' : 'vírgula');
      console.log(`[DATA] Delimitador detectado: ${delimiterName} (TAB: ${tabCount}, ;: ${semicolonCount}, ,: ${commaCount})`);
      
      // Normalizar headers: remover espaços, caracteres invisíveis e padronizar
      // Processar headers com suporte a valores entre aspas
      let headerValues = [];
      if (delimiter === ';' || delimiter === ',') {
        let currentHeader = '';
        let insideQuotes = false;
        for (let charIdx = 0; charIdx < lines[0].length; charIdx++) {
          const char = lines[0][charIdx];
          if (char === '"') {
            insideQuotes = !insideQuotes;
            currentHeader += char;
          } else if ((char === delimiter) && !insideQuotes) {
            headerValues.push(currentHeader.trim());
            currentHeader = '';
          } else {
            currentHeader += char;
          }
        }
        if (currentHeader.length > 0 || lines[0].endsWith(delimiter)) {
          headerValues.push(currentHeader.trim());
        }
      } else {
        headerValues = lines[0].split(delimiter);
      }
      
      const headers = headerValues.map(h => {
        // Remover BOM se existir
        let header = h.trim().replace(/^\uFEFF/, '');
        // Remover aspas externas
        header = header.replace(/^["']+|["']+$/g, '');
        // Normalizar: remover espaços extras e caracteres invisíveis
        header = header.replace(/\s+/g, ' ').trim();
        return header;
      });
      console.log(`[INFO] Headers detectados:`, headers);
      console.log(`[DEBUG] Verificando se IMAGE_URL está nos headers:`, headers.some(h => h.toUpperCase().includes('IMAGE') && h.toUpperCase().includes('URL')));
      
      // Criar mapa de headers normalizados para busca case-insensitive
      const headerMap = {};
      headers.forEach((header, index) => {
        const normalized = header.toUpperCase().trim();
        headerMap[normalized] = { original: header, index };
        // Debug específico para IMAGE_URL
        if (normalized === 'IMAGE_URL' || normalized.includes('IMAGE') && normalized.includes('URL')) {
          console.log(`[DEBUG] Header IMAGE_URL encontrado: "${header}" (normalizado: "${normalized}") no índice ${index}`);
        }
      });
      
      data = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        // Pular linhas vazias
        if (!line || line.length === 0) {
          continue;
        }
        
        // Processar valores com suporte a delimitadores e valores que podem conter o próprio delimitador
        // Usar uma abordagem mais robusta para split que respeita valores entre aspas
        let values = [];
        if (delimiter === ';' || delimiter === ',') {
          // Para CSV com ponto-e-vírgula ou vírgula, fazer split mais inteligente
          // que não quebra valores entre aspas
          let currentValue = '';
          let insideQuotes = false;
          for (let charIdx = 0; charIdx < line.length; charIdx++) {
            const char = line[charIdx];
            if (char === '"') {
              insideQuotes = !insideQuotes;
              currentValue += char;
            } else if ((char === delimiter) && !insideQuotes) {
              values.push(currentValue.trim());
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          // Adicionar último valor
          if (currentValue.length > 0 || line.endsWith(delimiter)) {
            values.push(currentValue.trim());
          }
        } else {
          // Para TAB, fazer split simples
          values = line.split(delimiter).map(v => v.trim());
        }
        
        // Limpar aspas dos valores
        values = values.map(v => {
          // Remover aspas externas se existirem
          v = v.replace(/^["']+|["']+$/g, '');
          return v.trim();
        });
        
        const row = {};
        headers.forEach((header, index) => {
          let value = values[index] || '';
          // Garantir que valores longos (como URLs) sejam preservados completamente
          if (value && value.length > 100) {
            console.log(`[DEBUG] Campo "${header}" tem valor longo (${value.length} chars): ${value.substring(0, 80)}...`);
          }
          row[header] = value;
          // Debug para IMAGE_URL especificamente
          if (header.toUpperCase() === 'IMAGE_URL' || header.toUpperCase().includes('IMAGE') && header.toUpperCase().includes('URL')) {
            console.log(`[DEBUG] IMAGE_URL encontrado no header "${header}" (índice ${index}): "${value}"`);
            console.log(`[DEBUG] Valor completo IMAGE_URL:`, value);
            console.log(`[DEBUG] Tipo do valor: ${typeof value}, Length: ${value ? value.length : 0}`);
          }
        });
        
        // Debug adicional: verificar se IMAGE_URL está no row após mapeamento
        console.log(`[DEBUG] Row após mapeamento - Chaves:`, Object.keys(row));
        if (row.IMAGE_URL || row['IMAGE_URL']) {
          console.log(`[DEBUG] IMAGE_URL confirmado no row: "${row.IMAGE_URL || row['IMAGE_URL']}"`);
        }
        
        // Debug: mostrar PO e LOCAL da primeira linha válida
        if (i === 1) {
          console.log(`[DEBUG] Linha ${i} - Valores brutos: PO="${row.PO || row['PO'] || ''}", LOCAL="${row.LOCAL || row['LOCAL'] || ''}"`);
          console.log(`[DEBUG] Linha ${i} - Todas as chaves do row:`, Object.keys(row));
        }
        
        // Só adicionar se tiver pelo menos um campo preenchido
        if (Object.values(row).some(val => val && val.toString().trim().length > 0)) {
          data.push(row);
        }
      }
    } else {
      // Ler arquivo Excel - processar apenas abas de etiquetas (excluir Sheet1 que Ã© banco de dados)
      const workbook = XLSX.readFile(req.file.path);
      data = [];
      
      // Iterar por todas as abas do arquivo, excluindo Sheet1
      for (const sheetName of workbook.SheetNames) {
        // Pular a aba Sheet1 pois Ã© o banco de dados de referÃªncia
        if (sheetName.toLowerCase() === 'sheet1') {
          continue;
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet);
        
        if (sheetData.length > 0) {
          // Adicionar dados da aba atual ao array principal
          data = data.concat(sheetData);
        }
      }
    }

    // Validar se o arquivo tem as colunas necessárias
    // Aceitar SKU, SKU_VARIANT ou SKU_MAE
    const requiredColumns = ['NAME', 'DESCRIPTION', 'BARCODE', 'REF'];
    const skuColumns = ['SKU', 'SKU_VARIANT', 'SKU_MAE'];
    const alternativeColumns = ['Variant SKU', 'UPC']; // Formato alternativo legado
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'Arquivo está vazio' });
    }
    
    // Separar dados por formato
    const standardData = [];
    const alternativeData = [];
    
    data.forEach(row => {
      // Verificar se tem pelo menos um campo SKU (novo padrão ou antigo)
      const hasSkuField = skuColumns.some(col => col in row && row[col]);
      const hasRequiredColumns = requiredColumns.every(col => col in row);
      const hasAlternativeColumns = alternativeColumns.every(col => col in row);
      
      if (hasRequiredColumns && hasSkuField) {
        // Formato padrão (com SKU, SKU_VARIANT ou SKU_MAE)
        standardData.push(row);
      } else if (hasAlternativeColumns) {
        // Formato alternativo legado
        const sku = row['Variant SKU'] || '';
        const skuParts = sku.split('-');
        const style = skuParts[1] || '';
        
        alternativeData.push({
          NAME: style,
          DESCRIPTION: `Produto ${style}`,
          SKU: sku,
          BARCODE: row['UPC'] || '',
          REF: sku.split('-')[0] || '',
          QTY: 1
        });
      }
    });
    
    // Combinar todos os dados processados
    data = [...standardData, ...alternativeData];
    
    if (data.length === 0) {
      return res.status(400).json({ 
        error: `Nenhuma linha com colunas válidas encontrada. Esperado: ${requiredColumns.join(', ')} + um dos: ${skuColumns.join(', ')}` 
      });
    }
    
    // Processar dados com os novos campos
    data = data.map(row => {
      // NOVO PADRÃO: Priorizar SKU_VARIANT (mais específico), senão SKU, senão SKU_MAE
      // SKU_VARIANT contém a variante completa com tamanho/cor (ex: L415-STEL-5.0-WHIT-2498)
      // SKU_MAE contém apenas o modelo base (ex: L415-STEL-WHIT-2498)
      const skuVariant = (row.SKU_VARIANT || '').toString().trim();
      const sku = (row.SKU || '').toString().trim();
      const skuMae = (row.SKU_MAE || '').toString().trim();
      
      // Usar SKU_VARIANT como fonte principal (tem tamanho e cor específicos)
      const activeSku = skuVariant || sku || skuMae || '';
      const skuParts = activeSku.split('-');
      
      console.log(`[INFO] Processando: SKU_VARIANT="${skuVariant}", SKU="${sku}", SKU_MAE="${skuMae}" -> Usando: "${activeSku}"`);
      
      // STYLE_NAME: SEMPRE priorizar NAME do CSV (nome completo do produto)
      // Exemplo: NAME="STELLA" é usado, não a abreviação "STEL" do SKU
      let styleName = row.NAME || '';
      
      // Se não tiver NAME, tentar STYLE_NAME do CSV
      if (!styleName || styleName.trim().length === 0) {
        styleName = row.STYLE_NAME || '';
      }
      
      // Se ainda não tiver, extrair do SKU como último recurso
      // (mas isso geralmente resulta em abreviações como "STEL", "VERO", etc.)
      if ((!styleName || styleName.trim().length === 0) && skuParts.length >= 2) {
        styleName = skuParts[1] || '';
        console.warn(`[AVISO] STYLE_NAME extraído do SKU (pode ser abreviação): "${styleName}". Considere usar campo NAME no CSV.`);
      }
      
      // Garantir que não seja vazio
      if (!styleName || styleName.trim().length === 0) {
        styleName = 'N/A';
      }
      
      console.log(`[LOG] STYLE_NAME final: "${styleName}" (de: NAME="${row.NAME}", STYLE_NAME="${row.STYLE_NAME}", SKU="${activeSku}")`);
      
      // VPN: usar do CSV se existir, senão usar SKU_VARIANT (prioridade), senão SKU, senão SKU_MAE
      // VPN é o mesmo que SKU_VARIANT
      const vpn = row.VPN || skuVariant || sku || skuMae || '';
      
      // SIZE: usar do CSV se existir, senão extrair do SKU_VARIANT
      let rawSize = '';
      if (row.SIZE) {
        rawSize = row.SIZE.toString().trim();
      } else if (skuVariant && skuParts.length >= 3) {
        // SKU_VARIANT: L415-STEL-5.0-WHIT-2498 -> SIZE na posição 2 (5.0)
        rawSize = skuParts[2] || '';
      } else if (sku && skuParts.length >= 3) {
        // SKU padrão: pode ter tamanho na posição 2
        rawSize = skuParts[2] || '';
      }
      const size = rawSize.replace(',', '.').trim() || 'N/A';
      
      // COLOR: usar do CSV se existir, senão extrair do SKU_VARIANT
      // Se o COLOR do CSV for um código curto (3-4 chars), tentar mapear para nome completo
      let color = row.COLOR || '';
      if (!color) {
        if (skuVariant && skuParts.length >= 4) {
          // SKU_VARIANT: L415-STEL-5.0-WHIT-2498 -> COLOR na posição 3 (WHIT)
          color = skuParts[3] || '';
        } else if (sku && skuParts.length >= 4) {
          // SKU padrão: COLOR na posição 3
          color = skuParts[3] || '';
        } else if (skuMae && skuMae.split('-').length >= 4) {
          // SKU_MAE: pode ter cor na posição 3 (sem tamanho)
          const maeParts = skuMae.split('-');
          color = maeParts[3] || '';
        }
      }
      
      // Mapear códigos de cor para nomes (mesmo se vier do CSV)
      const colorMap = {
        'WHIT': 'WHITE',
        'BLCK': 'BLACK',
        'BRWN': 'BROWN',
        'NAVY': 'NAVY',
        'NUDE': 'NUDE',
        'SILV': 'SILVER',
        'GOLD': 'GOLD',
        'BEIG': 'BEIGE',
        'BURN': 'BURNT UMBER'
      };
      
      // Se o color é um código curto, tentar mapear
      const colorUpper = color.toUpperCase().trim();
      if (colorMap[colorUpper]) {
        color = colorMap[colorUpper];
      } else if (!color || color === '') {
        // Se ainda não tiver cor, usar DESCRIPTION ou código do SKU
        color = row.DESCRIPTION?.split(' ').pop() || (skuParts.length >= 4 ? skuParts[3] : '') || 'N/A';
      }
      
      // PO: usar APENAS do CSV (não extrair do SKU_VARIANT)
      // PO e LOCAL não fazem parte da estrutura do SKU_VARIANT
      // Buscar PO com diferentes variações de case e espaços - BUSCA MAIS ROBUSTA
      let poValue = '';
      const poKeys = Object.keys(row).filter(key => key.toUpperCase().trim() === 'PO');
      if (poKeys.length > 0) {
        poValue = row[poKeys[0]] || '';
        console.log(`[OK] PO encontrado usando chave "${poKeys[0]}" = "${poValue}"`);
      } else {
        // Tentar variações
        poValue = row.PO || row['PO'] || row['Po'] || row['po'] || row[' P O '] || '';
        console.log(`[DEBUG] Tentando variações de PO: "${poValue}"`);
      }
      
      let poNumber = '';
      if (poValue && poValue.toString().trim() !== '') {
        // Se PO já existe no CSV, remover "PO" se presente e extrair apenas números
        poNumber = poValue.toString().replace(/^PO/i, '').replace(/[^0-9]/g, '').trim();
        console.log(`[OK] PO extraído do CSV: "${poValue}" -> "${poNumber}"`);
      } else {
        // Se não houver PO no CSV, tentar extrair como fallback apenas do SKU legado (formato antigo)
        // Mas apenas se não for SKU_VARIANT (que não contém PO)
        if (!skuVariant) {
          const sourceForPO = sku || skuMae || '';
          const poParts = sourceForPO.split('-');
          if (poParts.length > 0) {
            const firstPart = poParts[0].replace(/^L/, '');
            poNumber = firstPart || '0000';
            console.log(`[AVISO] PO extraído do SKU legado: "${poNumber}"`);
          }
        } else {
          // Se usar SKU_VARIANT, PO deve estar no CSV
          console.warn(`[AVISO] PO não encontrado no CSV para SKU_VARIANT="${skuVariant}". PO é obrigatório no CSV quando usando SKU_VARIANT.`);
          poNumber = '0000';
        }
      }
      
      // LOCAL: IGNORADO - não processar informação do LOCAL
      // O campo LOCAL foi desabilitado conforme solicitado
      let localNumber = '';
      console.log(`[INFO] Campo LOCAL ignorado (desabilitado)`);

      // Processar BARCODE: converter notação científica e remover vírgulas
      let barcode = row.BARCODE || '';
      if (barcode) {
        // Se contém notação científica (E+ ou E-), converter
        if (barcode.includes('E+') || barcode.includes('E-') || barcode.includes('e+') || barcode.includes('e-')) {
          try {
            // Substituir vírgula por ponto para parsing numérico
            const numericValue = parseFloat(barcode.toString().replace(',', '.'));
            if (!isNaN(numericValue)) {
              barcode = numericValue.toFixed(0); // Converter para inteiro como string
            }
          } catch (e) {
            console.warn(`[AVISO] Erro ao converter notação científica do barcode: ${barcode}`);
          }
        } else {
          // Remover vírgulas se houver (formato brasileiro: 1,97416...)
          barcode = barcode.toString().replace(/,/g, '');
        }
      }

      // IMAGE_URL: extrair do CSV (caminho ou URL da imagem do QR code)
      let imageUrl = '';
      console.log(`[DEBUG] Procurando IMAGE_URL - Chaves disponíveis no row:`, Object.keys(row));
      
      // Tentar múltiplas variações do nome do campo
      const imageUrlKeys = Object.keys(row).filter(key => key.toUpperCase().trim() === 'IMAGE_URL');
      console.log(`[DEBUG] Chaves encontradas com IMAGE_URL:`, imageUrlKeys);
      
      if (imageUrlKeys.length > 0) {
        imageUrl = row[imageUrlKeys[0]] || '';
        console.log(`[DEBUG] IMAGE_URL extraído via chave filtrada: "${imageUrl}"`);
      } else {
        // Tentar todas as variações possíveis
        imageUrl = row.IMAGE_URL || row['IMAGE_URL'] || row['Image_URL'] || row['image_url'] || 
                   row['IMAGE-URL'] || row['Image-Url'] || row['image-url'] || '';
        console.log(`[DEBUG] IMAGE_URL extraído via variações: "${imageUrl}"`);
      }
      
      // Debug: mostrar valor bruto antes de processar
      if (imageUrl) {
        console.log(`[DEBUG] IMAGE_URL valor bruto: "${imageUrl}" (tipo: ${typeof imageUrl}, length: ${imageUrl.length})`);
      } else {
        console.log(`[DEBUG] IMAGE_URL não encontrado ou vazio`);
        // Verificar se existe no row com diferentes cases
        for (const key in row) {
          if (key.toUpperCase().includes('IMAGE') || key.toUpperCase().includes('URL')) {
            console.log(`[DEBUG] Campo relacionado encontrado: "${key}" = "${row[key]}"`);
          }
        }
      }
      
      if (imageUrl) {
        imageUrl = imageUrl.toString().trim();
        // Remover aspas extras (simples, duplas, triplas) que podem vir do CSV
        imageUrl = imageUrl.replace(/^["']+|["']+$/g, '').replace(/^"""+|"""+$/g, '').replace(/^'''+|'''+$/g, '');
        // Limpar espaços extras
        imageUrl = imageUrl.trim();
        // Normalizar barras do caminho (manter barras invertidas do Windows ou converter / para \ se necessário)
        // Não converter se for URL HTTP/HTTPS
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          // Se começar com letra seguida de :, é caminho absoluto do Windows (ex: C:\)
          // Manter como está (barras invertidas)
        }
        console.log(`[IMAGE] IMAGE_URL encontrado e processado: "${imageUrl}"`);
      } else {
        console.log(`[AVISO] IMAGE_URL não encontrado no CSV para esta linha`);
      }

      // Debug: mostrar TODOS os campos do row antes de mapear
      console.log(`[DEBUG] Row completo para debug:`, JSON.stringify(row, null, 2));
      
      const mapped = {
        STYLE_NAME: styleName || 'N/A',
        VPN: vpn || 'N/A',
        COLOR: color || 'N/A',
        SIZE: size,
        BARCODE: barcode || '',
        DESCRIPTION: row.DESCRIPTION || '',
        REF: row.REF || '',
        QTY: parseInt(row.QTY) || 1,
        PO: poNumber || '0000', // Armazenar PO extraído
        LOCAL: localNumber || '',
        IMAGE_URL: imageUrl || '' // Armazenar URL/caminho da imagem do QR code
      };
      
      // Debug: verificar valores finais de PO e LOCAL
      console.log(`[DATA] Mapped final - PO: "${mapped.PO}", LOCAL: "${mapped.LOCAL}"`);
      console.log(`[DATA] PO processado: poNumber="${poNumber}", localNumber="${localNumber}"`);
      console.log(`[IMAGE] Mapped final - IMAGE_URL: "${mapped.IMAGE_URL}"`);

      if (!mapped.SIZE || mapped.SIZE === 'N/A') {
        console.warn(`[labels] SIZE não extraído: SKU="${sku}", headers podem estar diferentes ou valor ausente.`);
      }

      return mapped;
    });

    // Limpar arquivo temporÃ¡rio
    fs.unlinkSync(req.file.path);
    
    // Debug: verificar se PO e LOCAL estão nos dados retornados
    if (data.length > 0) {
      console.log(`[OK] Primeiro item retornado:`, JSON.stringify(data[0], null, 2));
      console.log(`[OK] Primeiro item - PO: "${data[0].PO}", LOCAL: "${data[0].LOCAL}"`);
      console.log(`[OK] Primeiro item - IMAGE_URL: "${data[0].IMAGE_URL}"`);
      console.log(`[OK] Primeiro item - Chaves disponíveis:`, Object.keys(data[0]));
    }

    res.json({
      message: 'Arquivo processado com sucesso',
      data: data,
      totalRecords: data.length
    });

  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Gerar preview das etiquetas
app.post('/api/generate-preview', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Dados invÃ¡lidos' });
    }

    const previews = [];
    
    // Expandir dados baseado no campo QTY para calcular total de etiquetas
    let totalLabels = 0;
    for (const item of data) {
      const qty = parseInt(item.QTY) || 1;
      totalLabels += qty;
    }

    console.log(`Gerando previews para ${totalLabels} etiquetas de ${data.length} itens`);

    // Gerar previews para TODAS as etiquetas (sem limitaÃ§Ã£o)
    for (const item of data) {
      const qty = parseInt(item.QTY) || 1;
      
      for (let i = 0; i < qty; i++) {
        const preview = await generateLabelPreview(item);
        previews.push({
          ...preview,
          itemIndex: data.indexOf(item),
          copyNumber: i + 1,
          totalCopies: qty
        });
      }
    }

    console.log(`Previews gerados: ${previews.length}`);

    res.json({
      previews: previews,
      totalItems: data.length,
      totalLabels: totalLabels,
      previewCount: previews.length
    });

  } catch (error) {
    console.error('Erro ao gerar preview:', error);
    res.status(500).json({ error: 'Erro ao gerar preview' });
  }
});

// Imprimir etiqueta individual via Python USB (SEM VOID)
app.post('/api/print-individual', async (req, res) => {
  try {
    const { data, quantity } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Dados inválidos para impressão' });
    }

    const requestedQty = quantity || data.length;
    console.log(`[PRINT] Imprimindo ${requestedQty} etiqueta(s) individual via Python USB...`);
    
    // Usar o módulo Python USB que funciona sem VOID
    const results = [];
    
    // Carregar template oficial da Larroud (fora do loop para melhor performance)
    const fs = require('fs');
    const path = require('path');
    const templatePath = path.join(__dirname, process.env.TEMPLATE_PATH || '../templates/TEMPLATE_LARROUD_OFICIAL.zpl');
    let larroudTemplate;
    
    try {
      larroudTemplate = fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      return res.status(500).json({ error: 'Template oficial não encontrado' });
    }

    // Carregar layout customizado (se existir) - fora do loop
    // Usar layoutName do request se fornecido, senão usar o padrão
    const layoutName = req.body.layoutName || 'Default';
    console.log(`[DEBUG] [PRINT-INDIVIDUAL] Tentando carregar layout: "${layoutName}"`);
    
    let layout = null;
    try {
      // Sempre usar caminho relativo ao projeto (portável)
      const layoutsDir = path.join(__dirname, 'layouts');
      
      // Garantir que o diretório existe
      if (!fs.existsSync(layoutsDir)) {
        fs.mkdirSync(layoutsDir, { recursive: true });
        console.log(`[OK] Diretório layouts criado: ${layoutsDir}`);
      }
      
      const layoutPath = path.join(layoutsDir, `${layoutName}.json`);
      
      console.log(`[DEBUG] [PRINT-INDIVIDUAL] Procurando layout em: ${layoutPath}`);
      console.log(`[DEBUG] [PRINT-INDIVIDUAL] Layout existe? ${fs.existsSync(layoutPath)}`);
      
      if (fs.existsSync(layoutPath)) {
        const layoutData = fs.readFileSync(layoutPath, 'utf8');
        const layoutObj = JSON.parse(layoutData);
        layout = layoutObj.layout || layoutObj;
        console.log(`[OK] Layout "${layoutName}" carregado para impressão individual`);
        console.log('[DEBUG] Layout keys:', Object.keys(layout));
        // Verificar alguns valores para confirmar que está em dots
        if (layout.labelStyleName) {
          console.log('[DEBUG] Layout labelStyleName:', layout.labelStyleName);
        }
        if (layout.styleName) {
          console.log('[DEBUG] Layout styleName:', layout.styleName);
        }
      } else {
        console.warn(`[AVISO] Layout "${layoutName}" não encontrado em ${layoutPath}`);
        // Tentar carregar Default.json se o layout solicitado não existir
        const defaultLayoutPath = path.join(layoutsDir, 'Default.json');
        if (fs.existsSync(defaultLayoutPath) && layoutName !== 'Default') {
          console.log(`[DEBUG] Tentando carregar Default.json como fallback`);
          const layoutData = fs.readFileSync(defaultLayoutPath, 'utf8');
          const layoutObj = JSON.parse(layoutData);
          layout = layoutObj.layout || layoutObj;
          console.log('[OK] Layout Default carregado como fallback');
        } else {
          console.warn(`[AVISO] Nenhum layout encontrado. Usando template sem modificações.`);
        }
      }
    } catch (layoutError) {
      console.error(`[ERRO] Erro ao carregar layout "${layoutName}":`, layoutError.message);
      console.error(layoutError.stack);
    }
    
    // Se não encontrou layout, criar layout padrão vazio para não quebrar
    if (!layout) {
      console.warn(`[AVISO] Layout "${layoutName}" não foi carregado. Usando template sem modificações.`);
      layout = {}; // Layout vazio para não quebrar o código
    }
    
    // Processar cada item com numeração sequencial
    let totalEtiquetasProcessadas = 0;
    for (const item of data) {
      const itemQty = parseInt(item.QTY) || 1;
      
      // Para cada item, gerar as etiquetas com numeração sequencial
      for (let seq = 1; seq <= itemQty; seq++) {
        totalEtiquetasProcessadas++;
        
        try {
          // Dados básicos do item
          const styleName = String(item.STYLE_NAME || 'N/A');
          const vpn = String(item.VPN || 'N/A');
          const color = String(item.DESCRIPTION || item.COLOR || 'N/A');
          const size = String(item.SIZE || 'N/A');
          const referencia = String(item.REF || item.referencia || '').trim();
          
          // Usar PO do CSV (já extraído no upload)
          const poNumber = item.PO || '0000';
          const poFormatted = `PO${poNumber}`;
          
          // Gerar barcode sequencial: barcode + PO(sem letras) + sequencial
          const barcodeSource = String(item.BARCODE || vpn.replace(/-/g, '') || '00000000');
          const baseBarcode = barcodeSource.substring(0, 12); // Usar barcode completo para RFID
          const sequentialBarcode = `${barcodeSource.substring(0, 8)}${poNumber}${seq}`;
          
          // Dados para RFID: formato ZebraDesigner que funcionou (24 chars com zeros)
          // Exemplo: 197416145132046412345678
          const rfidContent = RFIDUtils.generateZebraDesignerFormat(baseBarcode, poNumber, seq, 24);
          
          // Validar dados RFID (enviar como string direta, igual ZebraDesigner)
          RFIDUtils.validateRFIDData(rfidContent);
          
          console.log(`[RFID] RFID formato ZebraDesigner (string direta): ${rfidContent}`);
          
          // Buscar imagem da API Python usando a referência
          // Primeiro tentar usar IMAGE_URL do item (se já estiver presente)
          let imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || item.image_url || item['image_url'] || '';
          
          // Se não houver IMAGE_URL mas houver referência, buscar da API Python
          if (!imageUrl && referencia) {
            try {
              // Construir URL manualmente usando a referência normalizada
              const normalizedRef = referencia.replace(/[.\-]/g, '');
              if (normalizedRef.length === 7) {
                // Construir URL da API Python
                // Cloud Run: usar IMAGE_PROXY_URL se definido (URL completa do serviço)
                // Local: usar localhost com porta
                const imageProxyUrl = process.env.IMAGE_PROXY_URL;
                if (imageProxyUrl) {
                  // URL completa do serviço Cloud Run ou externo
                  imageUrl = `${imageProxyUrl.replace(/\/$/, '')}/image/reference/${normalizedRef}`;
                } else {
                  // Desenvolvimento local: usar localhost
                  const imageProxyPort = process.env._IMAGE_PROXY_ACTUAL_PORT || process.env.IMAGE_PROXY_PORT || '8000';
                  imageUrl = `http://127.0.0.1:${imageProxyPort}/image/reference/${normalizedRef}`;
                }
                console.log(`[IMAGE] ✅ URL construída para referência "${referencia}" (normalizada: ${normalizedRef}): ${imageUrl}`);
              } else {
                console.warn(`[IMAGE] ⚠️ Referência "${referencia}" não tem formato válido (esperado: 7 dígitos após normalização)`);
              }
            } catch (imageError) {
              console.warn(`[IMAGE] ⚠️ Erro ao construir URL da imagem: ${imageError.message}`);
            }
          }
          
          if (!imageUrl) {
            console.log(`[IMAGE] ⚠️ IMAGE_URL não disponível para referência "${referencia}"`);
          }
          
          // Aplicar layout customizado ao template se disponível
          let workingTemplate = larroudTemplate;
          // Verificar se layout tem propriedades (não é objeto vazio)
          if (layout && Object.keys(layout).length > 0) {
            // Substituir coordenadas dos labels (textos fixos)
            workingTemplate = workingTemplate.replace(/FT187,147/g, `FT${layout.labelStyleName?.x || 187},${layout.labelStyleName?.y || 147}`);
            workingTemplate = workingTemplate.replace(/FT188,176/g, `FT${layout.labelVpn?.x || 188},${layout.labelVpn?.y || 176}`);
            workingTemplate = workingTemplate.replace(/FT187,204/g, `FT${layout.labelColor?.x || 187},${layout.labelColor?.y || 204}`);
            workingTemplate = workingTemplate.replace(/FT187,234/g, `FT${layout.labelSize?.x || 187},${layout.labelSize?.y || 234}`);
            
            // Substituir coordenadas fixas por coordenadas do layout (dados editáveis)
            workingTemplate = workingTemplate.replace(/FT353,147/g, `FT${layout.styleName?.x || 353},${layout.styleName?.y || 147}`);
            workingTemplate = workingTemplate.replace(/FT353,175/g, `FT${layout.vpn?.x || 353},${layout.vpn?.y || 175}`);
            workingTemplate = workingTemplate.replace(/FT353,204/g, `FT${layout.color?.x || 353},${layout.color?.y || 204}`);
            workingTemplate = workingTemplate.replace(/FT353,232/g, `FT${layout.size?.x || 353},${layout.size?.y || 232}`);
            workingTemplate = workingTemplate.replace(/FT222,308/g, `FT${layout.barcode?.x || 222},${layout.barcode?.y || 308}`);
            workingTemplate = workingTemplate.replace(/FT77,355/g, `FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}`);
            workingTemplate = workingTemplate.replace(/FT737,167/g, `FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}`);
            workingTemplate = workingTemplate.replace(/FT739,355/g, `FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}`);
            workingTemplate = workingTemplate.replace(/FT701,220/g, `FT${layout.poInfo?.x || 701},${layout.poInfo?.y || 220}`);
            workingTemplate = workingTemplate.replace(/FT680,238/g, `FT${layout.localInfo?.x || 680},${layout.localInfo?.y || 238}`);
            
            // Substituir tamanhos de QR codes (após coordenadas já substituídas)
            workingTemplate = workingTemplate.replace(`FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}^BQN,2,3`, `FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}^BQN,2,${layout.qrTop?.size || 3}`);
            workingTemplate = workingTemplate.replace(`FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}^BQN,2,3`, `FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}^BQN,2,${layout.qrBottom?.size || 3}`);
            workingTemplate = workingTemplate.replace(`FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}^BQN,2,3`, `FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}^BQN,2,${layout.qrLeft?.size || 3}`);
            
            // Substituir fontSize (dentro de ^A0N,height,width)
            // Aplicar depois das coordenadas já substituídas
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,20,23/g, (match, p1, p2) => {
              // Verificar se a coordenada corresponde a algum dos nossos elementos
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.labelStyleName?.x && y === layout.labelStyleName?.y) {
                return `FT${x},${y}^A0N,${layout.labelStyleName.fontSize || 20},${layout.labelStyleName.fontSize || 20}`;
              } else if (x === layout.labelVpn?.x && y === layout.labelVpn?.y) {
                return `FT${x},${y}^A0N,${layout.labelVpn.fontSize || 20},${layout.labelVpn.fontSize || 20}`;
              } else if (x === layout.labelColor?.x && y === layout.labelColor?.y) {
                return `FT${x},${y}^A0N,${layout.labelColor.fontSize || 20},${layout.labelColor.fontSize || 20}`;
              } else if (x === layout.labelSize?.x && y === layout.labelSize?.y) {
                return `FT${x},${y}^A0N,${layout.labelSize.fontSize || 20},${layout.labelSize.fontSize || 20}`;
              }
              return match;
            });
            
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,23,23/g, (match) => {
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.styleName?.x && y === layout.styleName?.y) {
                return `FT${x},${y}^A0N,${layout.styleName.fontSize || 23},${layout.styleName.fontSize || 23}`;
              } else if (x === layout.vpn?.x && y === layout.vpn?.y) {
                return `FT${x},${y}^A0N,${layout.vpn.fontSize || 23},${layout.vpn.fontSize || 23}`;
              } else if (x === layout.color?.x && y === layout.color?.y) {
                return `FT${x},${y}^A0N,${layout.color.fontSize || 23},${layout.color.fontSize || 23}`;
              } else if (x === layout.size?.x && y === layout.size?.y) {
                return `FT${x},${y}^A0N,${layout.size.fontSize || 23},${layout.size.fontSize || 23}`;
              }
              return match;
            });
            
            // Substituir fontSize da PO e LOCAL de forma mais robusta
            // Procurar por qualquer tamanho de fonte na posição da PO/LOCAL
            if (layout.poInfo) {
              const poX = layout.poInfo.x;
              const poY = layout.poInfo.y;
              const poFontSize = layout.poInfo.fontSize || 16;
              // Substituir qualquer ^A0N com as coordenadas da PO (qualquer tamanho)
              workingTemplate = workingTemplate.replace(
                new RegExp(`FT${poX},${poY}\\^A0N,\\d+,\\d+`, 'g'),
                `FT${poX},${poY}^A0N,${poFontSize},${poFontSize}`
              );
              console.log(`[OK] PO fontSize aplicado: ${poFontSize} na posição (${poX},${poY})`);
            }
            
            if (layout.localInfo) {
              const localX = layout.localInfo.x;
              const localY = layout.localInfo.y;
              const localFontSize = layout.localInfo.fontSize || 16;
              // Substituir qualquer ^A0N com as coordenadas do LOCAL (qualquer tamanho)
              workingTemplate = workingTemplate.replace(
                new RegExp(`FT${localX},${localY}\\^A0N,\\d+,\\d+`, 'g'),
                `FT${localX},${localY}^A0N,${localFontSize},${localFontSize}`
              );
            }
            
            // Ajustar retângulos/bordas
            workingTemplate = workingTemplate.replace(/FO31,80\^GB640,280,3/g, 
              `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
            workingTemplate = workingTemplate.replace(/FO177,81\^GB0,275,3/g,
              `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
            
            // Aplicar altura e largura do barcode usando comando ^BY
            // O comando ^BYw,r,h define: w=largura do módulo, r=razão de largura, h=altura do módulo
            // Converter altura do layout (pixels) para altura do módulo em pontos
            if (layout.barcode?.height || layout.barcode?.width) {
              const barcodeHeight = layout.barcode?.height 
                ? Math.round(layout.barcode.height / 1.5) // Converter pixels para altura do módulo
                : 39; // Padrão
              
              // Para largura, usar o primeiro parâmetro do ^BY
              // A largura do barcode é controlada pela largura do módulo (primeiro parâmetro)
              // Valores típicos: 2-10, onde maior = mais largo
              const barcodeWidth = layout.barcode?.width 
                ? Math.max(2, Math.min(10, Math.round(layout.barcode.width / 100))) // Converter pixels para módulo (2-10)
                : 2; // Padrão
              
              workingTemplate = workingTemplate.replace(/BY2,2,39/g, `BY${barcodeWidth},2,${barcodeHeight}`);
              console.log(`[OK] Barcode aplicado: largura=${layout.barcode.width || 'padrão'}px -> módulo w=${barcodeWidth}, altura=${layout.barcode.height || 'padrão'}px -> módulo h=${barcodeHeight}`);
            }
          }
          
          // IMAGE_URL da API Python: usar APENAS como imagem do produto (NÃO como QR code)
          // QR codes são gerados SEMPRE com dados da VPN usando ^BQN
          console.log(`[IMAGE] IMAGE_URL da API Python será usado APENAS como imagem do produto (não como QR code)`);
          
          // QR codes: SEMPRE gerar com dados da VPN
          // Os QR codes são gerados automaticamente pelo comando ^BQN do ZPL usando os dados da VPN
          let qrData1 = vpn;
          let qrData2 = vpn;
          let qrData3 = vpn;
          console.log(`[QR] ✅ QR codes serão gerados com dados VPN: "${vpn}"`);
          console.log(`[QR] Os QR codes serão renderizados pelo comando ^BQN do ZPL usando {QR_DATA_1}, {QR_DATA_2}, {QR_DATA_3}`);

          // Processar imagem do sapato usando função compartilhada
          // Isso garante que print-individual e print-all usem exatamente a mesma configuração
          const imageResult = await processProductImage(imageUrl, layout, 'print-individual');
          const { imageX, imageY, imageWidth, imageHeight, imageZPL: shoeImageZPL } = imageResult;
          
          // Inserir imagem no template se disponível
          if (shoeImageZPL && shoeImageZPL.trim() !== '') {
            const imageCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
            console.log(`[IMAGE] [INSERÇÃO] Comando ZPL completo gerado: ^FO${imageX},${imageY}...`);
            
            // Procurar por placeholder {IMAGE} ou inserir após o segundo ^XA
            if (workingTemplate.includes('{IMAGE}')) {
              workingTemplate = workingTemplate.replace(/{IMAGE}/g, imageCommand);
              console.log(`[IMAGE] ✅ Imagem inserida no placeholder {IMAGE} na posição (${imageX}, ${imageY})`);
          } else {
              // Inserir após o segundo ^XA (início da etiqueta)
              const xaMatches = workingTemplate.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
              
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingTemplate = workingTemplate.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  return xaIndex === 2 ? `${match}\n${imageCommand}` : match;
                });
            } else {
                workingTemplate = workingTemplate.replace(/^XA/m, `^XA\n${imageCommand}`);
            }
              console.log(`[IMAGE] ✅ Imagem inserida na posição (${imageX}, ${imageY})`);
          }

            // Verificação final
            if (workingTemplate.includes('^GFA')) {
              console.log(`[IMAGE] ✅ Imagem confirmada no template antes das substituições de variáveis`);
            }
          }
          
          // Código antigo removido - agora usando função compartilhada processProductImage
          // Todo o processamento de imagem foi movido para processProductImage() para garantir consistência

          // Verificar se a imagem foi inserida no template antes de fazer substituições
          const imageInserted = workingTemplate.includes('^GFA') || workingTemplate.includes(`^FO${imageX || 50},${imageY || 70}`);
          if (imageInserted) {
            console.log(`[IMAGE] ✅ Imagem confirmada no template antes das substituições de variáveis`);
          } else if (imageUrl && imageUrl.trim() !== '') {
            console.warn(`[IMAGE] ⚠️ Imagem NÃO encontrada no template após inserção! Verificando...`);
          }

          // PRESERVAR IMAGEM ANTES DE REMOVER COMANDOS RFID
          // Extrair o comando da imagem para preservá-lo durante a remoção de RFID
          let preservedImageCommand = null;
          if (shoeImageZPL && shoeImageZPL.trim() !== '') {
            // Procurar pelo comando completo da imagem no template
            const imagePattern = new RegExp(`\\^FO${imageX || '\\d+'},${imageY || '\\d+'}[^\\^]*\\^GFA[^\\^]*\\^FS`, 'g');
            const imageMatch = workingTemplate.match(imagePattern);
            if (imageMatch && imageMatch.length > 0) {
              preservedImageCommand = imageMatch[0];
              console.log(`[IMAGE] ✅ Comando da imagem preservado antes da remoção de RFID: ${preservedImageCommand.substring(0, 100)}...`);
            }
            }
            
          // REMOVER COMANDOS RFID ANTES DE SUBSTITUIR VARIÁVEIS
          // Comandos RFID (^RFW, ^RFR, ^RFI, etc.) podem causar "void" na etiqueta quando não conseguem gravar
          // Remover completamente para evitar problemas durante testes
          // IMPORTANTE: Usar regex mais específico para não remover comandos de imagem (^GFA)
          workingTemplate = workingTemplate.replace(/^\^RFW[^\^]*\^FS$/gm, ''); // Remove linha completa com ^RFW
          workingTemplate = workingTemplate.replace(/\^RFW[^\^]*\^FS/g, ''); // Remove ^RFW em qualquer lugar
          workingTemplate = workingTemplate.replace(/\^RFR[^\^]*\^FS/g, ''); // Remove ^RFR
          workingTemplate = workingTemplate.replace(/\^RFI[^\^]*\^FS/g, ''); // Remove ^RFI
          workingTemplate = workingTemplate.replace(/\^RFT[^\^]*\^FS/g, ''); // Remove ^RFT
          workingTemplate = workingTemplate.replace(/\^RFU[^\^]*\^FS/g, ''); // Remove ^RFU
          console.log(`[RFID] ✅ Comandos RFID removidos do template para evitar "void" durante testes`);
          
          // RESTAURAR IMAGEM SE FOI REMOVIDA ACIDENTALMENTE
          if (preservedImageCommand && !workingTemplate.includes('^GFA')) {
            console.log(`[IMAGE] ⚠️ Imagem foi removida acidentalmente, restaurando...`);
            // Inserir imagem após o segundo ^XA (início da etiqueta)
            const xaMatches = workingTemplate.match(/\^XA/g);
            const xaCount = xaMatches ? xaMatches.length : 0;
            if (xaCount >= 2) {
              let xaIndex = 0;
              workingTemplate = workingTemplate.replace(/\^XA/g, (match) => {
                xaIndex++;
                if (xaIndex === 2) {
                  return `${match}\n${preservedImageCommand}`;
                }
                return match;
              });
              console.log(`[IMAGE] ✅ Imagem restaurada após remoção de RFID`);
            } else if (xaCount === 1) {
              workingTemplate = workingTemplate.replace(/^XA/m, `^XA\n${preservedImageCommand}`);
              console.log(`[IMAGE] ✅ Imagem restaurada após remoção de RFID (único ^XA)`);
            }
          }

          // Substituir variáveis no template com dados sequenciais
          let workingZPL = workingTemplate
            .replace(/{STYLE_NAME}/g, styleName)
            .replace(/{VPN}/g, vpn)
            .replace(/{VPM}/g, vpn)
            .replace(/{COLOR}/g, color)
            .replace(/{SIZE}/g, size)
            .replace(/{QR_DATA}/g, qrData1)
            .replace(/{QR_DATA_1}/g, qrData1)
            .replace(/{QR_DATA_2}/g, qrData2)
            .replace(/{QR_DATA_3}/g, qrData3)
            .replace(/{PO_INFO}/g, poFormatted)
            .replace(/{LOCAL_INFO}/g, '') // LOCAL ignorado - campo vazio
            .replace(/{BARCODE}/g, sequentialBarcode) // Usar barcode sequencial
            .replace(/{RFID_DATA_HEX}/g, '') // Remover dados RFID (não usar mais)
            .replace(/{RFID_DATA}/g, ''); // Remover dados RFID (não usar mais)
          
          // Remover texto "GRAVADO RFID: {RFID_STATUS}" completamente
          // Substituir {RFID_STATUS} por string vazia e remover linha completa se necessário
          workingZPL = workingZPL.replace(/\^FT[^\^]*GRAVADO RFID:[^\^]*\^FS/g, ''); // Remove linha completa com "GRAVADO RFID"
          workingZPL = workingZPL.replace(/{RFID_STATUS}/g, ''); // Remove placeholder restante
          
          // Remover qualquer linha que contenha "GRAVADO RFID" (com ou sem placeholder)
          workingZPL = workingZPL.replace(/[^\n]*GRAVADO RFID[^\n]*\n?/g, '');
          
          // Verificar se ainda há comandos RFID restantes e remover TODOS
          // Remover comandos RFID mesmo que estejam vazios ou incompletos
          workingZPL = workingZPL.replace(/\^RFW[^\^]*\^FS/g, ''); // Remove ^RFW
          workingZPL = workingZPL.replace(/\^RFR[^\^]*\^FS/g, ''); // Remove ^RFR
          workingZPL = workingZPL.replace(/\^RFI[^\^]*\^FS/g, ''); // Remove ^RFI
          workingZPL = workingZPL.replace(/\^RFT[^\^]*\^FS/g, ''); // Remove ^RFT
          workingZPL = workingZPL.replace(/\^RFU[^\^]*\^FS/g, ''); // Remove ^RFU
          // Remover qualquer comando que comece com ^RF (catch-all)
          workingZPL = workingZPL.replace(/\^RF[^\^]*\^FS/g, '');
          // Remover comandos RFID que não terminam com ^FS (casos incompletos)
          workingZPL = workingZPL.replace(/\^RFW[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFR[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFI[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFT[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFU[^\n]*/g, '');
          
          if (workingZPL.includes('^RF')) {
            console.warn(`[RFID] ⚠️ Aviso: Ainda há comandos RFID no ZPL após remoção, removendo novamente...`);
            // Última tentativa: remover qualquer coisa que comece com ^RF até o próximo ^ ou quebra de linha
            workingZPL = workingZPL.replace(/\^RF[^\^\\n]*/g, '');
          }
          
          // Verificar se ainda há placeholders não substituídos que possam causar "void"
          // IMPORTANTE: Não remover {IMAGE} se ainda estiver presente (pode ser inserido depois)
          const remainingPlaceholders = workingZPL.match(/{[^}]+}/g);
          if (remainingPlaceholders && remainingPlaceholders.length > 0) {
            // Filtrar placeholders conhecidos que devem ser preservados
            const knownPlaceholders = ['IMAGE']; // Placeholders que podem ser inseridos depois
            const unknownPlaceholders = remainingPlaceholders.filter(p => {
              const placeholderName = p.replace(/[{}]/g, '').toUpperCase();
              return !knownPlaceholders.includes(placeholderName);
            });
            
            if (unknownPlaceholders.length > 0) {
              console.warn(`[AVISO] Placeholders não substituídos encontrados: ${unknownPlaceholders.join(', ')}`);
              // Remover apenas placeholders desconhecidos (não {IMAGE})
              unknownPlaceholders.forEach(placeholder => {
                workingZPL = workingZPL.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), '');
              });
            }
          }
          
          // Verificar se a imagem está presente no ZPL final
          const imageInFinalZPL = workingZPL.includes('^GFA');
          if (imageInFinalZPL) {
            console.log(`[IMAGE] ✅ Imagem confirmada no ZPL final (contém ^GFA)`);
            // Verificar se o comando completo está presente
            if (shoeImageZPL && imageX && imageY) {
              const imageCommandPattern = `^FO${imageX},${imageY}`;
              if (workingZPL.includes(imageCommandPattern)) {
                console.log(`[IMAGE] ✅ Comando completo da imagem encontrado no ZPL final: ${imageCommandPattern}...`);
              } else {
                console.warn(`[IMAGE] ⚠️ Comando da imagem não encontrado no ZPL final, mas ^GFA está presente`);
              }
            }
          } else if (imageUrl && imageUrl.trim() !== '') {
            console.error(`[IMAGE] ❌ ERRO: Imagem NÃO encontrada no ZPL final!`);
            console.error(`[IMAGE] Verificando se foi removida acidentalmente...`);
            // Tentar inserir a imagem novamente se ainda tivermos o comando preservado
            if (preservedImageCommand) {
              console.log(`[IMAGE] 🔄 Tentando restaurar imagem usando comando preservado...`);
              const xaMatches = workingZPL.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingZPL = workingZPL.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  if (xaIndex === 2) {
                    return `${match}\n${preservedImageCommand}`;
                  }
                  return match;
                });
                console.log(`[IMAGE] ✅ Imagem restaurada no ZPL final após verificação`);
              } else if (xaCount === 1) {
                workingZPL = workingZPL.replace(/^XA/m, `^XA\n${preservedImageCommand}`);
                console.log(`[IMAGE] ✅ Imagem restaurada no ZPL final após verificação (único ^XA)`);
              }
            } else if (shoeImageZPL && imageX && imageY) {
              // Se não tivermos o comando preservado, tentar reconstruir
              const imageCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
              console.log(`[IMAGE] 🔄 Tentando inserir imagem reconstruída no ZPL final...`);
              const xaMatches = workingZPL.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingZPL = workingZPL.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  if (xaIndex === 2) {
                    return `${match}\n${imageCommand}`;
                  }
                  return match;
                });
                console.log(`[IMAGE] ✅ Imagem reconstruída e inserida no ZPL final`);
              }
            }
          }
          
          // Se ainda houver {IMAGE} no ZPL final, significa que a imagem não foi inserida
          // Isso não é um erro fatal, apenas um aviso
          if (workingZPL.includes('{IMAGE}')) {
            console.warn(`[AVISO] Placeholder {IMAGE} ainda presente no ZPL final - imagem pode não ter sido inserida`);
          }

          // Log completo do ZPL para debug
          console.log('\n============ ZPL FINAL GERADO ============');
          console.log(workingZPL);
          console.log('=========================================\n');

          // Verificar conexão antes de imprimir (reconectar se necessário)
          try {
            console.log(`[PRINT] Verificando conexão com impressora antes de imprimir etiqueta ${seq}/${itemQty}...`);
            const connectionTest = await pythonUSBIntegration.testConnection();
            if (!connectionTest.success || !pythonUSBIntegration.isConnected) {
              console.warn(`[PRINT] ⚠️ Impressora não está conectada, tentando reconectar...`);
              // Tentar detectar impressora novamente
              await pythonUSBIntegration.ensurePrinterName();
              const retryTest = await pythonUSBIntegration.testConnection();
              if (!retryTest.success || !pythonUSBIntegration.isConnected) {
                throw new Error(`Impressora não está online. Verifique se a impressora está ligada e conectada. Status: ${JSON.stringify(retryTest.result)}`);
              }
              console.log(`[PRINT] ✅ Reconexão bem-sucedida!`);
            }
          } catch (connectionError) {
            console.error(`[PRINT] ❌ Erro ao verificar conexão: ${connectionError.message}`);
            throw new Error(`Erro de conexão com a impressora: ${connectionError.message}. Verifique se a impressora está conectada e tente novamente.`);
          }

          // Imprimir cada etiqueta individual (1 cópia por vez para manter sequência)
          const printResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
          
          if (!printResult.success) {
            console.error(`[PRINT] ❌ Erro ao imprimir etiqueta ${seq}/${itemQty}: ${printResult.error}`);
            // Se o erro for de conexão, tentar reconectar e imprimir novamente uma vez
            if (printResult.error && (printResult.error.includes('online') || printResult.error.includes('conectada') || printResult.error.includes('Network'))) {
              console.log(`[PRINT] Tentando reconectar e reimprimir...`);
              try {
                await pythonUSBIntegration.ensurePrinterName();
                const retryResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
                if (retryResult.success) {
                  console.log(`[PRINT] ✅ Reimpressão bem-sucedida após reconexão!`);
                  results.push({
                    item: `${styleName} (${seq}/${itemQty})`,
                    barcode: sequentialBarcode,
                    rfid: rfidContent,
                    success: true,
                    message: `Etiqueta ${seq} impressa com sucesso (após reconexão)`,
                    details: retryResult.result
                  });
                  console.log(`[OK] Etiqueta ${styleName} ${seq}/${itemQty} processada: OK (após reconexão)`);
                  console.log(`   [DATA] Barcode: ${sequentialBarcode}`);
                  console.log(`   [RFID] RFID String Direta: ${rfidContent}`);
                } else {
                  throw new Error(retryResult.error || 'Erro ao reimprimir após reconexão');
                }
              } catch (retryError) {
                throw new Error(`Erro de conexão com a impressora: ${retryError.message}. Verifique se a impressora está conectada e tente novamente.`);
              }
            } else {
              throw new Error(printResult.error || 'Erro desconhecido ao imprimir');
            }
          } else {
          results.push({
            item: `${styleName} (${seq}/${itemQty})`,
            barcode: sequentialBarcode,
            rfid: rfidContent,
            success: printResult.success,
            message: printResult.success ? `Etiqueta ${seq} impressa com sucesso` : printResult.error,
            details: printResult.result
          });
          
          console.log(`[OK] Etiqueta ${styleName} ${seq}/${itemQty} processada:`, printResult.success ? 'OK' : printResult.error);
          console.log(`   [DATA] Barcode: ${sequentialBarcode}`);
          console.log(`   [RFID] RFID String Direta: ${rfidContent}`);
          }
          
        } catch (error) {
          console.error(`[ERRO] Erro ao processar ${item.STYLE_NAME} ${seq}/${itemQty}:`, error);
          const errorMessage = error.message || 'Erro desconhecido';
          results.push({
            item: `${item.STYLE_NAME || 'Desconhecido'} (${seq}/${itemQty})`,
            success: false,
            message: errorMessage,
            error: errorMessage.includes('conexão') || errorMessage.includes('online') || errorMessage.includes('Network') 
              ? 'Erro de conexão com a impressora. Verifique se a impressora está conectada e tente novamente.'
              : errorMessage
          });
        }
      } // Fim do loop de sequência
    } // Fim do loop de itens
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      message: `${successCount}/${results.length} etiquetas sequenciais impressas com sucesso`,
      results: results,
      totalItems: data.length,
      totalEtiquetas: totalEtiquetasProcessadas,
      successCount: successCount,
      timestamp: new Date().toISOString(),
      info: "Sistema com PO na RFID e barcode sequencial ativo"
    });

  } catch (error) {
    console.error('Erro na impressão individual:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Imprimir TODAS as etiquetas diretamente via Python USB (SEM VOID)
app.post('/api/print-all', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Dados inválidos para impressão' });
    }

    console.log(`[PRINT] Imprimindo TODAS as ${data.length} etiquetas via Python USB...`);
    
    // Usar o mesmo sistema do print-individual
    const results = [];
    let totalEtiquetasProcessadas = 0;
    
    // Carregar template oficial da Larroud (fora do loop para melhor performance)
    const templatePath = path.join(__dirname, '../templates/TEMPLATE_LARROUD_OFICIAL.zpl');
    let larroudTemplate;
    try {
      larroudTemplate = fs.readFileSync(templatePath, 'utf8');
    } catch (fileError) {
      console.error('Erro ao carregar template:', fileError.message);
      return res.status(500).json({ error: 'Template ZPL não encontrado' });
    }

    // Carregar layout customizado (se existir) - fora do loop
    // Usar layoutName do request se fornecido, senão usar o padrão
    const layoutName = req.body.layoutName || 'Default';
    console.log(`[DEBUG] [PRINT-ALL] Tentando carregar layout: "${layoutName}"`);
    
    let layout = null;
    try {
      // Sempre usar caminho relativo ao projeto (portável)
      const layoutsDir = path.join(__dirname, 'layouts');
      
      // Garantir que o diretório existe
      if (!fs.existsSync(layoutsDir)) {
        fs.mkdirSync(layoutsDir, { recursive: true });
        console.log(`[OK] Diretório layouts criado: ${layoutsDir}`);
      }
      
      const layoutPath = path.join(layoutsDir, `${layoutName}.json`);
      
      console.log(`[DEBUG] [PRINT-ALL] Procurando layout em: ${layoutPath}`);
      console.log(`[DEBUG] [PRINT-ALL] Layout existe? ${fs.existsSync(layoutPath)}`);
      
      if (fs.existsSync(layoutPath)) {
        const layoutData = fs.readFileSync(layoutPath, 'utf8');
        const layoutObj = JSON.parse(layoutData);
        layout = layoutObj.layout || layoutObj;
        console.log(`[OK] Layout "${layoutName}" carregado para impressão em massa`);
        console.log('[DEBUG] Layout keys:', Object.keys(layout));
        // Verificar alguns valores para confirmar que está em dots
        if (layout.labelStyleName) {
          console.log('[DEBUG] Layout labelStyleName:', layout.labelStyleName);
        }
        if (layout.styleName) {
          console.log('[DEBUG] Layout styleName:', layout.styleName);
        }
      } else {
        console.warn(`[AVISO] Layout "${layoutName}" não encontrado em ${layoutPath}`);
        // Tentar carregar Default.json se o layout solicitado não existir
        const defaultLayoutPath = path.join(layoutsDir, 'Default.json');
        if (fs.existsSync(defaultLayoutPath) && layoutName !== 'Default') {
          console.log(`[DEBUG] Tentando carregar Default.json como fallback`);
          const layoutData = fs.readFileSync(defaultLayoutPath, 'utf8');
          const layoutObj = JSON.parse(layoutData);
          layout = layoutObj.layout || layoutObj;
          console.log('[OK] Layout Default carregado como fallback');
        } else {
          console.warn(`[AVISO] Nenhum layout encontrado. Usando template sem modificações.`);
        }
      }
    } catch (layoutError) {
      console.error(`[ERRO] Erro ao carregar layout "${layoutName}":`, layoutError.message);
      console.error(layoutError.stack);
    }
    
    // Se não encontrou layout, criar layout padrão vazio para não quebrar
    if (!layout) {
      console.warn(`[AVISO] Layout "${layoutName}" não foi carregado. Usando template sem modificações.`);
      layout = {}; // Layout vazio para não quebrar o código
    }
    
    // Processar cada item com numeração sequencial
    for (const item of data) {
      const itemQty = parseInt(item.QTY) || 1;
      
      // Para cada item, gerar as etiquetas com numeração sequencial
      for (let seq = 1; seq <= itemQty; seq++) {
        totalEtiquetasProcessadas++;
        
        try {
          // Dados básicos do item
          const styleName = String(item.STYLE_NAME || 'N/A');
          const vpn = String(item.VPN || item.SKU || 'N/A');
          const color = String(item.DESCRIPTION || item.COLOR || 'N/A');
          const size = String(item.SIZE || 'N/A');
          const referencia = String(item.REF || item.referencia || '').trim();
          const barcodeBase = String(item.BARCODE || item.VPN || '000000000000').substring(0, 12).padStart(12, '0');
          
          // Gerar barcode sequencial (último dígito incrementado)
          const baseNumber = parseInt(barcodeBase.substring(0, 11)) || 0;
          const sequentialNumber = baseNumber + (seq - 1);
          const sequentialBarcode = String(sequentialNumber).padStart(12, '0');
          
          // PO vem do CSV (já extraído no upload)
          const poNumber = item.PO || '0000';
          
          // LOCAL vem do CSV (já extraído no upload)
          const localNumber = ''; // LOCAL ignorado
          
          // Formatar PO (sem letras, apenas números)
          const poFormatted = `PO${poNumber}`;
          
          // Gerar dados RFID no formato ZebraDesigner (Barcode + PO + Sequencial + Zeros)
          const rfidContent = RFIDUtils.generateZebraDesignerFormat(sequentialBarcode, poNumber, seq, 24);
          
          RFIDUtils.validateRFIDData(rfidContent);
          
          console.log(`[RFID] RFID formato ZebraDesigner (string direta): ${rfidContent}`);
          
          // Buscar imagem da API Python usando a referência
          // Primeiro tentar usar IMAGE_URL do item (se já estiver presente)
          let imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || item.image_url || item['image_url'] || '';
          
          // Se não houver IMAGE_URL mas houver referência, buscar da API Python
          if (!imageUrl && referencia) {
            try {
              // Construir URL manualmente usando a referência normalizada
              const normalizedRef = referencia.replace(/[.\-]/g, '');
              if (normalizedRef.length === 7) {
                // Construir URL da API Python
                // Cloud Run: usar IMAGE_PROXY_URL se definido (URL completa do serviço)
                // Local: usar localhost com porta
                const imageProxyUrl = process.env.IMAGE_PROXY_URL;
                if (imageProxyUrl) {
                  // URL completa do serviço Cloud Run ou externo
                  imageUrl = `${imageProxyUrl.replace(/\/$/, '')}/image/reference/${normalizedRef}`;
                } else {
                  // Desenvolvimento local: usar localhost
                  const imageProxyPort = process.env._IMAGE_PROXY_ACTUAL_PORT || process.env.IMAGE_PROXY_PORT || '8000';
                  imageUrl = `http://127.0.0.1:${imageProxyPort}/image/reference/${normalizedRef}`;
                }
                console.log(`[IMAGE] ✅ URL construída para referência "${referencia}" (normalizada: ${normalizedRef}): ${imageUrl} [print-all]`);
              } else {
                console.warn(`[IMAGE] ⚠️ Referência "${referencia}" não tem formato válido (esperado: 7 dígitos após normalização) [print-all]`);
              }
            } catch (imageError) {
              console.warn(`[IMAGE] ⚠️ Erro ao construir URL da imagem: ${imageError.message} [print-all]`);
            }
          }
          
          if (!imageUrl) {
            console.log(`[IMAGE] ⚠️ IMAGE_URL não disponível para referência "${referencia}" [print-all]`);
          }

          // Aplicar layout customizado ao template se disponível
          let workingTemplate = larroudTemplate;
          // Verificar se layout tem propriedades (não é objeto vazio)
          if (layout && Object.keys(layout).length > 0) {
            // Substituir coordenadas dos labels (textos fixos)
            workingTemplate = workingTemplate.replace(/FT187,147/g, `FT${layout.labelStyleName?.x || 187},${layout.labelStyleName?.y || 147}`);
            workingTemplate = workingTemplate.replace(/FT188,176/g, `FT${layout.labelVpn?.x || 188},${layout.labelVpn?.y || 176}`);
            workingTemplate = workingTemplate.replace(/FT187,204/g, `FT${layout.labelColor?.x || 187},${layout.labelColor?.y || 204}`);
            workingTemplate = workingTemplate.replace(/FT187,234/g, `FT${layout.labelSize?.x || 187},${layout.labelSize?.y || 234}`);
            
            // Substituir coordenadas fixas por coordenadas do layout (dados editáveis)
            // STYLE_NAME: FT353,147 -> FT{layout.styleName.x},{layout.styleName.y}
            workingTemplate = workingTemplate.replace(/FT353,147/g, `FT${layout.styleName?.x || 353},${layout.styleName?.y || 147}`);
            // VPN: FT353,175
            workingTemplate = workingTemplate.replace(/FT353,175/g, `FT${layout.vpn?.x || 353},${layout.vpn?.y || 175}`);
            // COLOR: FT353,204
            workingTemplate = workingTemplate.replace(/FT353,204/g, `FT${layout.color?.x || 353},${layout.color?.y || 204}`);
            // SIZE: FT353,232
            workingTemplate = workingTemplate.replace(/FT353,232/g, `FT${layout.size?.x || 353},${layout.size?.y || 232}`);
            // BARCODE: FT222,308
            workingTemplate = workingTemplate.replace(/FT222,308/g, `FT${layout.barcode?.x || 222},${layout.barcode?.y || 308}`);
            // QR LEFT: FT77,355
            workingTemplate = workingTemplate.replace(/FT77,355/g, `FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}`);
            // QR TOP: FT737,167
            workingTemplate = workingTemplate.replace(/FT737,167/g, `FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}`);
            // QR BOTTOM: FT739,355
            workingTemplate = workingTemplate.replace(/FT739,355/g, `FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}`);
            // PO INFO: FT701,220
            workingTemplate = workingTemplate.replace(/FT701,220/g, `FT${layout.poInfo?.x || 701},${layout.poInfo?.y || 220}`);
            // LOCAL INFO: FT680,238
            workingTemplate = workingTemplate.replace(/FT680,238/g, `FT${layout.localInfo?.x || 680},${layout.localInfo?.y || 238}`);
            
            // Substituir tamanhos de QR codes (após coordenadas já substituídas) - IMPORTANTE: mesma lógica do print-individual
            workingTemplate = workingTemplate.replace(`FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}^BQN,2,3`, `FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}^BQN,2,${layout.qrTop?.size || 3}`);
            workingTemplate = workingTemplate.replace(`FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}^BQN,2,3`, `FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}^BQN,2,${layout.qrBottom?.size || 3}`);
            workingTemplate = workingTemplate.replace(`FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}^BQN,2,3`, `FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}^BQN,2,${layout.qrLeft?.size || 3}`);
            
            // Substituir fontSize (depois das coordenadas)
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,20,23/g, (match) => {
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.labelStyleName?.x && y === layout.labelStyleName?.y) {
                return `FT${x},${y}^A0N,${layout.labelStyleName.fontSize || 20},${layout.labelStyleName.fontSize || 20}`;
              } else if (x === layout.labelVpn?.x && y === layout.labelVpn?.y) {
                return `FT${x},${y}^A0N,${layout.labelVpn.fontSize || 20},${layout.labelVpn.fontSize || 20}`;
              } else if (x === layout.labelColor?.x && y === layout.labelColor?.y) {
                return `FT${x},${y}^A0N,${layout.labelColor.fontSize || 20},${layout.labelColor.fontSize || 20}`;
              } else if (x === layout.labelSize?.x && y === layout.labelSize?.y) {
                return `FT${x},${y}^A0N,${layout.labelSize.fontSize || 20},${layout.labelSize.fontSize || 20}`;
              }
              return match;
            });
            
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,23,23/g, (match) => {
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.styleName?.x && y === layout.styleName?.y) {
                return `FT${x},${y}^A0N,${layout.styleName.fontSize || 23},${layout.styleName.fontSize || 23}`;
              } else if (x === layout.vpn?.x && y === layout.vpn?.y) {
                return `FT${x},${y}^A0N,${layout.vpn.fontSize || 23},${layout.vpn.fontSize || 23}`;
              } else if (x === layout.color?.x && y === layout.color?.y) {
                return `FT${x},${y}^A0N,${layout.color.fontSize || 23},${layout.color.fontSize || 23}`;
              } else if (x === layout.size?.x && y === layout.size?.y) {
                return `FT${x},${y}^A0N,${layout.size.fontSize || 23},${layout.size.fontSize || 23}`;
              }
              return match;
            });
            
            // Substituir fontSize da PO e LOCAL de forma mais robusta (PRINT-ALL)
            // Procurar por qualquer tamanho de fonte na posição da PO/LOCAL
            if (layout.poInfo) {
              const poX = layout.poInfo.x;
              const poY = layout.poInfo.y;
              const poFontSize = layout.poInfo.fontSize || 16;
              // Substituir qualquer ^A0N com as coordenadas da PO (qualquer tamanho)
              workingTemplate = workingTemplate.replace(
                new RegExp(`FT${poX},${poY}\\^A0N,\\d+,\\d+`, 'g'),
                `FT${poX},${poY}^A0N,${poFontSize},${poFontSize}`
              );
              console.log(`[OK] [PRINT-ALL] PO fontSize aplicado: ${poFontSize} na posição (${poX},${poY})`);
            }
            
            if (layout.localInfo) {
              const localX = layout.localInfo.x;
              const localY = layout.localInfo.y;
              const localFontSize = layout.localInfo.fontSize || 16;
              // Substituir qualquer ^A0N com as coordenadas do LOCAL (qualquer tamanho)
              workingTemplate = workingTemplate.replace(
                new RegExp(`FT${localX},${localY}\\^A0N,\\d+,\\d+`, 'g'),
                `FT${localX},${localY}^A0N,${localFontSize},${localFontSize}`
              );
            }
            
            // Ajustar retângulos/bordas
            // Retângulo principal: ^FO31,80^GB640,280,3^FS
            workingTemplate = workingTemplate.replace(/FO31,80\^GB640,280,3/g, 
              `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
            
            // Linha divisória: ^FO177,81^GB0,275,3^FS
            workingTemplate = workingTemplate.replace(/FO177,81\^GB0,275,3/g,
              `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
            
            // Aplicar altura e largura do barcode usando comando ^BY
            // O comando ^BYw,r,h define: w=largura do módulo, r=razão de largura, h=altura do módulo
            if (layout.barcode?.height || layout.barcode?.width) {
              const barcodeHeight = layout.barcode?.height 
                ? Math.round(layout.barcode.height / 1.5) // Converter pixels para altura do módulo
                : 39; // Padrão
              
              // Para largura, usar o primeiro parâmetro do ^BY
              // A largura do barcode é controlada pela largura do módulo (primeiro parâmetro)
              // Valores típicos: 2-10, onde maior = mais largo
              const barcodeWidth = layout.barcode?.width 
                ? Math.max(2, Math.min(10, Math.round(layout.barcode.width / 100))) // Converter pixels para módulo (2-10)
                : 2; // Padrão
              
              workingTemplate = workingTemplate.replace(/BY2,2,39/g, `BY${barcodeWidth},2,${barcodeHeight}`);
              console.log(`[OK] [PRINT-ALL] Barcode aplicado: largura=${layout.barcode.width || 'padrão'}px -> módulo w=${barcodeWidth}, altura=${layout.barcode.height || 'padrão'}px -> módulo h=${barcodeHeight}`);
            }
          }
          
          // IMAGE_URL da API Python: usar APENAS como imagem do produto (NÃO como QR code)
          // QR codes são gerados SEMPRE com dados da VPN usando ^BQN
          console.log(`[IMAGE] IMAGE_URL da API Python será usado APENAS como imagem do produto (não como QR code) (print-all)`);
          
          // QR codes: SEMPRE gerar com dados da VPN
          // Os QR codes são gerados automaticamente pelo comando ^BQN do ZPL usando os dados da VPN
          let qrData1 = vpn;
          let qrData2 = vpn;
          let qrData3 = vpn;
          console.log(`[QR] ✅ QR codes serão gerados com dados VPN: "${vpn}" (print-all)`);
          console.log(`[QR] Os QR codes serão renderizados pelo comando ^BQN do ZPL usando {QR_DATA_1}, {QR_DATA_2}, {QR_DATA_3}`);

          // Processar imagem do sapato usando função compartilhada
          // Isso garante que print-individual e print-all usem exatamente a mesma configuração
          const imageResult = await processProductImage(imageUrl, layout, 'print-all');
          const { imageX, imageY, imageWidth, imageHeight, imageZPL: shoeImageZPL } = imageResult;
          
          // Inserir imagem no template se disponível
          if (shoeImageZPL && shoeImageZPL.trim() !== '') {
            const imageCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
            console.log(`[IMAGE] [INSERÇÃO] [print-all] Comando ZPL completo gerado: ^FO${imageX},${imageY}...`);
            
            // Procurar por placeholder {IMAGE} ou inserir após o segundo ^XA
            if (workingTemplate.includes('{IMAGE}')) {
              workingTemplate = workingTemplate.replace(/{IMAGE}/g, imageCommand);
              console.log(`[IMAGE] ✅ Imagem inserida no placeholder {IMAGE} na posição (${imageX}, ${imageY}) (print-all)`);
            } else {
              // Inserir após o segundo ^XA (início da etiqueta)
              const xaMatches = workingTemplate.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
          
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingTemplate = workingTemplate.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  return xaIndex === 2 ? `${match}\n${imageCommand}` : match;
                });
              } else {
                workingTemplate = workingTemplate.replace(/^XA/m, `^XA\n${imageCommand}`);
              }
              console.log(`[IMAGE] ✅ Imagem inserida na posição (${imageX}, ${imageY}) (print-all)`);
            }
            
            // Verificação final
            if (workingTemplate.includes('^GFA')) {
              console.log(`[IMAGE] ✅ Imagem confirmada no template antes das substituições de variáveis (print-all)`);
            }
          }
          
          // Código antigo removido - agora usando função compartilhada processProductImage
          // Todo o processamento de imagem foi movido para processProductImage() para garantir consistência

          // PRESERVAR IMAGEM ANTES DE REMOVER COMANDOS RFID (print-all)
          // Extrair o comando da imagem para preservá-lo durante a remoção de RFID
          let preservedImageCommand = null;
          if (shoeImageZPL && shoeImageZPL.trim() !== '') {
            // Procurar pelo comando completo da imagem no template
            const imagePattern = new RegExp(`\\^FO${imageX || '\\d+'},${imageY || '\\d+'}[^\\^]*\\^GFA[^\\^]*\\^FS`, 'g');
            const imageMatch = workingTemplate.match(imagePattern);
            if (imageMatch && imageMatch.length > 0) {
              preservedImageCommand = imageMatch[0];
              console.log(`[IMAGE] ✅ Comando da imagem preservado antes da remoção de RFID (print-all): ${preservedImageCommand.substring(0, 100)}...`);
            }
          }

          // REMOVER COMANDOS RFID ANTES DE SUBSTITUIR VARIÁVEIS (print-all)
          // Comandos RFID (^RFW, ^RFR, ^RFI, etc.) podem causar "void" na etiqueta quando não conseguem gravar
          // Remover completamente para evitar problemas durante testes
          // IMPORTANTE: Usar regex mais específico para não remover comandos de imagem (^GFA)
          workingTemplate = workingTemplate.replace(/^\^RFW[^\^]*\^FS$/gm, ''); // Remove linha completa com ^RFW
          workingTemplate = workingTemplate.replace(/\^RFW[^\^]*\^FS/g, ''); // Remove ^RFW em qualquer lugar
          workingTemplate = workingTemplate.replace(/\^RFR[^\^]*\^FS/g, ''); // Remove ^RFR
          workingTemplate = workingTemplate.replace(/\^RFI[^\^]*\^FS/g, ''); // Remove ^RFI
          workingTemplate = workingTemplate.replace(/\^RFT[^\^]*\^FS/g, ''); // Remove ^RFT
          workingTemplate = workingTemplate.replace(/\^RFU[^\^]*\^FS/g, ''); // Remove ^RFU
          console.log(`[RFID] ✅ Comandos RFID removidos do template para evitar "void" durante testes (print-all)`);
            
          // RESTAURAR IMAGEM SE FOI REMOVIDA ACIDENTALMENTE (print-all)
          if (preservedImageCommand && !workingTemplate.includes('^GFA')) {
            console.log(`[IMAGE] ⚠️ Imagem foi removida acidentalmente, restaurando... (print-all)`);
            // Inserir imagem após o segundo ^XA (início da etiqueta)
            const xaMatches = workingTemplate.match(/\^XA/g);
            const xaCount = xaMatches ? xaMatches.length : 0;
            if (xaCount >= 2) {
              let xaIndex = 0;
              workingTemplate = workingTemplate.replace(/\^XA/g, (match) => {
                xaIndex++;
                if (xaIndex === 2) {
                  return `${match}\n${preservedImageCommand}`;
                }
                return match;
              });
              console.log(`[IMAGE] ✅ Imagem restaurada após remoção de RFID (print-all)`);
            } else if (xaCount === 1) {
              workingTemplate = workingTemplate.replace(/^XA/m, `^XA\n${preservedImageCommand}`);
              console.log(`[IMAGE] ✅ Imagem restaurada após remoção de RFID (único ^XA) (print-all)`);
            }
          }

          // Substituir variáveis no template com dados sequenciais
          let workingZPL = workingTemplate
            .replace(/{STYLE_NAME}/g, styleName)
            .replace(/{VPN}/g, vpn)
            .replace(/{VPM}/g, vpn)
            .replace(/{COLOR}/g, color)
            .replace(/{SIZE}/g, size)
            .replace(/{QR_DATA}/g, qrData1)
            .replace(/{QR_DATA_1}/g, qrData1)
            .replace(/{QR_DATA_2}/g, qrData2)
            .replace(/{QR_DATA_3}/g, qrData3)
            .replace(/{PO_INFO}/g, poFormatted)
            .replace(/{LOCAL_INFO}/g, '') // LOCAL ignorado - campo vazio
            .replace(/{BARCODE}/g, sequentialBarcode)
            .replace(/{RFID_DATA_HEX}/g, '') // Remover dados RFID (não usar mais)
            .replace(/{RFID_DATA}/g, ''); // Remover dados RFID (não usar mais)
          
          // Remover texto "GRAVADO RFID: {RFID_STATUS}" completamente
          // Substituir {RFID_STATUS} por string vazia e remover linha completa se necessário
          workingZPL = workingZPL.replace(/\^FT[^\^]*GRAVADO RFID:[^\^]*\^FS/g, ''); // Remove linha completa com "GRAVADO RFID"
          workingZPL = workingZPL.replace(/{RFID_STATUS}/g, ''); // Remove placeholder restante
          
          // Remover qualquer linha que contenha "GRAVADO RFID" (com ou sem placeholder)
          workingZPL = workingZPL.replace(/[^\n]*GRAVADO RFID[^\n]*\n?/g, '');
          
          // Verificar se ainda há comandos RFID restantes e remover TODOS (print-all)
          // Remover comandos RFID mesmo que estejam vazios ou incompletos
          workingZPL = workingZPL.replace(/\^RFW[^\^]*\^FS/g, ''); // Remove ^RFW
          workingZPL = workingZPL.replace(/\^RFR[^\^]*\^FS/g, ''); // Remove ^RFR
          workingZPL = workingZPL.replace(/\^RFI[^\^]*\^FS/g, ''); // Remove ^RFI
          workingZPL = workingZPL.replace(/\^RFT[^\^]*\^FS/g, ''); // Remove ^RFT
          workingZPL = workingZPL.replace(/\^RFU[^\^]*\^FS/g, ''); // Remove ^RFU
          // Remover qualquer comando que comece com ^RF (catch-all)
          workingZPL = workingZPL.replace(/\^RF[^\^]*\^FS/g, '');
          // Remover comandos RFID que não terminam com ^FS (casos incompletos)
          workingZPL = workingZPL.replace(/\^RFW[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFR[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFI[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFT[^\n]*/g, '');
          workingZPL = workingZPL.replace(/\^RFU[^\n]*/g, '');
          
          if (workingZPL.includes('^RF')) {
            console.warn(`[RFID] ⚠️ Aviso: Ainda há comandos RFID no ZPL após remoção, removendo novamente... (print-all)`);
            // Última tentativa: remover qualquer coisa que comece com ^RF até o próximo ^ ou quebra de linha
            workingZPL = workingZPL.replace(/\^RF[^\^\\n]*/g, '');
          }
          
          // Verificar se ainda há placeholders não substituídos que possam causar "void"
          // IMPORTANTE: Não remover {IMAGE} se ainda estiver presente (pode ser inserido depois)
          const remainingPlaceholders = workingZPL.match(/{[^}]+}/g);
          if (remainingPlaceholders && remainingPlaceholders.length > 0) {
            // Filtrar placeholders conhecidos que devem ser preservados
            const knownPlaceholders = ['IMAGE']; // Placeholders que podem ser inseridos depois
            const unknownPlaceholders = remainingPlaceholders.filter(p => {
              const placeholderName = p.replace(/[{}]/g, '').toUpperCase();
              return !knownPlaceholders.includes(placeholderName);
            });
            
            if (unknownPlaceholders.length > 0) {
              console.warn(`[AVISO] [print-all] Placeholders não substituídos encontrados: ${unknownPlaceholders.join(', ')}`);
              // Remover apenas placeholders desconhecidos (não {IMAGE})
              unknownPlaceholders.forEach(placeholder => {
                workingZPL = workingZPL.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), '');
              });
            }
          }
          
          // Verificar se a imagem está presente no ZPL final
          const imageInFinalZPL = workingZPL.includes('^GFA');
          if (imageInFinalZPL) {
            console.log(`[IMAGE] ✅ Imagem confirmada no ZPL final (contém ^GFA) [print-all]`);
            // Verificar se o comando completo está presente
            if (shoeImageZPL && imageX && imageY) {
              const imageCommandPattern = `^FO${imageX},${imageY}`;
              if (workingZPL.includes(imageCommandPattern)) {
                console.log(`[IMAGE] ✅ Comando completo da imagem encontrado no ZPL final: ${imageCommandPattern}... [print-all]`);
              } else {
                console.warn(`[IMAGE] ⚠️ Comando da imagem não encontrado no ZPL final, mas ^GFA está presente [print-all]`);
              }
            }
          } else if (imageUrl && imageUrl.trim() !== '') {
            console.error(`[IMAGE] ❌ ERRO: Imagem NÃO encontrada no ZPL final! [print-all]`);
            console.error(`[IMAGE] Verificando se foi removida acidentalmente... [print-all]`);
            // Tentar inserir a imagem novamente se ainda tivermos o comando preservado
            if (preservedImageCommand) {
              console.log(`[IMAGE] 🔄 Tentando restaurar imagem usando comando preservado... [print-all]`);
              const xaMatches = workingZPL.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingZPL = workingZPL.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  if (xaIndex === 2) {
                    return `${match}\n${preservedImageCommand}`;
                  }
                  return match;
                });
                console.log(`[IMAGE] ✅ Imagem restaurada no ZPL final após verificação [print-all]`);
              } else if (xaCount === 1) {
                workingZPL = workingZPL.replace(/^XA/m, `^XA\n${preservedImageCommand}`);
                console.log(`[IMAGE] ✅ Imagem restaurada no ZPL final após verificação (único ^XA) [print-all]`);
              }
            } else if (shoeImageZPL && imageX && imageY) {
              // Se não tivermos o comando preservado, tentar reconstruir
              const imageCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
              console.log(`[IMAGE] 🔄 Tentando inserir imagem reconstruída no ZPL final... [print-all]`);
              const xaMatches = workingZPL.match(/\^XA/g);
              const xaCount = xaMatches ? xaMatches.length : 0;
              if (xaCount >= 2) {
                let xaIndex = 0;
                workingZPL = workingZPL.replace(/\^XA/g, (match) => {
                  xaIndex++;
                  if (xaIndex === 2) {
                    return `${match}\n${imageCommand}`;
                  }
                  return match;
                });
                console.log(`[IMAGE] ✅ Imagem reconstruída e inserida no ZPL final [print-all]`);
              }
            }
          }
          
          // Se ainda houver {IMAGE} no ZPL final, significa que a imagem não foi inserida
          // Isso não é um erro fatal, apenas um aviso
          if (workingZPL.includes('{IMAGE}')) {
            console.warn(`[AVISO] [print-all] Placeholder {IMAGE} ainda presente no ZPL final - imagem pode não ter sido inserida`);
          }

          // Log completo do ZPL para debug
          console.log('\n============ ZPL FINAL GERADO (PRINT-ALL) ============');
          console.log(workingZPL);
          console.log('=========================================\n');

          // Verificar conexão antes de imprimir (reconectar se necessário)
          try {
            console.log(`[PRINT] [print-all] Verificando conexão com impressora antes de imprimir etiqueta ${seq}/${itemQty}...`);
            const connectionTest = await pythonUSBIntegration.testConnection();
            if (!connectionTest.success || !pythonUSBIntegration.isConnected) {
              console.warn(`[PRINT] [print-all] ⚠️ Impressora não está conectada, tentando reconectar...`);
              // Tentar detectar impressora novamente
              await pythonUSBIntegration.ensurePrinterName();
              const retryTest = await pythonUSBIntegration.testConnection();
              if (!retryTest.success || !pythonUSBIntegration.isConnected) {
                throw new Error(`Impressora não está online. Verifique se a impressora está ligada e conectada. Status: ${JSON.stringify(retryTest.result)}`);
              }
              console.log(`[PRINT] [print-all] ✅ Reconexão bem-sucedida!`);
            }
          } catch (connectionError) {
            console.error(`[PRINT] [print-all] ❌ Erro ao verificar conexão: ${connectionError.message}`);
            throw new Error(`Erro de conexão com a impressora: ${connectionError.message}. Verifique se a impressora está conectada e tente novamente.`);
          }

          // Imprimir cada etiqueta individual (1 cópia por vez para manter sequência)
          const printResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
          
          if (!printResult.success) {
            console.error(`[PRINT] [print-all] ❌ Erro ao imprimir etiqueta ${seq}/${itemQty}: ${printResult.error}`);
            // Se o erro for de conexão, tentar reconectar e imprimir novamente uma vez
            if (printResult.error && (printResult.error.includes('online') || printResult.error.includes('conectada') || printResult.error.includes('Network'))) {
              console.log(`[PRINT] [print-all] Tentando reconectar e reimprimir...`);
              try {
                await pythonUSBIntegration.ensurePrinterName();
                const retryResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
                if (retryResult.success) {
                  console.log(`[PRINT] [print-all] ✅ Reimpressão bem-sucedida após reconexão!`);
                  results.push({
                    item: `${styleName} (${seq}/${itemQty})`,
                    barcode: sequentialBarcode,
                    rfid: rfidContent,
                    success: true,
                    message: `Etiqueta ${seq} impressa com sucesso (após reconexão)`,
                    details: retryResult.result
                  });
                  console.log(`[OK] Etiqueta ${styleName} ${seq}/${itemQty} processada: OK (após reconexão)`);
                } else {
                  throw new Error(retryResult.error || 'Erro ao reimprimir após reconexão');
                }
              } catch (retryError) {
                throw new Error(`Erro de conexão com a impressora: ${retryError.message}. Verifique se a impressora está conectada e tente novamente.`);
              }
            } else {
              throw new Error(printResult.error || 'Erro desconhecido ao imprimir');
            }
          } else {
          results.push({
            item: `${styleName} (${seq}/${itemQty})`,
            barcode: sequentialBarcode,
            rfid: rfidContent,
            success: printResult.success,
            message: printResult.success ? `Etiqueta ${seq} impressa com sucesso` : printResult.error,
            details: printResult.result
          });
          
          console.log(`[OK] Etiqueta ${styleName} ${seq}/${itemQty} processada:`, printResult.success ? 'OK' : printResult.error);
          }
          
          // Aguardar um pouco entre impressões para não sobrecarregar a impressora
          // (exceto na última etiqueta)
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo entre impressões
          
        } catch (error) {
          console.error(`[ERRO] Erro ao processar ${item.STYLE_NAME} ${seq}/${itemQty}:`, error);
          const errorMessage = error.message || 'Erro desconhecido';
          results.push({
            item: `${item.STYLE_NAME || 'Desconhecido'} (${seq}/${itemQty})`,
            success: false,
            message: errorMessage,
            error: errorMessage.includes('conexão') || errorMessage.includes('online') || errorMessage.includes('Network') 
              ? 'Erro de conexão com a impressora. Verifique se a impressora está conectada e tente novamente.'
              : errorMessage
          });
        }
      } // Fim do loop de sequência
    } // Fim do loop de itens
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      message: `${successCount}/${totalEtiquetasProcessadas} etiquetas impressas com sucesso`,
      results: results,
      totalItems: data.length,
      totalEtiquetas: totalEtiquetasProcessadas,
      successCount: successCount,
      timestamp: new Date().toISOString(),
      info: "Sistema com PO na RFID e barcode sequencial ativo"
    });

  } catch (error) {
    console.error('Erro na impressão de todas as etiquetas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Gerar todas as etiquetas (ZIP para download)
app.post('/api/generate-labels', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Dados invÃ¡lidos' });
    }

    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const timestamp = Date.now();
    const zipFileName = `etiquetas-${timestamp}.zip`;
    const zipPath = path.join(outputDir, zipFileName);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    let labelCounter = 1;
    let totalLabelsGenerated = 0;

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const qty = parseInt(item.QTY) || 1;
      
      for (let copy = 1; copy <= qty; copy++) {
        try {
          const labelZPL = generateLabelZPL(item);
          const fileName = `etiqueta-${labelCounter}-${item.VPN || 'sem-vpn'}-copia-${copy}.zpl`;
          archive.append(Buffer.from(labelZPL, 'utf8'), { name: fileName });
          labelCounter++;
          totalLabelsGenerated++;
        } catch (error) {
          console.error(`Erro ao gerar etiqueta ${labelCounter}:`, error);
          throw error;
        }
      }
    }

    await archive.finalize();

    output.on('close', () => {
      res.json({
        message: 'Etiquetas ZPL geradas com sucesso',
        downloadUrl: `/api/download/${zipFileName}`,
        totalItems: data.length,
        totalLabels: totalLabelsGenerated
      });
    });

  } catch (error) {
    console.error('Erro ao gerar etiquetas ZPL:', error);
    res.status(500).json({ error: 'Erro ao gerar etiquetas ZPL' });
  }
});

// Endpoint para salvar layout da etiqueta (DEPRECATED - usar save-template)
app.post('/api/layout/save', (req, res) => {
  try {
    const { layout } = req.body;
    
    if (!layout) {
      return res.status(400).json({ error: 'Layout não fornecido' });
    }

    // Salvar layout em Default.json (caminho relativo ao projeto)
    const layoutsDir = path.join(__dirname, 'layouts');
    
    // Garantir que o diretório existe
    if (!fs.existsSync(layoutsDir)) {
      fs.mkdirSync(layoutsDir, { recursive: true });
    }
    
    const layoutPath = path.join(layoutsDir, 'Default.json');
    
    // Salvar com estrutura completa (name, layout, timestamps)
    const layoutData = {
      name: 'Default',
      layout: layout,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(layoutPath, JSON.stringify(layoutData, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Layout salvo com sucesso em Default.json',
      layout: layout
    });
  } catch (error) {
    console.error('Erro ao salvar layout:', error);
    res.status(500).json({ error: 'Erro ao salvar layout' });
  }
});

// Endpoint para listar layouts disponíveis
app.get('/api/layout/list', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const layoutsDir = path.join(__dirname, 'layouts');
    
    const layouts = [];
    
    if (fs.existsSync(layoutsDir)) {
      const files = fs.readdirSync(layoutsDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(layoutsDir, file);
            const fileData = fs.readFileSync(filePath, 'utf8');
            const layoutData = JSON.parse(fileData);
            layouts.push({
              name: layoutData.name || file.replace('.json', ''),
              filename: file,
              createdAt: layoutData.createdAt,
              updatedAt: layoutData.updatedAt
            });
          } catch (error) {
            console.error(`Erro ao ler layout ${file}:`, error);
          }
        }
      });
    }
    
    res.json({
      success: true,
      layouts: layouts
    });
  } catch (error) {
    console.error('Erro ao listar layouts:', error);
    res.status(500).json({ error: 'Erro ao listar layouts' });
  }
});

// Endpoint para carregar um layout específico por nome
app.get('/api/layout/load/:name?', (req, res) => {
  try {
    const layoutName = req.params.name || 'Default';
    
    // Sempre usar caminho relativo ao projeto
    const layoutsDir = path.join(__dirname, 'layouts');
    const layoutPath = path.join(layoutsDir, `${layoutName}.json`);
    
    let layout;
    if (fs.existsSync(layoutPath)) {
      const layoutData = fs.readFileSync(layoutPath, 'utf8');
      const layoutObj = JSON.parse(layoutData);
      layout = layoutObj.layout || layoutObj; // Suporta ambos os formatos
    } else {
      // Layout padrão baseado no TEMPLATE_LARROUD_OFICIAL.zpl
      // Coordenadas exatas do template ZPL oficial
      layout = {
        // Labels (textos fixos) - FT187,147, FT188,176, FT187,204, FT187,234
        labelStyleName: { x: 187, y: 147, fontSize: 20 },
        labelVpn: { x: 188, y: 176, fontSize: 20 },
        labelColor: { x: 187, y: 204, fontSize: 20 },
        labelSize: { x: 187, y: 234, fontSize: 20 },
        // Valores (dados) - FT353,147, FT353,175, FT353,204, FT353,232
        styleName: { x: 353, y: 147, fontSize: 23 },
        vpn: { x: 353, y: 175, fontSize: 23 },
        color: { x: 353, y: 204, fontSize: 23 },
        size: { x: 353, y: 232, fontSize: 23 },
        // QR Codes - Posicionados nas laterais para não sobrepor textos
        // QR esquerdo: bem à esquerda, alinhado verticalmente com textos
        qrLeft: { x: 50, y: 200, size: 4 },
        // QR codes direitos: bem à direita, um no topo e um embaixo (dentro do MainBox)
        qrTop: { x: 600, y: 120, size: 4 },
        qrBottom: { x: 600, y: 300, size: 4 },
        // PO Info - À direita, entre os QR codes, sem sobrepor textos
        poInfo: { x: 580, y: 200, fontSize: 16 },
        // Barcode - FT222,308
        barcode: { x: 222, y: 308, height: 57.296875 },
        // MainBox - FO31,80^GB640,280,3
        mainBox: { x: 31, y: 80, width: 640, height: 280 },
        // DividerLine - FO177,81^GB0,275,3
        dividerLine: { x: 177, y: 81, height: 275 }
      };
      console.log(`[INFO] Layout "${layoutName}" não encontrado, retornando layout padrão baseado no template ZPL oficial`);
    }
    
    res.json({
      success: true,
      layout: layout,
      name: layoutName
    });
  } catch (error) {
    console.error('Erro ao carregar layout:', error);
    res.status(500).json({ error: 'Erro ao carregar layout' });
  }
});

// Endpoint para salvar layout em um arquivo específico
app.post('/api/layout/save-template', (req, res) => {
  try {
    const { name, layout } = req.body;
    
    if (!name || !layout) {
      return res.status(400).json({ error: 'Nome e layout são obrigatórios' });
    }
    
    // Garantir que layout não está aninhado (layout.layout)
    let layoutToSave = layout;
    if (layout && layout.layout && typeof layout.layout === 'object') {
      console.warn('[SAVE] Layout recebido com estrutura aninhada dupla, extraindo layout interno');
      layoutToSave = layout.layout;
    }
    
    // Verificar se os valores estão em dots (devem ser números grandes, não decimais pequenos)
    // Se valores forem muito pequenos (< 10), pode estar em cm ao invés de dots
    const sampleKey = Object.keys(layoutToSave)[0];
    if (sampleKey && layoutToSave[sampleKey] && layoutToSave[sampleKey].x !== undefined) {
      const sampleX = layoutToSave[sampleKey].x;
      if (sampleX < 10 && sampleX > 0) {
        console.warn(`[SAVE] AVISO: Valores parecem estar em cm (x=${sampleX}) ao invés de dots. Layout pode estar incorreto.`);
      }
    }
    
    // Sempre usar caminho relativo ao projeto (portável)
    const layoutsDir = path.join(__dirname, 'layouts');
    
    // Garantir que o diretório existe
    if (!fs.existsSync(layoutsDir)) {
      fs.mkdirSync(layoutsDir, { recursive: true });
      console.log(`[OK] Diretório layouts criado: ${layoutsDir}`);
    }
    
    // Sanitizar nome do arquivo (remover caracteres inválidos)
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const templatePath = path.join(layoutsDir, `${sanitizedName}.json`);
    
    // Ler arquivo existente se houver, para preservar createdAt
    let templateData = {
      name: name,
      layout: layoutToSave,  // Usar layout sem estrutura aninhada
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (fs.existsSync(templatePath)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        templateData.createdAt = existingData.createdAt || templateData.createdAt;
      } catch (error) {
        console.warn('Não foi possível ler dados existentes, criando novo:', error);
      }
    }
    
    fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2), 'utf8');
    
    console.log(`[OK] Layout "${name}" salvo em: ${templatePath}`);
    
    res.json({
      success: true,
      message: `Template "${name}" salvo com sucesso`,
      template: templateData
    });
  } catch (error) {
    console.error('Erro ao salvar template:', error);
    res.status(500).json({ error: 'Erro ao salvar template' });
  }
});

// Endpoint para listar templates salvos
app.get('/api/layout/templates', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const templatesDir = path.join(__dirname, 'layouts');
    
    if (!fs.existsSync(templatesDir)) {
      return res.json({
        success: true,
        templates: []
      });
    }
    
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
    const templates = files.map(file => {
      try {
        const filePath = path.join(templatesDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const template = JSON.parse(data);
        return {
          name: template.name || file.replace('.json', ''),
          createdAt: template.createdAt,
          updatedAt: template.updatedAt || template.createdAt
        };
      } catch (e) {
        console.error(`Erro ao ler template ${file}:`, e);
        return null;
      }
    }).filter(t => t !== null);
    
    res.json({
      success: true,
      templates: templates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    });
  } catch (error) {
    console.error('Erro ao listar templates:', error);
    res.status(500).json({ error: 'Erro ao listar templates' });
  }
});

// Endpoint para carregar template específico
app.get('/api/layout/template/:name', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const templateName = req.params.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const templatePath = path.join(__dirname, 'layouts', `${templateName}.json`);
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }
    
    const templateData = fs.readFileSync(templatePath, 'utf8');
    const template = JSON.parse(templateData);
    
    // Atualizar data de atualização
    template.updatedAt = new Date().toISOString();
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2), 'utf8');
    
    res.json({
      success: true,
      layout: template.layout,
      template: template
    });
  } catch (error) {
    console.error('Erro ao carregar template:', error);
    res.status(500).json({ error: 'Erro ao carregar template' });
  }
});

// Download do arquivo ZIP
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('output', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (err) {
        console.error('Erro no download:', err);
      } else {
        // Limpar arquivo apÃ³s download
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }, 60000); // Remove apÃ³s 1 minuto
      }
    });
  } else {
    res.status(404).json({ error: 'Arquivo nÃ£o encontrado' });
  }
});

// FunÃ§Ã£o para gerar preview da etiqueta
async function generateLabelPreview(item) {
  try {
    // Importar o processador ZPL local
    const { processZPLToImage } = require("./zpl-processor");
    const fs = require('fs');
    const path = require('path');
    
    // Extrair dados do item
    const styleName = String(item.STYLE_NAME || item.NAME || "N/A");
    const vpn = String(item.VPN || item.SKU || "N/A");
  const color = String(item.DESCRIPTION || item.COLOR || "N/A");
    const size = String(item.SIZE || "N/A");
    const barcode = String(item.BARCODE || item.VPN || "N/A");
    const ref = String(item.REF || "N/A");
    const qty = String(item.QTY || "1");

    // Usar PO e LOCAL do item (do CSV), não valores hardcoded
    const previewPoNumber = item.PO || '0000';
    const previewLocalNumber = ''; // LOCAL ignorado
    
    // Gerar conteúdo dos QR codes conforme especificação
    const qrLeft = `LA,ESQ-QR-CONTENT`;
    const qrRightTop = `LA,DIR-QR-TOP`;
    const qrRightBottom = `LA,DIR-QR-BOTTOM`;
    const poLocal = `PO${previewPoNumber}`; // Formato: PO0756 (LOCAL removido)

    // Usar template oficial que aceita layout customizado
    const templatePath = path.join(__dirname, '../templates/TEMPLATE_LARROUD_OFICIAL.zpl');
    let zplTemplate;
    
    try {
      zplTemplate = fs.readFileSync(templatePath, 'utf8');
    } catch (fileError) {
      console.error("Erro ao ler template ZPL:", fileError.message);
      // Tentar template alternativo ou gerar ZPL básico
      zplTemplate = `^XA
^PW831
^LL500
^FO50,50^A0N,30,30^FD${styleName}^FS
^FO50,100^A0N,20,20^FDVPN: ${vpn}^FS
^FO50,130^A0N,20,20^FDMAT./COLOR: ${color}^FS
^FO50,160^A0N,20,20^FDSIZE: ${size}^FS
^XZ`;
      console.warn("Usando template básico para preview");
    }

    // Carregar layout customizado (se existir) para preview também
    // Usar Default.json do diretório layouts (portável)
    let layout = null;
    try {
      // Sempre usar caminho relativo ao projeto
      const layoutsDir = path.join(__dirname, 'layouts');
      const defaultLayoutPath = path.join(layoutsDir, 'Default.json');
      
      if (fs.existsSync(defaultLayoutPath)) {
        const layoutData = fs.readFileSync(defaultLayoutPath, 'utf8');
        const layoutObj = JSON.parse(layoutData);
        layout = layoutObj.layout || layoutObj;
        console.log('[OK] [PREVIEW] Layout Default carregado para preview');
        console.log('[DEBUG] [PREVIEW] Layout keys:', Object.keys(layout));
      } else {
        console.log('[INFO] [PREVIEW] Layout Default não encontrado, usando template sem modificações');
      }
    } catch (layoutError) {
      console.warn('Erro ao carregar layout customizado para preview, usando padrão:', layoutError.message);
    }

    // Aplicar layout customizado ao template se disponível
    let baseTemplate = zplTemplate;
    if (layout) {
      // Substituir coordenadas dos labels (textos fixos)
      baseTemplate = baseTemplate.replace(/FT187,147/g, `FT${layout.labelStyleName?.x || 187},${layout.labelStyleName?.y || 147}`);
      baseTemplate = baseTemplate.replace(/FT188,176/g, `FT${layout.labelVpn?.x || 188},${layout.labelVpn?.y || 176}`);
      baseTemplate = baseTemplate.replace(/FT187,204/g, `FT${layout.labelColor?.x || 187},${layout.labelColor?.y || 204}`);
      baseTemplate = baseTemplate.replace(/FT187,234/g, `FT${layout.labelSize?.x || 187},${layout.labelSize?.y || 234}`);
      
      // Substituir coordenadas dos dados
      baseTemplate = baseTemplate.replace(/FT353,147/g, `FT${layout.styleName?.x || 353},${layout.styleName?.y || 147}`);
      baseTemplate = baseTemplate.replace(/FT353,175/g, `FT${layout.vpn?.x || 353},${layout.vpn?.y || 175}`);
      baseTemplate = baseTemplate.replace(/FT353,204/g, `FT${layout.color?.x || 353},${layout.color?.y || 204}`);
      baseTemplate = baseTemplate.replace(/FT353,232/g, `FT${layout.size?.x || 353},${layout.size?.y || 232}`);
      baseTemplate = baseTemplate.replace(/FT222,308/g, `FT${layout.barcode?.x || 222},${layout.barcode?.y || 308}`);
      baseTemplate = baseTemplate.replace(/FT77,355/g, `FT${layout.qrLeft?.x || 77},${layout.qrLeft?.y || 355}`);
      baseTemplate = baseTemplate.replace(/FT737,167/g, `FT${layout.qrTop?.x || 737},${layout.qrTop?.y || 167}`);
      baseTemplate = baseTemplate.replace(/FT739,355/g, `FT${layout.qrBottom?.x || 739},${layout.qrBottom?.y || 355}`);
      baseTemplate = baseTemplate.replace(/FT701,220/g, `FT${layout.poInfo?.x || 701},${layout.poInfo?.y || 220}`);
      baseTemplate = baseTemplate.replace(/FT680,238/g, `FT${layout.localInfo?.x || 680},${layout.localInfo?.y || 238}`);
      
      // Substituir fontSize no preview também
      baseTemplate = baseTemplate.replace(/FT\d+,\d+\^A0N,20,23/g, (match) => {
        const coords = match.match(/FT(\d+),(\d+)/);
        const x = parseInt(coords[1]);
        const y = parseInt(coords[2]);
        
        if (x === layout.labelStyleName?.x && y === layout.labelStyleName?.y) {
          return `FT${x},${y}^A0N,${layout.labelStyleName.fontSize || 20},${layout.labelStyleName.fontSize || 20}`;
        } else if (x === layout.labelVpn?.x && y === layout.labelVpn?.y) {
          return `FT${x},${y}^A0N,${layout.labelVpn.fontSize || 20},${layout.labelVpn.fontSize || 20}`;
        } else if (x === layout.labelColor?.x && y === layout.labelColor?.y) {
          return `FT${x},${y}^A0N,${layout.labelColor.fontSize || 20},${layout.labelColor.fontSize || 20}`;
        } else if (x === layout.labelSize?.x && y === layout.labelSize?.y) {
          return `FT${x},${y}^A0N,${layout.labelSize.fontSize || 20},${layout.labelSize.fontSize || 20}`;
        }
        return match;
      });
      
      baseTemplate = baseTemplate.replace(/FT\d+,\d+\^A0N,23,23/g, (match) => {
        const coords = match.match(/FT(\d+),(\d+)/);
        const x = parseInt(coords[1]);
        const y = parseInt(coords[2]);
        
        if (x === layout.styleName?.x && y === layout.styleName?.y) {
          return `FT${x},${y}^A0N,${layout.styleName.fontSize || 23},${layout.styleName.fontSize || 23}`;
        } else if (x === layout.vpn?.x && y === layout.vpn?.y) {
          return `FT${x},${y}^A0N,${layout.vpn.fontSize || 23},${layout.vpn.fontSize || 23}`;
        } else if (x === layout.color?.x && y === layout.color?.y) {
          return `FT${x},${y}^A0N,${layout.color.fontSize || 23},${layout.color.fontSize || 23}`;
        } else if (x === layout.size?.x && y === layout.size?.y) {
          return `FT${x},${y}^A0N,${layout.size.fontSize || 23},${layout.size.fontSize || 23}`;
        }
        return match;
      });
      
      // Substituir fontSize da PO e LOCAL de forma mais robusta (PREVIEW)
      // Procurar por qualquer tamanho de fonte na posição da PO/LOCAL
      if (layout.poInfo) {
        const poX = layout.poInfo.x;
        const poY = layout.poInfo.y;
        const poFontSize = layout.poInfo.fontSize || 16;
        // Substituir qualquer ^A0N com as coordenadas da PO (qualquer tamanho)
        baseTemplate = baseTemplate.replace(
          new RegExp(`FT${poX},${poY}\\^A0N,\\d+,\\d+`, 'g'),
          `FT${poX},${poY}^A0N,${poFontSize},${poFontSize}`
        );
        console.log(`[OK] [PREVIEW] PO fontSize aplicado: ${poFontSize} na posição (${poX},${poY})`);
      }
      
      if (layout.localInfo) {
        const localX = layout.localInfo.x;
        const localY = layout.localInfo.y;
        const localFontSize = layout.localInfo.fontSize || 16;
        // Substituir qualquer ^A0N com as coordenadas do LOCAL (qualquer tamanho)
        baseTemplate = baseTemplate.replace(
          new RegExp(`FT${localX},${localY}\\^A0N,\\d+,\\d+`, 'g'),
          `FT${localX},${localY}^A0N,${localFontSize},${localFontSize}`
        );
      }
      
      // Ajustar retângulos/bordas no preview também
      // Retângulo principal: ^FO31,80^GB640,280,3^FS
      baseTemplate = baseTemplate.replace(/FO31,80\^GB640,280,3/g, 
        `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
      
      // Linha divisória: ^FO177,81^GB0,275,3^FS
      baseTemplate = baseTemplate.replace(/FO177,81\^GB0,275,3/g,
        `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
      
      // Aplicar altura e largura do barcode usando comando ^BY no preview também
      if (layout.barcode?.height || layout.barcode?.width) {
        const barcodeHeight = layout.barcode?.height 
          ? Math.round(layout.barcode.height / 1.5) // Converter pixels para altura do módulo
          : 39; // Padrão
        
        const barcodeWidth = layout.barcode?.width 
          ? Math.max(2, Math.min(10, Math.round(layout.barcode.width / 100))) // Converter pixels para módulo (2-10)
          : 2; // Padrão
        
        baseTemplate = baseTemplate.replace(/BY2,2,39/g, `BY${barcodeWidth},2,${barcodeHeight}`);
        console.log(`[OK] [PREVIEW] Barcode aplicado: largura=${layout.barcode.width || 'padrão'}px -> módulo w=${barcodeWidth}, altura=${layout.barcode.height || 'padrão'}px -> módulo h=${barcodeHeight}`);
      }
    }
    
    // Usar PO e LOCAL do item (do CSV), não valores hardcoded
    const previewPoNumber2 = item.PO || '0000';
    const previewLocalNumber2 = ''; // LOCAL ignorado
    const poFormatted = `PO${previewPoNumber2}`;
    
    // Processar imagem do sapato para posição separada (layout.image ou layout.productImage) no preview
    // A imagem SEMPRE será pega da API Python (não de outras fontes)
    // MANTER OS QR CODES - não substituir pelas imagens
    const imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || item.image_url || item['image_url'] || '';
    let shoeImageZPL = null;
    
    // Usar layout.image ou layout.productImage (productImage está em cm, converter para dots)
    // 1 cm = 80 dots (203 DPI)
    const imageLayout = layout?.image || layout?.productImage;
    let imageX = 50;
    let imageY = 70;
    let imageWidth = 160;
    let imageHeight = 160;
    
    if (imageLayout) {
      // TODOS os outros elementos do layout usam DOTS diretamente (valores como 195, 354, 58, etc.)
      // Verificar se productImage também está em dots ou em cm:
      const absX = Math.abs(imageLayout.x || 0);
      const absY = Math.abs(imageLayout.y || 0);
      const absWidth = Math.abs(imageLayout.width || 0);
      const absHeight = Math.abs(imageLayout.height || 0);
      
      const hasSmallValues = absWidth < 20 && absHeight < 20 && absX < 20 && absY < 20;
      const hasNegativeValues = (imageLayout.x && imageLayout.x < 0) || (imageLayout.y && imageLayout.y < 0);
      const hasLargeValues = absWidth > 50 || absHeight > 50 || absX > 50 || absY > 50;
      
      const isInDots = hasLargeValues || hasNegativeValues || !hasSmallValues;
      const aspectRatio = absWidth && absHeight ? absWidth / absHeight : 1;
      const isDistorted = aspectRatio > 10 || aspectRatio < 0.1;
      
      if (isInDots) {
        imageX = imageLayout.x || 50;
        imageY = imageLayout.y || 70;
        imageWidth = absWidth || 160;
        imageHeight = absHeight || 160;
        
        if (imageX < 0) {
          console.warn(`[IMAGE] [PREVIEW] ⚠️ Posição X negativa detectada (${imageX}). Ajustando para 50.`);
          imageX = 50;
        }
        if (imageY < 0) {
          console.warn(`[IMAGE] [PREVIEW] ⚠️ Posição Y negativa detectada (${imageY}). Ajustando para 70.`);
          imageY = 70;
        }
        
        console.log(`[IMAGE] [PREVIEW] Layout productImage detectado (em dots, mesma unidade dos outros elementos): posição (${imageX}, ${imageY}), tamanho ${imageWidth}x${imageHeight} dots`);
      } else if (isDistorted) {
        console.warn(`[IMAGE] [PREVIEW] ⚠️ Layout com proporção muito distorcida detectada (${imageLayout.width}x${imageLayout.height}, ratio=${aspectRatio.toFixed(2)}). Usando tamanho padrão 160x160 dots.`);
        imageWidth = 160;
        imageHeight = 160;
        imageX = imageLayout.x ? (hasSmallValues ? Math.round(imageLayout.x * 80) : imageLayout.x) : 50;
        imageY = imageLayout.y ? (hasSmallValues ? Math.round(imageLayout.y * 80) : imageLayout.y) : 70;
        if (imageX < 0) imageX = 50;
        if (imageY < 0) imageY = 70;
      } else {
        imageWidth = Math.round((absWidth || 2) * 80);
        imageHeight = Math.round((absHeight || 2) * 80);
        imageX = Math.round((imageLayout.x || 0) * 80);
        imageY = Math.round((imageLayout.y || 0) * 80);
        console.log(`[IMAGE] [PREVIEW] Layout productImage detectado (em cm): ${imageLayout.width}x${imageLayout.height} -> convertido para ${imageWidth}x${imageHeight} dots`);
        }
      
      if (imageWidth < 80 || imageHeight < 80) {
        console.warn(`[IMAGE] [PREVIEW] ⚠️ Tamanho muito pequeno detectado: ${imageWidth}x${imageHeight} dots. Aplicando tamanho mínimo de 80x80 dots.`);
        imageWidth = Math.max(80, imageWidth);
        imageHeight = Math.max(80, imageHeight);
      }
      
      if (imageWidth > 400 || imageHeight > 400) {
        console.warn(`[IMAGE] [PREVIEW] ⚠️ Tamanho muito grande detectado: ${imageWidth}x${imageHeight} dots. Limitando para 400x400 dots máximo.`);
        const maxDim = Math.max(imageWidth, imageHeight);
        const scale = 400 / maxDim;
        imageWidth = Math.round(imageWidth * scale);
        imageHeight = Math.round(imageHeight * scale);
      }
      
      if (imageX < 0) imageX = 50;
      if (imageY < 0) imageY = 70;
      if (imageX + imageWidth > 831) {
        console.warn(`[IMAGE] [PREVIEW] ⚠️ Imagem ultrapassa largura da etiqueta (${imageX + imageWidth} > 831). Ajustando posição X.`);
        imageX = Math.max(0, 831 - imageWidth);
      }
      if (imageY + imageHeight > 500) {
        console.warn(`[IMAGE] [PREVIEW] ⚠️ Imagem ultrapassa altura da etiqueta (${imageY + imageHeight} > 500). Ajustando posição Y.`);
        imageY = Math.max(0, 500 - imageHeight);
      }
    }
    
    console.log(`[IMAGE] [PREVIEW] Posição final: (${imageX}, ${imageY}), Tamanho: ${imageWidth}x${imageHeight} dots`);
    
    if (imageUrl && imageUrl.trim() !== '') {
      try {
        // Validar que a imagem vem da API Python
        const isFromPythonAPI = imageUrl.includes('/image/reference/') || imageUrl.includes('127.0.0.1') || imageUrl.includes('localhost');
        if (!isFromPythonAPI) {
          console.warn(`[IMAGE] [PREVIEW] ⚠️ Aviso: URL da imagem não parece ser da API Python: ${imageUrl}`);
          console.warn(`[IMAGE] [PREVIEW] ⚠️ Continuando mesmo assim, mas a imagem deveria sempre vir da API Python`);
        } else {
          console.log(`[IMAGE] [PREVIEW] ✅ Confirmado: Imagem vem da API Python: ${imageUrl}`);
        }
        
        console.log(`[IMAGE] [PREVIEW] Processando imagem do sapato para posição separada: ${imageUrl}`);
        
        // Converter imagem para ZPL usando tamanho do layout
        // A imagem sempre vem da API Python
        shoeImageZPL = await convertImageToZPL(imageUrl, imageWidth, imageHeight);
        
        if (shoeImageZPL && shoeImageZPL.trim() !== '') {
          console.log(`[IMAGE] [PREVIEW] ✅ Imagem do sapato convertida para ZPL com sucesso!`);
          console.log(`   [SIZE] [PREVIEW] Tamanho aplicado: ${imageWidth}x${imageHeight} dots`);
          console.log(`   [DEBUG] [PREVIEW] Comando ZPL (primeiros 200 chars): ${shoeImageZPL.substring(0, 200)}...`);
          console.log(`   [DEBUG] [PREVIEW] Comando ZPL contém ^GFA: ${shoeImageZPL.includes('^GFA')}`);
          
          // Inserir imagem do sapato na posição do layout.image
          // Procurar por placeholder {IMAGE} ou inserir na posição especificada
          if (baseTemplate.includes('{IMAGE}')) {
            const beforeReplace = baseTemplate;
            baseTemplate = baseTemplate.replace(/{IMAGE}/g, `^FO${imageX},${imageY}${shoeImageZPL}`);
            if (baseTemplate !== beforeReplace) {
              console.log(`[IMAGE] [PREVIEW] ✅ Imagem inserida no placeholder {IMAGE} na posição (${imageX}, ${imageY})`);
              console.log(`[IMAGE] [DEBUG] [PREVIEW] Template após inserção contém ^GFA: ${baseTemplate.includes('^GFA')}`);
            } else {
              console.warn(`[IMAGE] [PREVIEW] ⚠️ Placeholder {IMAGE} não foi substituído`);
            }
          } else {
            // Inserir imagem na posição do layout.image
            // O template pode ter múltiplos ^XA (um para config, outro para a etiqueta)
            // Inserir após o SEGUNDO ^XA (que é o início real da etiqueta)
            const imageCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
            console.log(`[IMAGE] [DEBUG] [PREVIEW] Comando completo a inserir (primeiros 200 chars): ${imageCommand.substring(0, 200)}...`);
            
            // Contar quantos ^XA existem no template
            const xaMatches = baseTemplate.match(/\^XA/g);
            const xaCount = xaMatches ? xaMatches.length : 0;
            console.log(`[IMAGE] [DEBUG] [PREVIEW] Template contém ${xaCount} comandos ^XA`);
        
            // Se houver múltiplos ^XA, inserir após o segundo (início da etiqueta)
            // Se houver apenas um, inserir após ele
            let beforeReplace = baseTemplate;
            if (xaCount >= 2) {
              // Inserir após o segundo ^XA (pular o primeiro que é configuração)
              let xaIndex = 0;
              baseTemplate = baseTemplate.replace(/\^XA/g, (match, offset) => {
                xaIndex++;
                if (xaIndex === 2) {
                  // Este é o segundo ^XA - inserir imagem após ele
                  return `${match}\n${imageCommand}`;
                }
                return match;
              });
            } else {
              // Apenas um ^XA - inserir após ele
              baseTemplate = baseTemplate.replace(/^XA/m, `^XA\n${imageCommand}`);
            }
            
            if (baseTemplate !== beforeReplace) {
              console.log(`[IMAGE] [PREVIEW] ✅ Imagem inserida na posição (${imageX}, ${imageY})`);
              console.log(`[IMAGE] [DEBUG] [PREVIEW] Template após inserção contém ^GFA: ${baseTemplate.includes('^GFA')}`);
              console.log(`[IMAGE] [DEBUG] [PREVIEW] Template após inserção contém ^FO${imageX},${imageY}: ${baseTemplate.includes(`^FO${imageX},${imageY}`)}`);
              
              // Verificar se o comando completo está presente
              const fullCommand = `^FO${imageX},${imageY}${shoeImageZPL}`;
              if (baseTemplate.includes(fullCommand.substring(0, 50))) {
                console.log(`[IMAGE] [DEBUG] [PREVIEW] ✅ Comando completo encontrado no template`);
              } else {
                console.warn(`[IMAGE] [DEBUG] [PREVIEW] ⚠️ Comando completo não encontrado no template`);
              }
            } else {
              console.warn(`[IMAGE] [PREVIEW] ⚠️ Não foi possível inserir imagem após ^XA - padrão não encontrado`);
              // Tentar inserir no final do template antes do último ^XZ
              if (baseTemplate.includes('^XZ')) {
                // Pegar o último ^XZ (antes do fechamento final)
                const lastXZIndex = baseTemplate.lastIndexOf('^XZ');
                if (lastXZIndex !== -1) {
                  baseTemplate = baseTemplate.substring(0, lastXZIndex) + `${imageCommand}\n^XZ` + baseTemplate.substring(lastXZIndex + 3);
                  console.log(`[IMAGE] [PREVIEW] ✅ Imagem inserida antes do último ^XZ como fallback`);
                }
              }
            }
          }
        } else {
          console.warn(`[AVISO] [PREVIEW] convertImageToZPL retornou vazio para imagem do sapato`);
        }
      } catch (imageError) {
        console.error(`[ERRO] [PREVIEW] Erro ao processar imagem do sapato: ${imageError.message}`);
        console.warn(`[AVISO] [PREVIEW] Continuando sem imagem do sapato`);
      }
    } else {
      console.log(`[IMAGE] [PREVIEW] IMAGE_URL não disponível, pulando inserção de imagem do sapato`);
    }
    
    // QR codes: SEMPRE gerar com dados da VPN
    // Os QR codes são gerados automaticamente pelo comando ^BQN do ZPL usando os dados da VPN
    let qrData1 = vpn;
    let qrData2 = vpn;
    let qrData3 = vpn;
    console.log(`[QR] [PREVIEW] ✅ QR codes serão gerados com dados VPN: "${vpn}"`);
    console.log(`[QR] [PREVIEW] Os QR codes serão renderizados pelo comando ^BQN do ZPL usando {QR_DATA_1}, {QR_DATA_2}, {QR_DATA_3}`);
    
    // Código antigo que substituía QR codes removido - agora mantemos ambos (QR codes + imagem do sapato)
    
    // Substituir variáveis do template com dados reais
    const zplCode = baseTemplate
      .replace(/{STYLE_NAME}/g, styleName)
      .replace(/{VPN}/g, vpn)
      .replace(/{VPM}/g, vpn)
      .replace(/{COLOR}/g, color)
      .replace(/{SIZE}/g, size)
      .replace(/{BARCODE}/g, barcode)
      .replace(/{PO_INFO}/g, poFormatted)
      .replace(/{LOCAL_INFO}/g, '') // LOCAL ignorado - campo vazio
      .replace(/{QR_DATA}/g, qrData1)
      .replace(/{QR_DATA_1}/g, qrData1)
      .replace(/{QR_DATA_2}/g, qrData2)
      .replace(/{QR_DATA_3}/g, qrData3)
      .replace(/{RFID_DATA_HEX}/g, '000000000000000000000000')
      .replace(/{RFID_DATA}/g, '000000000000000000000000')
      .replace(/{RFID_STATUS}/g, 'OK');

    // Debug: verificar se o comando ^GFA está no ZPL final (imagem do sapato)
    const hasGFA = zplCode.includes('^GFA');
    const hasFO = zplCode.includes('^FO');
    const hasBQN = zplCode.includes('^BQN');
    console.log(`[DEBUG] [PREVIEW] ZPL final contém ^GFA (imagem): ${hasGFA}, contém ^FO: ${hasFO}, contém ^BQN (QR codes): ${hasBQN}`);
    
    // Verificar se a imagem do sapato foi inserida corretamente
    if (shoeImageZPL && layout?.image) {
      const imageX = layout.image.x || 50;
      const imageY = layout.image.y || 70;
      const hasImageAtPosition = zplCode.includes(`^FO${imageX},${imageY}`);
      console.log(`[DEBUG] [PREVIEW] Imagem do sapato na posição (${imageX}, ${imageY}): ${hasImageAtPosition ? '✅ Encontrada' : '⚠️ Não encontrada'}`);
    }
    
    // Verificar se os QR codes estão presentes
    if (layout?.qrLeft) {
      const qrLeftX = layout.qrLeft.x || 77;
      const qrLeftY = layout.qrLeft.y || 355;
      const hasQRLeft = zplCode.includes(`FT${qrLeftX},${qrLeftY}^BQN`) || zplCode.includes(`^FT${qrLeftX},${qrLeftY}`);
      console.log(`[DEBUG] [PREVIEW] QR code esquerdo na posição (${qrLeftX}, ${qrLeftY}): ${hasQRLeft ? '✅ Encontrado' : '⚠️ Não encontrado'}`);
    }
    
    console.log("ZPL gerado para preview usando template ^FN:", zplCode.substring(0, 200) + "...");

    // Usar processador ZPL local - com tratamento de erro
    let base64Image;
    try {
      base64Image = await processZPLToImage(zplCode);
    } catch (zplError) {
      console.error("Erro ao processar ZPL para imagem:", zplError.message);
      // Retornar preview vazio ou imagem de erro
      throw new Error(`Erro ao gerar preview da etiqueta: ${zplError.message}`);
    }
    
    return {
      id: item.VPN || item.SKU || Math.random().toString(36).substr(2, 9),
      styleName: styleName,
      vpn: vpn,
      color: color,
      size: size,
      barcode: barcode,
      ref: ref,
      qty: item.QTY || 1,
      preview: `data:image/png;base64,${base64Image}`
    };

  } catch (error) {
    console.error("Erro ao gerar preview:", error.message);
    // Não quebrar o sistema - apenas logar o erro
    throw new Error(`Não foi possível gerar preview: ${error.message}. Você pode continuar editando o layout mesmo sem preview.`);
  }
}

// FunÃ§Ã£o para gerar ZPL da etiqueta usando sistema de templates ^FN
function generateLabelZPL(item) {
  // Gerar cÃ³digo ZPL inline (sem templates externos)
  // DimensÃµes: 4.0" x 2.0" (203 DPI) conforme especificaÃ§Ã£o
  
  const styleName = String(item.STYLE_NAME || item.NAME || 'N/A');
  const vpn = String(item.VPN || item.SKU || 'N/A');
  const color = String(item.DESCRIPTION || item.COLOR || 'N/A');
  const size = String(item.SIZE || 'N/A');
  const barcode = String(item.BARCODE || item.VPN || 'N/A');
  const ref = String(item.REF || 'N/A');
  const qty = String(item.QTY || '1');
  
  // Gerar conteÃºdo conforme layout otimizado
  const poLocal = `${ref}`; // PO apenas (LOCAL removido)
  const qrLeft = `LA,ESQ-${vpn}-QTY:${qty}`; // QR esquerdo
  const qrTop = `LA,DIR-QR-TOP-${vpn}`; // QR superior direito
  const qrBottom = `LA,DIR-QR-BOTTOM-${vpn}`; // QR inferior direito
  
  // ZPL inline baseado no template LAYOUT_LABEL.ZPL
  const zplCode = `^XA
^CI28
^LH0,0
^MD30
^PR5
^PW812
^LL406

^FO10,10^GB792,386,2,B,0^FS

^FO20,20^GB50,50,2,B,0^FS
^FO25,25^A0N,16,16^FDðŸ' ^FS

^FO720,20^GB70,50,2,B,0^FS
^FO725,25^A0N,12,12^FDPO: ^FS
^FO725,40^A0N,12,12^FD${ref}^FS

^FO20,80^A0N,18,18^FD${styleName}^FS

^FO20,105^A0N,14,14^FDVPN:^FS
^FO70,105^A0N,14,14^FD${vpn}^FS

^FO20,125^A0N,14,14^FDMAT./COLOR:^FS
^FO110,125^A0N,14,14^FD${color}^FS
^FO400,125^A0N,14,14^FDSIZE:^FS
^FO450,125^A0N,14,14^FD${size}^FS

^FO200,160^BY2,2,40^BCN,40,Y,N,N^FD${barcode}^FS

^FO20,220^BQN,2,3^FD${qrLeft}^FS

^FO650,220^BQN,2,3^FD${qrTop}^FS

^FO720,370^A0N,12,12^FD${ref}^FS
^XZ`;
  
  return zplCode;
}

async function generateLabelPDF(item) {
  const pdfDoc = await PDFDocument.create();
  // Tamanho baseado na proporÃ§Ã£o da imagem (aproximadamente 4:1)
  const page = pdfDoc.addPage([566, 142]); // 10cm x 2.5cm em pontos (72 DPI)
  
  const { width, height } = page.getSize();
  
  // Borda externa
  page.drawRectangle({
    x: 5,
    y: 5,
    width: width - 10,
    height: height - 10,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1
  });
  
  // Ãrea principal da etiqueta
  page.drawRectangle({
    x: 10,
    y: 10,
    width: width - 120, // Deixa espaÃ§o para QR codes laterais
    height: height - 20,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1
  });
  
  // QR Code removido - deixando espaÃ§o em branco conforme solicitado
  
  // InformaÃ§Ãµes do produto
  page.drawText(`NAME: ${String(item.STYLE_NAME || 'N/A')}`, {
    x: 65,
    y: height - 25,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(`SKU: ${String(item.VPN || 'N/A')}`, {
    x: 65,
    y: height - 40,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(`MAT. / COLOR: ${String(item.DESCRIPTION || item.COLOR || 'N/A')}`, {
    x: 65,
    y: height - 55,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(`SIZE: ${String(item.SIZE || 'N/A')}`, {
    x: 65,
    y: height - 70,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  // CÃ³digo de barras
  const barcodeWidth = 200;
  const barcodeHeight = 25;
  const barcodeX = 65;
  const barcodeY = 25;
  
  // Simular cÃ³digo de barras CODE128 usando BARCODE
  for (let i = 0; i < 50; i++) {
    const barWidth = Math.random() > 0.5 ? 2 : 1;
    const x = barcodeX + (i * 4);
    if (x < barcodeX + barcodeWidth) {
      page.drawRectangle({
        x: x,
        y: barcodeY,
        width: barWidth,
        height: barcodeHeight,
        color: rgb(0, 0, 0)
      });
    }
  }
  
  // Texto do cÃ³digo de barras usando BARCODE
  page.drawText(String(item.BARCODE || item.VPN || 'N/A'), {
    x: barcodeX + 50,
    y: barcodeY - 15,
    size: 8,
    color: rgb(0, 0, 0)
  });
  
  // QR Code grande removido - deixando espaÃ§o em branco conforme solicitado
  
  // CÃ³digo REF no canto inferior direito
  page.drawRectangle({
    x: width - 105,
    y: 15,
    width: 90,
    height: 35,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1
  });
  
  page.drawText('REF:', {
    x: width - 95,
    y: 40,
    size: 10,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(String(item.REF || 'N/A'), {
    x: width - 95,
    y: 25,
    size: 8,
    color: rgb(0, 0, 0)
  });
  
  // QR Code pequeno removido - deixando espaÃ§o em branco conforme solicitado
  
  return await pdfDoc.save();
}

// Importar módulo de conexão USB (lazy loading para evitar problemas no Cloud Run)
let USBPrinterConnection, ZebraUSBConnection, PythonUSBIntegration;
let usbConnection, zebraUSBConnection, pythonUSBIntegration;

// Função para inicializar conexões USB apenas quando necessário
const initUSBConnections = () => {
  if (!usbConnection) {
    try {
      USBPrinterConnection = require('./usb-printer-connection');
      ZebraUSBConnection = require('./zebra-usb-connection');
      PythonUSBIntegration = require('./python-usb-integration');
      usbConnection = new USBPrinterConnection();
      zebraUSBConnection = new ZebraUSBConnection();
      pythonUSBIntegration = new PythonUSBIntegration();
      console.log('[USB] Conexões USB inicializadas com sucesso');
    } catch (error) {
      console.warn('[USB] Aviso: Não foi possível inicializar conexões USB (normal no Cloud Run):', error.message);
      // Criar objetos dummy para evitar erros
      usbConnection = { 
        isConnected: false, 
        listPorts: async () => ({ allPorts: [], printerPorts: [] }),
        connect: async () => { throw new Error('USB não disponível no Cloud Run'); },
        disconnect: async () => {},
        getConnectionInfo: () => ({ connected: false })
      };
      zebraUSBConnection = { 
        isConnected: false, 
        detectPrinters: async () => ({ serial: [], windows: [], usb: [] }),
        connect: async () => { throw new Error('USB não disponível no Cloud Run'); },
        disconnect: async () => {}
      };
      pythonUSBIntegration = { 
        listPrinters: async () => ({ success: false, printers: [] }),
        connect: async () => { throw new Error('USB não disponível no Cloud Run'); }
      };
    }
  }
  return { usbConnection, zebraUSBConnection, pythonUSBIntegration };
};

// Inicializar conexões USB (pode falhar silenciosamente no Cloud Run)
try {
  initUSBConnections();
} catch (error) {
  console.warn('[USB] Erro ao inicializar conexões USB na startup (continuando...):', error.message);
}

// ========================================
// ENDPOINTS PARA TESTE DE IMPRESSORA RFID
// ========================================
// REMOVIDO: Endpoints /api/rfid/* não são usados pela aba de etiquetas
// O arquivo rfid-printer-test.js foi removido na otimização

// ========================================
// ENDPOINTS PARA TESTE DE IMPRESSORA USB
// ========================================

// Status do serviço USB (refletido no endpoint completo abaixo - linha 1904)
// Este endpoint foi comentado porque há um mais completo que usa detecção Python
/*
app.get('/api/usb/status', async (req, res) => {
  try {
    // Coletar informações de portas seriais e dispositivos Zebra
    const portsInfo = await usbConnection.listPorts();
    const detection = await zebraUSBConnection.detectPrinters();

    const detectedCount = (detection.serial?.length || 0) + (detection.windows?.length || 0) + (detection.usb?.length || 0);
    const connected = Boolean(usbConnection?.isConnected) || Boolean(zebraUSBConnection?.isConnected);

    res.json({ 
      status: 'online',
      service: 'USB Printer Test Service',
      version: '1.0.0',
      connected: connected,
      printerCount: detectedCount,
      ports: {
        serial: detection.serial || [],
        windows: detection.windows || [],
        usb: detection.usb || []
      },
      detectionSummary: {
        serial: detection.serial?.length || 0,
        windows: detection.windows?.length || 0,
        usb: detection.usb?.length || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter status USB:', error);
    res.status(500).json({
      status: 'offline',
      service: 'USB Printer Test Service',
      version: '1.0.0',
      connected: false,
      printerCount: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
*/

// Detectar impressoras USB
app.post('/api/usb/detect', async (req, res) => {
  try {
    console.log('[DEBUG] Detectando impressoras USB...');
    
    const detection = await zebraUSBConnection.detectPrinters();
    
    res.json({
      success: true,
      detection: detection,
      total: detection.serial.length + detection.windows.length + detection.usb.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na detecção USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Conectar e testar impressora USB
app.post('/api/usb/connect', async (req, res) => {
  try {
    const { portPath } = req.body;
    console.log('[USB] Conectando à impressora USB...');
    
    await zebraUSBConnection.connect(portPath);
    
    const testResult = await zebraUSBConnection.testConnection();
    
    // Desconectar após o teste
    await zebraUSBConnection.disconnect();
    
    res.json({
      success: true,
      result: testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na conexão USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Auto-conectar e testar
app.post('/api/usb/auto-connect', async (req, res) => {
  try {
    console.log('[DEBUG] Auto-conectando à impressora USB...');
    
    await zebraUSBConnection.connect();
    
    const testResult = await zebraUSBConnection.testConnection();
    
    // Desconectar após o teste
    await zebraUSBConnection.disconnect();
    
    res.json({
      success: true,
      result: testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na auto-conexão USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Teste completo USB
app.post('/api/usb/full-test', async (req, res) => {
  try {
    console.log('[TEST] Executando teste completo USB...');
    
    // 1. Detectar impressoras
    const detection = await zebraUSBConnection.detectPrinters();
    const totalDevices = detection.serial.length + detection.windows.length + detection.usb.length;
    
    if (totalDevices === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma impressora USB detectada',
        detection: detection,
        testResult: null,
        timestamp: new Date().toISOString()
      });
    }
    
    // 2. Tentar conectar
    await zebraUSBConnection.connect();
    
    // 3. Testar conectividade
    const testResult = await zebraUSBConnection.testConnection();
    
    // 4. Desconectar
    await zebraUSBConnection.disconnect();
    
    res.json({
      success: true,
      detection: detection,
      testResult: testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste completo USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enviar comando ZPL via USB
app.post('/api/usb/send-zpl', async (req, res) => {
  try {
    const { zplCommand } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('[SEND] Enviando comando ZPL via USB...');
    
    await zebraUSBConnection.connect();
    await zebraUSBConnection.sendZPL(zplCommand);
    await zebraUSBConnection.disconnect();
    
    res.json({
      success: true,
      message: 'Comando ZPL enviado com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao enviar ZPL via USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// ENDPOINTS PARA INTEGRAÇÃO PYTHON
// ========================================
// REMOVIDO: Endpoints /api/python/* não são usados pela aba de etiquetas
// Use /api/python-usb/* para integração Python USB (método principal)

/*
// Status do serviço Python
app.get('/api/python/status', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'Python Zebra Integration Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Detectar impressoras via Python
app.post('/api/python/detect', async (req, res) => {
  try {
    console.log('[DEBUG] Detectando impressoras via Python...');
    
    const result = await pythonZebraIntegration.detectPrinters();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na detecção Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Conectar via Python
app.post('/api/python/connect', async (req, res) => {
  try {
    const { printerName } = req.body;
    console.log('[USB] Conectando via Python...');
    
    const result = await pythonZebraIntegration.connect(printerName);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na conexão Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Teste completo via Python
app.post('/api/python/full-test', async (req, res) => {
  try {
    console.log('[TEST] Executando teste completo via Python...');
    
    const result = await pythonZebraIntegration.fullTest();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste completo Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enviar ZPL via Python
app.post('/api/python/send-zpl', async (req, res) => {
  try {
    const { zplCommand } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('[SEND] Enviando ZPL via Python...');
    
    const result = await pythonZebraIntegration.sendZPL(zplCommand);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao enviar ZPL via Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Testar conectividade via Python
app.post('/api/python/test', async (req, res) => {
  try {
    console.log('[TEST] Testando conectividade via Python...');
    
    const result = await pythonZebraIntegration.testConnection();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Desconectar via Python
app.post('/api/python/disconnect', async (req, res) => {
  try {
    console.log('[USB] Desconectando via Python...');
    
    const result = await pythonZebraIntegration.disconnect();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na desconexão Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Obter status da conexão Python
app.get('/api/python/connection-status', (req, res) => {
  try {
    const status = pythonZebraIntegration.getStatus();
    
    res.json({
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter status Python:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
*/

// ========================================
// ENDPOINTS PARA PYTHON USB INTEGRATION
// ========================================

// Status do serviço Python USB
app.get('/api/python-usb/status', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'Python USB Integration Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Listar impressoras via Python USB
app.post('/api/python-usb/list', async (req, res) => {
  try {
    console.log('[DEBUG] Listando impressoras via Python USB...');
    
    const result = await pythonUSBIntegration.listPrinters();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao listar impressoras Python USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Testar conexão via Python USB
app.post('/api/python-usb/test', async (req, res) => {
  try {
    console.log('[TEST] Testando conexão Python USB...');
    
    const result = await pythonUSBIntegration.testConnection();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste Python USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enviar ZPL via Python USB
app.post('/api/python-usb/send-zpl', async (req, res) => {
  try {
    const { zplCommand } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('[SEND] Enviando ZPL via Python USB...');
    
    const result = await pythonUSBIntegration.sendZPL(zplCommand);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao enviar ZPL Python USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================
// TESTE COMPLETO DE SAÍDA DA IMPRESSORA
// ============================================================
// Este endpoint gera e envia uma etiqueta de teste completa
// com informações visíveis para verificar a qualidade da impressão
app.post('/api/printer/test-output', async (req, res) => {
  try {
    console.log('[TEST] Iniciando teste completo de saída da impressora...');
    
    const startTime = Date.now();
    const testDate = new Date();
    const testTimestamp = testDate.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    // 1. Verificar status da impressora
    console.log('[TEST] Passo 1: Verificando status da impressora...');
    const statusCheck = await pythonUSBIntegration.testConnection();
    
    if (!statusCheck.success || !pythonUSBIntegration.isConnected) {
      return res.status(500).json({
        success: false,
        error: 'Impressora não está online ou não foi encontrada',
        details: statusCheck.result,
        timestamp: new Date().toISOString()
      });
    }
    
    // 2. Obter informações da impressora
    const printerInfo = pythonUSBIntegration.getStatus();
    console.log(`[TEST] Impressora detectada: ${printerInfo.printerName}`);
    
    // 3. Gerar ZPL de teste completo
    console.log('[TEST] Passo 2: Gerando ZPL de teste...');
    const testZPL = `^XA
^CF0,30
^FO50,30^FD========================================^FS
^FO50,60^FD    TESTE DE SAIDA DA IMPRESSORA^FS
^FO50,90^FD========================================^FS
^CF0,20
^FO50,130^FDData/Hora: ${testTimestamp}^FS
^FO50,160^FDImpressora: ${printerInfo.printerName || 'N/A'}^FS
^FO50,190^FDTeste ID: TEST-${Date.now()}^FS
^CF0,30
^FO50,230^FD========================================^FS
^CF0,20
^FO50,270^FD1. TESTE DE TEXTO^FS
^FO50,300^FD   Texto normal: ABCDEFGHIJKLMNOPQRSTUVWXYZ^FS
^FO50,330^FD   Numeros: 0123456789^FS
^FO50,360^FD   Caracteres especiais: !@#$%^&*()_+-=[]{}|;:,.<>?^FS
^CF0,30
^FO50,400^FD========================================^FS
^CF0,20
^FO50,440^FD2. TESTE DE CODIGO DE BARRAS^FS
^FO50,470^BCN,60,Y,N,N
^FD1234567890123^FS
^CF0,20
^FO50,550^FD3. TESTE DE QR CODE^FS
^FO50,580^BQN,2,5
^FDQA,Teste de QR Code - ${testTimestamp}^FS
^CF0,30
^FO50,700^FD========================================^FS
^CF0,20
^FO50,740^FD4. TESTE DE LINHAS^FS
^FO50,770^GB400,0,2^FS
^FO50,800^GB400,0,4^FS
^FO50,830^GB400,0,6^FS
^CF0,20
^FO50,870^FD5. TESTE DE RETANGULOS^FS
^FO50,900^GB100,50,2^FS
^FO200,900^GB100,50,4^FS
^FO350,900^GB100,50,6^FS
^CF0,20
^FO50,980^FD6. TESTE DE FONTES^FS
^FO50,1010^A0N,20,20^FDFonte Pequena (20)^FS
^FO50,1040^A0N,30,30^FDFonte Media (30)^FS
^FO50,1070^A0N,40,40^FDFonte Grande (40)^FS
^CF0,30
^FO50,1130^FD========================================^FS
^FO50,1160^FD    FIM DO TESTE^FS
^FO50,1190^FD========================================^FS
^CF0,20
^FO50,1230^FDVerifique se todos os elementos estao^FS
^FO50,1260^FDvisiveis e nítidos na etiqueta impressa^FS
^XZ`;
    
    console.log(`[TEST] ZPL gerado (${testZPL.length} caracteres)`);
    console.log('[TEST] Passo 3: Enviando ZPL para impressora...');
    
    // 4. Enviar para impressora
    const printResult = await pythonUSBIntegration.sendZPL(testZPL);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 5. Preparar resultado detalhado
    const result = {
      success: printResult.success,
      testInfo: {
        timestamp: testTimestamp,
        testId: `TEST-${Date.now()}`,
        printerName: printerInfo.printerName,
        duration: `${duration}ms`
      },
      printerStatus: {
        connected: pythonUSBIntegration.isConnected,
        lastTest: statusCheck.result
      },
      printResult: {
        jobId: printResult.result?.job_id || null,
        bytesWritten: printResult.result?.bytes_written || 0,
        jobsInQueue: printResult.result?.jobs_in_queue || 0,
        printerStatus: printResult.result?.printer_status || null,
        success: printResult.success,
        error: printResult.error || null
      },
      testContent: {
        text: 'Texto normal, números e caracteres especiais',
        barcode: 'Código de barras (1234567890123)',
        qrcode: `QR Code com timestamp: ${testTimestamp}`,
        lines: 'Linhas de diferentes espessuras',
        rectangles: 'Retângulos de diferentes espessuras',
        fonts: 'Fontes de diferentes tamanhos (20, 30, 40)'
      },
      verification: {
        message: 'Verifique na etiqueta impressa se todos os elementos estão visíveis e nítidos',
        expectedElements: [
          'Cabeçalho "TESTE DE SAIDA DA IMPRESSORA"',
          'Data e hora do teste',
          'Nome da impressora',
          'Teste ID único',
          'Texto com letras, números e caracteres especiais',
          'Código de barras legível',
          'QR Code escaneável',
          'Linhas de diferentes espessuras',
          'Retângulos de diferentes espessuras',
          'Textos em diferentes tamanhos de fonte',
          'Rodapé "FIM DO TESTE"'
        ]
      },
      timestamp: new Date().toISOString()
    };
    
    if (printResult.success) {
      console.log('[TEST] ✅ Teste concluído com sucesso!');
      console.log(`[TEST] Job ID: ${result.printResult.jobId}`);
      console.log(`[TEST] Bytes escritos: ${result.printResult.bytesWritten}`);
      console.log(`[TEST] Duração: ${duration}ms`);
    } else {
      console.error('[TEST] ❌ Falha no teste de impressão');
      console.error(`[TEST] Erro: ${printResult.error}`);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('[TEST] Erro no teste de saída da impressora:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

// Teste completo via Python USB
app.post('/api/python-usb/full-test', async (req, res) => {
  try {
    console.log('[START] Executando teste completo Python USB...');
    
    const result = await pythonUSBIntegration.fullTest();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste completo Python USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Obter status da integração Python USB
app.get('/api/python-usb/info', (req, res) => {
  try {
    const status = pythonUSBIntegration.getStatus();
    
    res.json({
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter status Python USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ===== ENDPOINTS USB =====

// Status do serviço USB (reflete hardware real)
app.get('/api/usb/status', async (req, res) => {
  try {
    // Detectar via métodos múltiplos
    const detection = await zebraUSBConnection.detectPrinters().catch(() => ({ serial: [], windows: [], usb: [] }));
    
    // Tentar também via Python USB (método principal)
    let pythonUSBDetection = { success: false, printers: [], count: 0 };
    try {
      const listResult = await pythonUSBIntegration.listPrinters();
      if (listResult && listResult.success && listResult.result) {
        pythonUSBDetection = {
          success: true,
          printers: listResult.result.printers || [],
          count: listResult.result.count || 0
        };
      } else if (listResult && listResult.printers) {
        // Fallback: se retornar diretamente os printers
        pythonUSBDetection = {
          success: true,
          printers: Array.isArray(listResult.printers) ? listResult.printers : [],
          count: Array.isArray(listResult.printers) ? listResult.printers.length : 0
        };
      }
    } catch (error) {
      console.error('[ERRO] Erro ao listar impressoras via Python:', error);
      // Ignorar erro silenciosamente
    }

    // Contar impressoras detectadas
    const serialCount = detection.serial?.length || 0;
    const windowsCount = detection.windows?.length || 0;
    const usbCount = detection.usb?.length || 0;
    const pythonCount = pythonUSBDetection.success ? (pythonUSBDetection.count || 0) : 0;
    
    // Verificar se há impressoras Zebra válidas detectadas
    // Apenas considerar válidas se Python USB detectou E são realmente Zebra
    // Garantir que pythonPrinters seja sempre um array
    let pythonPrinters = [];
    if (pythonUSBDetection.printers) {
      if (Array.isArray(pythonUSBDetection.printers)) {
        pythonPrinters = pythonUSBDetection.printers;
      } else if (typeof pythonUSBDetection.printers === 'object') {
        // Se for um objeto, converter para array
        pythonPrinters = [pythonUSBDetection.printers];
      }
    }
    
    const validZebraPrinters = pythonPrinters.filter(p => {
      if (!p || typeof p !== 'object') return false;
      const name = (p.name || '').toLowerCase();
      // Incluir termos para ZP 505 e outros modelos
      return name.includes('zebra') || name.includes('zd') || name.includes('zdesigner') || 
             name.includes('zp505') || name.includes('zp 505') || name.includes('zp-505');
    });
    const validPythonCount = validZebraPrinters.length;
    
    // Usar o maior número de impressoras detectadas (Python geralmente é mais preciso)
    const totalDetected = Math.max(
      serialCount + windowsCount + usbCount,
      validPythonCount
    );
    
    // Considerar conectado se:
    // 1. Há uma conexão USB ativa E/OU
    // 2. Python detectou impressoras Zebra válidas (status_ready é true OU undefined/null - assume-se que está pronta se não especificado)
    const hasActiveConnection = Boolean(usbConnection?.isConnected) || Boolean(zebraUSBConnection?.isConnected);
    
    // Considerar conectada se:
    // - Existe pelo menos uma impressora Zebra válida E
    // - Ela está pronta (status_ready === true) OU status_ready não foi definido (undefined/null) - assumimos que está pronta
    const hasReadyZebraPrinters = validZebraPrinters.length > 0 && 
                                   validZebraPrinters.some(p => {
                                     // Se status_ready é true, está pronta
                                     // Se status_ready é undefined/null, assumimos que está pronta (não foi verificado explicitamente)
                                     // Se status_ready é false, não está pronta
                                     return p.status_ready === true || p.status_ready === undefined || p.status_ready === null;
                                   });
    
    const connected = hasActiveConnection || hasReadyZebraPrinters;

    res.json({ 
      status: 'online',
      service: 'USB Printer Connection Service',
      version: '1.0.0',
      connected: connected,
      printerCount: totalDetected,
      validZebraCount: validPythonCount, // Apenas impressoras Zebra válidas
      ports: {
        serial: detection.serial || [],
        windows: detection.windows || [],
        usb: detection.usb || [],
        python: pythonPrinters || [], // Todas as impressoras detectadas via Python
        validZebra: validZebraPrinters // Apenas Zebra válidas
      },
      detectionSummary: {
        serial: serialCount,
        windows: windowsCount,
        usb: usbCount,
        python: pythonCount, // Contagem total via Python
        validZebra: validPythonCount // Contagem de Zebra válidas
      },
      pythonDetection: {
        success: pythonUSBDetection.success,
        printers: pythonPrinters || [],
        count: pythonCount,
        validZebra: validZebraPrinters,
        validZebraCount: validPythonCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter status USB:', error);
    res.status(500).json({
      status: 'offline',
      service: 'USB Printer Connection Service',
      version: '1.0.0',
      connected: false,
      printerCount: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Listar portas seriais disponíveis (apenas Zebra)
app.get('/api/usb/ports', async (req, res) => {
  try {
    console.log('[DEBUG] Listando portas seriais Zebra...');
    const { allPorts, printerPorts } = await usbConnection.listPorts();
    
    // Retornar apenas portas Zebra filtradas (printerPorts)
    // allPorts mantido apenas para debug se necessário
    res.json({
      success: true,
      ports: printerPorts, // Apenas portas Zebra (principal)
      allPorts: req.query.debug === 'true' ? allPorts : undefined, // Todas as portas apenas se debug=true
      count: printerPorts.length,
      totalPorts: allPorts.length, // Total para referência
      timestamp: new Date().toISOString(),
      message: printerPorts.length > 0 
        ? `${printerPorts.length} porta(s) Zebra encontrada(s)` 
        : 'Nenhuma porta Zebra detectada. Use ?debug=true para ver todas as portas.'
    });
  } catch (error) {
    console.error('Erro ao listar portas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Conectar à impressora via USB
app.post('/api/usb/connect', async (req, res) => {
  try {
    const { portPath, options = {} } = req.body;
    
    if (!portPath) {
      return res.status(400).json({
        success: false,
        error: 'Caminho da porta é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[USB] Conectando à porta USB ${portPath}...`);
    await usbConnection.connect(portPath, options);
    
    res.json({
      success: true,
      message: 'Conectado à impressora USB',
      connectionInfo: usbConnection.getConnectionInfo(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na conexão USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Auto-conectar à impressora
app.post('/api/usb/auto-connect', async (req, res) => {
  try {
    console.log('[DEBUG] Auto-detectando impressora USB...');
    const result = await usbConnection.autoConnect();
    
    res.json({
      success: true,
      result: result,
      connectionInfo: usbConnection.getConnectionInfo(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na auto-conexão USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Desconectar da impressora
app.post('/api/usb/disconnect', async (req, res) => {
  try {
    await usbConnection.disconnect();
    
    res.json({
      success: true,
      message: 'Desconectado da impressora USB',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao desconectar USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Testar conectividade USB
app.post('/api/usb/test', async (req, res) => {
  try {
    const { portPath } = req.body;
    
    if (portPath) {
      // Conectar à porta específica primeiro
      await usbConnection.connect(portPath);
    }
    
    console.log('[TEST] Testando conectividade USB...');
    const testResult = await usbConnection.testConnection();
    
    res.json({
      success: true,
      result: testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enviar comando ZPL via USB
app.post('/api/usb/send-zpl', async (req, res) => {
  try {
    const { zplCommand, portPath } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    // Se não estiver conectado, tentar conectar
    if (!usbConnection.isConnected && portPath) {
      await usbConnection.connect(portPath);
    }
    
    console.log('[SEND] Enviando comando ZPL via USB...');
    await usbConnection.sendZPL(zplCommand);
    
    res.json({
      success: true,
      message: 'Comando ZPL enviado com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao enviar ZPL via USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// ROTA UNIFICADA PARA ENVIO DIRETO DE ZPL
// ========================================

// Enviar ZPL direto para impressora (rota unificada)
app.post('/api/send-zpl-direct', async (req, res) => {
  try {
    const { 
      zplCommand, 
      method = 'python-usb', // Padrão: python-usb (mais confiável)
      copies = 1,
      encoding = 'utf-8',
      portPath = null,
      validateZPL = true
    } = req.body;
    
    // Validação básica
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    // Validação do ZPL se solicitada (COM PREVENÇÃO DE VOID)
    if (validateZPL) {
      if (!zplCommand.startsWith('^XA') || !zplCommand.includes('^XZ')) {
        return res.status(400).json({
          success: false,
          error: 'Comando ZPL inválido: deve começar com ^XA e terminar com ^XZ',
          example: '^XA\n^FO50,50^A0N,30,30^FDTeste^FS\n^XZ',
          timestamp: new Date().toISOString()
        });
      }

      // VERIFICAÇÃO CRÍTICA: Detectar comandos perigosos
      const dangerousCommands = ['^RFW', '^RFR', '^RFI', '^RFT', '^RFU'];
      const foundDangerous = dangerousCommands.filter(cmd => zplCommand.includes(cmd));
      
      if (foundDangerous.length > 0) {
        console.log(`🚨 BLOQUEADO: Comandos perigosos detectados: ${foundDangerous.join(', ')}`);
        return res.status(400).json({
          success: false,
          error: 'COMANDOS RFID BLOQUEADOS - RISCO DE VOID!',
          dangerousCommands: foundDangerous,
          message: 'Para sua segurança, comandos RFID foram bloqueados para evitar VOID',
          suggestion: 'Use apenas comandos de impressão visual (texto, código de barras, QR code)',
          safeExample: '^XA\n^FO50,50^A0N,30,30^FDTeste Seguro^FS\n^FO50,80^BCN,60,Y,N,N\n^FD123456^FS\n^XZ',
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`[SEND] Enviando ZPL direto para impressora via ${method}...`);
    console.log(`[INFO] Comando ZPL (${zplCommand.length} chars):`);
    console.log(zplCommand.substring(0, 200) + (zplCommand.length > 200 ? '...' : ''));
    
    let result;
    let methodUsed = method;

    // Tentar diferentes métodos de envio
    try {
      switch (method) {
        case 'python-usb':
          console.log('🐍 Usando Python USB (recomendado)');
          result = await pythonUSBIntegration.sendZPL(zplCommand, encoding, copies);
          break;
          
        // case 'python' removido - usar python-usb
          
        case 'usb-direct':
          console.log('[USB] Usando conexão USB direta');
          if (portPath) {
            if (!usbConnection.isConnected) {
              await usbConnection.connect(portPath);
            }
          }
          await usbConnection.sendZPL(zplCommand);
          result = { success: true, message: 'Enviado via USB direto' };
          break;
          
        case 'zebra-usb':
          console.log('🦓 Usando Zebra USB');
          await zebraUSBConnection.connect();
          await zebraUSBConnection.sendZPL(zplCommand);
          await zebraUSBConnection.disconnect();
          result = { success: true, message: 'Enviado via Zebra USB' };
          break;
          
        default:
          throw new Error(`Método '${method}' não suportado. Use: python-usb, python, usb-direct, zebra-usb`);
      }
      
    } catch (primaryError) {
      console.warn(`[AVISO] Método ${method} falhou: ${primaryError.message}`);
      
      // Fallback automático para python-usb se outro método falhar
      if (method !== 'python-usb') {
        console.log('[RETRY] Tentando fallback para python-usb...');
        try {
          result = await pythonUSBIntegration.sendZPL(zplCommand, encoding, copies);
          methodUsed = 'python-usb (fallback)';
          console.log('[OK] Fallback bem-sucedido!');
        } catch (fallbackError) {
          throw new Error(`Método ${method} falhou: ${primaryError.message}. Fallback também falhou: ${fallbackError.message}`);
        }
      } else {
        throw primaryError;
      }
    }

    console.log(`[OK] ZPL enviado com sucesso via ${methodUsed}`);
    
    res.json({
      success: true,
      message: 'ZPL enviado para impressora com sucesso',
      method: methodUsed,
      zplLength: zplCommand.length,
      copies: copies,
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ERRO] Erro ao enviar ZPL direto:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      method: req.body.method || 'python-usb',
      timestamp: new Date().toISOString(),
      troubleshooting: {
        checkPrinter: 'Verifique se a impressora está conectada e ligada',
        checkUSB: 'Confirme se o cabo USB está conectado',
        checkDrivers: 'Verifique se os drivers da impressora estão instalados',
        tryDifferentMethod: 'Tente um método diferente (python-usb, python, usb-direct, zebra-usb)'
      }
    });
  }
});

// Validar comando ZPL com prevenção de VOID
app.post('/api/validate-zpl', (req, res) => {
  try {
    const { zplCommand, allowRFID = false } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório'
      });
    }

    const validation = {
      hasStart: zplCommand.includes('^XA'),
      hasEnd: zplCommand.includes('^XZ'),
      length: zplCommand.length,
      lines: zplCommand.split('\n').length,
      commands: [],
      dangerousCommands: [],
      safetyLevel: 'UNKNOWN',
      voidRisk: 'LOW'
    };

    // Comandos perigosos que podem causar VOID
    const dangerousCommands = ['^RFW', '^RFR', '^RFI', '^RFT', '^RFU'];
    
    // Extrair comandos ZPL
    const zplCommands = zplCommand.match(/\^[A-Z]{1,3}[^A-Z^]*/g) || [];
    validation.commands = zplCommands.map(cmd => cmd.substring(0, 10));

    // Verificar comandos perigosos
    validation.dangerousCommands = validation.commands.filter(cmd => 
      dangerousCommands.some(dangerous => cmd.startsWith(dangerous))
    );

    // Determinar nível de segurança
    if (validation.dangerousCommands.length > 0) {
      validation.safetyLevel = 'DANGEROUS';
      validation.voidRisk = 'HIGH';
      
      if (!allowRFID) {
        validation.isValid = false;
        validation.errors = validation.errors || [];
        validation.errors.push('COMANDOS RFID DETECTADOS - RISCO DE VOID!');
        validation.errors.push(`Comandos perigosos: ${validation.dangerousCommands.join(', ')}`);
        validation.errors.push('Use allowRFID=true apenas se tiver certeza absoluta');
      }
    } else {
      validation.safetyLevel = 'SAFE';
      validation.voidRisk = 'NONE';
    }

    // Validação básica
    validation.isValid = validation.hasStart && validation.hasEnd && (allowRFID || validation.dangerousCommands.length === 0);
    
    if (!validation.isValid) {
      validation.errors = validation.errors || [];
      if (!validation.hasStart) validation.errors.push('Comando deve começar com ^XA');
      if (!validation.hasEnd) validation.errors.push('Comando deve terminar com ^XZ');
    }

    const riskLevel = validation.voidRisk === 'HIGH' ? '🚨 ALTO RISCO' : 
                     validation.voidRisk === 'LOW' ? '[AVISO] BAIXO RISCO' : '[OK] SEM RISCO';
    
    console.log(`[DEBUG] Validação ZPL: ${validation.isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
    console.log(`[SECURITY] Nível de Segurança: ${validation.safetyLevel}`);
    console.log(`[AVISO] Risco de VOID: ${riskLevel}`);
    
    if (validation.dangerousCommands.length > 0) {
      console.log(`🚫 Comandos perigosos detectados: ${validation.dangerousCommands.join(', ')}`);
    }
    
    res.json({
      success: true,
      validation: validation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erro na validação ZPL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Obter exemplos de comandos ZPL
app.get('/api/zpl-examples', (req, res) => {
  const examples = {
    basic: {
      name: 'Texto Simples SEGURO',
      description: 'Imprime texto simples - SEM RISCO DE VOID',
      zpl: '^XA\n^FO50,50^A0N,30,30^FDTeste Seguro^FS\n^FO50,80^A0N,20,20^FDSem comandos RFID^FS\n^XZ',
      safety: 'SAFE'
    },
    barcode: {
      name: 'Código de Barras SEGURO',
      description: 'Código de barras Code 128 - SEM RISCO DE VOID',
      zpl: '^XA\n^FO50,50^BY2\n^BCN,80,Y,N,N\n^FD123456789012^FS\n^FO50,150^A0N,20,20^FDCódigo: 123456789012^FS\n^XZ',
      safety: 'SAFE'
    },
    qrcode: {
      name: 'QR Code SEGURO',
      description: 'QR Code com dados - SEM RISCO DE VOID',
      zpl: '^XA\n^FO50,50^BQN,2,4\n^FDMM,A789643610064|0464|001^FS\n^FO200,50^A0N,18,18^FDQR Code^FS\n^FO200,80^A0N,16,16^FDDados: 789643610064^FS\n^XZ',
      safety: 'SAFE'
    },
    complete: {
      name: 'Etiqueta Completa SEGURA',
      description: 'Etiqueta visual completa - SEM COMANDOS RFID',
      zpl: '^XA\n^CI28\n^FO50,30^A0N,25,25^FDProduto: Tênis Esportivo^FS\n^FO50,60^A0N,20,20^FDPO: 0464 | SEQ: 001^FS\n^FO50,90^A0N,18,18^FDCor: BLUE | Tam: 42^FS\n^FO50,120^BY2\n^BCN,60,Y,N,N\n^FD789643610064^FS\n^FO200,120^BQN,2,3\n^FDMM,A789643610064|0464|001^FS\n^FO50,200^A0N,16,16^FDLARROUD - SEM RFID^FS\n^XZ',
      safety: 'SAFE'
    },
    emergency: {
      name: 'PARADA DE EMERGÊNCIA',
      description: 'Cancela jobs e limpa buffer da impressora',
      zpl: '^XA\n^FX === PARADA DE EMERGÊNCIA ===\n~JA\n^JUS\n^FO50,50^A0N,25,25^FDEMERGÊNCIA EXECUTADA^FS\n^FO50,80^A0N,20,20^FDJobs cancelados^FS\n^FO50,110^A0N,20,20^FDBuffer limpo^FS\n^XZ',
      safety: 'EMERGENCY'
    }
  };

  res.json({
    success: true,
    examples: examples,
    usage: 'Use POST /api/send-zpl-direct com o campo zplCommand',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// INTERFACE WEB PARA TESTE DE ZPL
// ========================================

// Página de teste ZPL
app.get('/zpl-tester', (req, res) => {
  const htmlPage = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZPL Tester - Sistema Larroud RFID</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc; 
            color: #1f2937;
            line-height: 1.6;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header {
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            color: white;
            padding: 24px;
            border-radius: 12px;
            margin-bottom: 24px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 8px; }
        .header p { opacity: 0.9; }
        
        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        
        .zpl-panel {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .panel-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #374151;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .zpl-textarea {
            width: 100%;
            height: 300px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            resize: vertical;
            background: #f9fafb;
        }
        
        .zpl-textarea:focus {
            outline: none;
            border-color: #3b82f6;
            background: white;
        }
        
        .examples-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }
        
        .example-btn {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: left;
        }
        
        .example-btn:hover {
            background: #e5e7eb;
            border-color: #3b82f6;
        }
        
        .example-btn.active {
            background: #dbeafe;
            border-color: #3b82f6;
            color: #1e40af;
        }
        
        .example-title {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 4px;
        }
        
        .example-desc {
            font-size: 12px;
            color: #6b7280;
        }
        
        .controls {
            display: flex;
            gap: 12px;
            margin-top: 16px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .btn-primary {
            background: #3b82f6;
            color: white;
        }
        
        .btn-primary:hover {
            background: #2563eb;
        }
        
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #4b5563;
        }
        
        .btn-success {
            background: #10b981;
            color: white;
        }
        
        .btn-success:hover {
            background: #059669;
        }
        
        .btn:disabled {
            background: #d1d5db;
            color: #9ca3af;
            cursor: not-allowed;
        }
        
        .method-select {
            padding: 8px 12px;
            border: 2px solid #e5e7eb;
            border-radius: 6px;
            font-size: 14px;
            background: white;
        }
        
        .result-panel {
            grid-column: 1 / -1;
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            margin-top: 24px;
        }
        
        .result-content {
            background: #1f2937;
            color: #e5e7eb;
            padding: 16px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .status-indicator {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 8px;
        }
        
        .status-success {
            background: #dcfce7;
            color: #166534;
        }
        
        .status-error {
            background: #fee2e2;
            color: #dc2626;
        }
        
        .status-warning {
            background: #fef3c7;
            color: #d97706;
        }
        
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
            .main-content {
                grid-template-columns: 1fr;
            }
            
            .examples-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>[TEST] ZPL Tester</h1>
            <p>Sistema Larroud RFID - Teste comandos ZPL diretamente na impressora</p>
        </div>
        
        <div class="main-content">
            <div class="zpl-panel">
                <h2 class="panel-title">[INFO] Exemplos ZPL</h2>
                
                <div class="examples-grid" id="examples-grid">
                    <!-- Exemplos serão carregados aqui -->
                </div>
                
                <div class="controls">
                    <button class="btn btn-secondary" onclick="loadExamples()">
                        [RETRY] Recarregar Exemplos
                    </button>
                    <button class="btn btn-secondary" onclick="clearEditor()">
                        [DELETE] Limpar Editor
                    </button>
                </div>
            </div>
            
            <div class="zpl-panel">
                <h2 class="panel-title">[EDIT] Editor ZPL</h2>
                
                <textarea 
                    id="zpl-editor" 
                    class="zpl-textarea" 
                    placeholder="Cole seu comando ZPL aqui ou selecione um exemplo...&#10;&#10;Exemplo:&#10;^XA&#10;^FO50,50^A0N,30,30^FDHello World^FS&#10;^XZ"
                ></textarea>
                
                <div class="controls">
                    <select id="method-select" class="method-select">
                        <option value="python-usb">🐍 Python USB (Recomendado)</option>
                        <option value="usb-direct">[USB] USB Direto</option>
                        <option value="zebra-usb">🦓 Zebra USB</option>
                    </select>
                    
                    <button class="btn btn-primary" onclick="validateZPL()" id="validate-btn">
                        [DEBUG] Validar ZPL
                    </button>
                    
                    <button class="btn btn-success" onclick="sendZPL()" id="send-btn">
                        [SEND] Enviar para Impressora
                    </button>
                </div>
            </div>
        </div>
        
        <div class="result-panel" id="result-panel" style="display: none;">
            <h2 class="panel-title">
                [DATA] Resultado
                <span id="status-indicator" class="status-indicator"></span>
            </h2>
            <div class="result-content" id="result-content"></div>
        </div>
    </div>

    <script>
        let examples = {};
        
        // Carregar exemplos
        async function loadExamples() {
            try {
                const response = await fetch('/api/zpl-examples');
                const data = await response.json();
                examples = data.examples;
                renderExamples();
            } catch (error) {
                showResult('Erro ao carregar exemplos: ' + error.message, 'error');
            }
        }
        
        // Renderizar exemplos
        function renderExamples() {
            const grid = document.getElementById('examples-grid');
            grid.innerHTML = '';
            
            Object.keys(examples).forEach(key => {
                const example = examples[key];
                const btn = document.createElement('div');
                btn.className = 'example-btn';
                btn.onclick = () => selectExample(key, btn);
                btn.innerHTML = \`
                    <div class="example-title">\${example.name}</div>
                    <div class="example-desc">\${example.description}</div>
                \`;
                grid.appendChild(btn);
            });
        }
        
        // Selecionar exemplo
        function selectExample(key, btnElement) {
            // Remover seleção anterior
            document.querySelectorAll('.example-btn').forEach(btn => 
                btn.classList.remove('active')
            );
            
            // Marcar como ativo
            btnElement.classList.add('active');
            
            // Carregar no editor
            document.getElementById('zpl-editor').value = examples[key].zpl;
        }
        
        // Limpar editor
        function clearEditor() {
            document.getElementById('zpl-editor').value = '';
            document.querySelectorAll('.example-btn').forEach(btn => 
                btn.classList.remove('active')
            );
        }
        
        // Validar ZPL
        async function validateZPL() {
            const zplCommand = document.getElementById('zpl-editor').value.trim();
            
            if (!zplCommand) {
                showResult('Por favor, insira um comando ZPL', 'warning');
                return;
            }
            
            const btn = document.getElementById('validate-btn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Validando...';
            
            try {
                const response = await fetch('/api/validate-zpl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zplCommand })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const validation = data.validation;
                    let result = \`[OK] VALIDAÇÃO ZPL\\n\`;
                    result += \`═══════════════════\\n\`;
                    result += \`Status: \${validation.isValid ? 'VÁLIDO' : 'INVÁLIDO'}\\n\`;
                    result += \`Tamanho: \${validation.length} caracteres\\n\`;
                    result += \`Linhas: \${validation.lines}\\n\`;
                    result += \`Comandos: \${validation.commands.length}\\n\`;
                    
                    if (validation.commands.length > 0) {
                        result += \`\\nComandos encontrados:\\n\`;
                        result += validation.commands.slice(0, 10).join(', ');
                        if (validation.commands.length > 10) {
                            result += \` ... e mais \${validation.commands.length - 10}\`;
                        }
                    }
                    
                    if (!validation.isValid && validation.errors) {
                        result += \`\\n\\n[ERRO] ERROS:\\n\`;
                        validation.errors.forEach(error => {
                            result += \`• \${error}\\n\`;
                        });
                    }
                    
                    showResult(result, validation.isValid ? 'success' : 'error');
                } else {
                    showResult('Erro na validação: ' + data.error, 'error');
                }
                
            } catch (error) {
                showResult('Erro na validação: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '[DEBUG] Validar ZPL';
            }
        }
        
        // Enviar ZPL
        async function sendZPL() {
            const zplCommand = document.getElementById('zpl-editor').value.trim();
            const method = document.getElementById('method-select').value;
            
            if (!zplCommand) {
                showResult('Por favor, insira um comando ZPL', 'warning');
                return;
            }
            
            const btn = document.getElementById('send-btn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Enviando...';
            
            try {
                const response = await fetch('/api/send-zpl-direct', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        zplCommand, 
                        method, 
                        copies: 1,
                        validateZPL: true 
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    let result = \`[OK] ZPL ENVIADO COM SUCESSO\\n\`;
                    result += \`═══════════════════════════\\n\`;
                    result += \`Método: \${data.method}\\n\`;
                    result += \`Tamanho: \${data.zplLength} chars\\n\`;
                    result += \`Cópias: \${data.copies}\\n\`;
                    result += \`Timestamp: \${new Date(data.timestamp).toLocaleString()}\\n\`;
                    
                    if (data.result && data.result.result) {
                        const printerResult = data.result.result;
                        result += \`\\n[PRINT] INFORMAÇÕES DA IMPRESSORA:\\n\`;
                        result += \`Job ID: \${printerResult.job_id || 'N/A'}\\n\`;
                        result += \`Bytes enviados: \${printerResult.bytes_written || 'N/A'}\\n\`;
                        result += \`Jobs na fila: \${printerResult.jobs_in_queue || 'N/A'}\\n\`;
                        result += \`Status: \${printerResult.printer_status || 'N/A'}\\n\`;
                    }
                    
                    result += \`\\n[TARGET] Verifique se a etiqueta foi impressa!\\n\`;
                    
                    showResult(result, 'success');
                } else {
                    let result = \`[ERRO] ERRO NO ENVIO\\n\`;
                    result += \`═══════════════════\\n\`;
                    result += \`Erro: \${data.error}\\n\`;
                    result += \`Método: \${data.method}\\n\`;
                    
                    if (data.troubleshooting) {
                        result += \`\\n[TOOLS] DICAS DE SOLUÇÃO:\\n\`;
                        Object.values(data.troubleshooting).forEach(tip => {
                            result += \`• \${tip}\\n\`;
                        });
                    }
                    
                    showResult(result, 'error');
                }
                
            } catch (error) {
                showResult('Erro na comunicação: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '[SEND] Enviar para Impressora';
            }
        }
        
        // Mostrar resultado
        function showResult(content, type) {
            const panel = document.getElementById('result-panel');
            const indicator = document.getElementById('status-indicator');
            const resultContent = document.getElementById('result-content');
            
            panel.style.display = 'block';
            resultContent.textContent = content;
            
            indicator.className = 'status-indicator status-' + type;
            indicator.textContent = {
                'success': 'SUCESSO',
                'error': 'ERRO',
                'warning': 'AVISO'
            }[type] || 'INFO';
            
            // Scroll para o resultado
            panel.scrollIntoView({ behavior: 'smooth' });
        }
        
        // Carregar exemplos ao inicializar
        loadExamples();
    </script>
</body>
</html>`;

  res.send(htmlPage);
});

// Rota para testar ZPL específico (API)
app.post('/api/test-zpl', async (req, res) => {
  try {
    const { 
      zplCommand, 
      testName = 'Teste Personalizado',
      description = 'ZPL enviado via API de teste',
      method = 'python-usb',
      copies = 1,
      analyze = true
    } = req.body;
    
    if (!zplCommand) {
      return res.status(400).json({
        success: false,
        error: 'Comando ZPL é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[TEST] Teste ZPL: ${testName}`);
    console.log(`[INFO] Descrição: ${description}`);
    console.log(`[SIZE] Tamanho: ${zplCommand.length} chars`);

    const results = {
      testInfo: {
        name: testName,
        description: description,
        timestamp: new Date().toISOString(),
        zplLength: zplCommand.length,
        method: method,
        copies: copies
      },
      validation: null,
      analysis: null,
      sendResult: null
    };

    // 1. Validar ZPL
    try {
      // Usar base URL configurável ou inferir do request
      const baseUrl = process.env.BASE_URL || (req ? `${req.protocol}://${req.get('host')}` : `http://localhost:${PORT}`);
      const validateResponse = await fetch(`${baseUrl}/api/validate-zpl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zplCommand })
      });
      
      if (validateResponse.ok) {
        const validateData = await validateResponse.json();
        results.validation = validateData.validation;
        console.log(`[DEBUG] Validação: ${validateData.validation.isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
      }
    } catch (error) {
      console.warn('Erro na validação:', error.message);
    }

    // 2. Análise do conteúdo (se solicitada)
    if (analyze) {
      results.analysis = analyzeZPLContent(zplCommand);
      console.log(`[DEBUG] Análise: ${Object.keys(results.analysis.elements).length} tipos de elementos`);
    }

    // 3. Enviar para impressora
    try {
      // Usar base URL configurável ou inferir do request
      const baseUrl = process.env.BASE_URL || (req ? `${req.protocol}://${req.get('host')}` : `http://localhost:${PORT}`);
      const sendResponse = await fetch(`${baseUrl}/api/send-zpl-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          zplCommand, 
          method, 
          copies,
          validateZPL: false // Já validamos acima
        })
      });
      
      const sendData = await sendResponse.json();
      results.sendResult = sendData;
      
      if (sendData.success) {
        console.log(`[OK] ZPL enviado com sucesso via ${sendData.method}`);
      } else {
        console.log(`[ERRO] Erro no envio: ${sendData.error}`);
      }
      
    } catch (error) {
      results.sendResult = {
        success: false,
        error: error.message
      };
      console.error('Erro no envio:', error.message);
    }

    // Determinar status geral
    const overallSuccess = results.sendResult && results.sendResult.success;
    const hasValidation = results.validation && results.validation.isValid;

    res.json({
      success: overallSuccess,
      message: overallSuccess ? 'ZPL testado e enviado com sucesso' : 'Teste completado com erros',
      results: results,
      summary: {
        validated: hasValidation,
        sent: overallSuccess,
        analyzed: analyze,
        elements: results.analysis ? Object.keys(results.analysis.elements).length : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro no teste ZPL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Função auxiliar para análise de conteúdo ZPL
function analyzeZPLContent(zpl) {
  const lines = zpl.split('\\n');
  const analysis = {
    elements: {
      texts: [],
      barcodes: [],
      rfid: [],
      positioning: [],
      formatting: []
    },
    statistics: {
      totalLines: lines.length,
      commandLines: 0,
      commentLines: 0,
      emptyLines: 0
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    
    if (!trimmed) {
      analysis.statistics.emptyLines++;
      return;
    }
    
    if (trimmed.startsWith('^FX')) {
      analysis.statistics.commentLines++;
      return;
    }
    
    if (trimmed.startsWith('^')) {
      analysis.statistics.commandLines++;
    }

    // Analisar elementos específicos
    if (trimmed.includes('^FD') && !trimmed.includes('^BC')) {
      const content = trimmed.split('^FD')[1]?.split('^FS')[0] || '';
      if (content) {
        analysis.elements.texts.push(`Texto: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
      }
    }
    
    if (trimmed.includes('^BC') || trimmed.includes('^BY')) {
      analysis.elements.barcodes.push('Código de barras detectado');
    }
    
    if (trimmed.includes('^RFW') || trimmed.includes('^RFR')) {
      analysis.elements.rfid.push('Comando RFID detectado');
    }
    
    if (trimmed.includes('^FO')) {
      const coords = trimmed.replace(/.*\\^FO/, '').split('^')[0];
      analysis.elements.positioning.push(`Posição: ${coords}`);
    }
    
    if (trimmed.includes('^CI') || trimmed.includes('^RS')) {
      analysis.elements.formatting.push(`Formatação: ${trimmed.substring(0, 20)}`);
    }
  });

  return analysis;
}

// Obter informações da conexão USB
app.get('/api/usb/info', (req, res) => {
  try {
    const connectionInfo = usbConnection.getConnectionInfo();
    
    res.json({
      success: true,
      connectionInfo: connectionInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter informações USB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// ENDPOINTS PARA INTEGRAÇÃO MUPA RFID
// ========================================
// REMOVIDO: Integração MUPA não é usada pela aba de etiquetas

/*
// Status do serviço MUPA
app.get('/api/mupa/status', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'MUPA RFID Integration Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Imprimir etiqueta
app.post('/api/mupa/print-label', async (req, res) => {
  try {
    const { text, additionalInfo = {} } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Texto da etiqueta é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📄 Imprimindo etiqueta: ${text}`);
    
    const result = await mupaRFIDIntegration.printLabel(text, additionalInfo);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao imprimir etiqueta:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Gravar dados no RFID
app.post('/api/mupa/write-rfid', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Dados para gravação RFID são obrigatórios',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📄 Gravando RFID: ${data}`);
    
    const result = await mupaRFIDIntegration.writeRFID(data);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao gravar RFID:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Imprimir etiqueta e gravar RFID em um único comando
app.post('/api/mupa/print-and-write', async (req, res) => {
  try {
    const { text, additionalInfo = {} } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Texto para impressão e gravação RFID é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📄 Imprimindo e gravando RFID: ${text}`);
    
    const result = await mupaRFIDIntegration.printAndWriteRFID(text, additionalInfo);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao imprimir e gravar RFID:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Ler dados do RFID
app.post('/api/mupa/read-rfid', async (req, res) => {
  try {
    console.log('📄 Lendo dados do RFID...');
    
    const result = await mupaRFIDIntegration.readRFID();
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao ler RFID:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Teste completo MUPA
app.post('/api/mupa/test', async (req, res) => {
  try {
    const { text = "MUPA_TESTE_01" } = req.body;
    
    console.log(`[TEST] Executando teste completo MUPA: ${text}`);
    
    const result = await mupaRFIDIntegration.testMupa(text);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro no teste MUPA:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Obter status da integração MUPA
app.get('/api/mupa/info', (req, res) => {
  try {
    const status = mupaRFIDIntegration.getStatus();
    
    res.json({
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter informações MUPA:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
*/

// ========================================
// ENDPOINTS PARA PROCESSAMENTO CSV
// ========================================

// Importar módulo de processamento CSV
// Endpoints CSV removidos - funcionalidade duplicada, usar /api/upload-excel e /api/print-individual

// Tratamento de erros global (deve ser o último middleware)
app.use((error, req, res, next) => {
  console.error('[ERROR-HANDLER] Erro capturado:', error.message);
  console.error('[ERROR-HANDLER] Stack:', error.stack);
  console.error('[ERROR-HANDLER] URL:', req.url);
  console.error('[ERROR-HANDLER] Method:', req.method);
  
  // Garantir que a resposta não foi enviada ainda
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor',
      timestamp: new Date().toISOString()
    });
  } else {
    console.warn('[ERROR-HANDLER] ⚠️ Resposta já foi enviada, não é possível enviar erro');
  }
});

// Middleware para capturar erros em requisições não tratadas
app.use((req, res, next) => {
  // Garantir que todas as requisições tenham timeout
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Configurar rota catch-all para servir frontend React (deve ser a última rota)
// Isso permite que o React Router funcione corretamente (SPA)
const frontendPath = path.join(__dirname, 'public', 'app');
const indexPath = path.join(frontendPath, 'index.html');

// Logs detalhados para debug
console.log('[INIT] Verificando frontend...');
console.log(`[INIT] __dirname: ${__dirname}`);
console.log(`[INIT] Frontend path: ${frontendPath}`);
console.log(`[INIT] Index path: ${indexPath}`);
console.log(`[INIT] Index exists: ${fs.existsSync(indexPath)}`);

// Verificar se o diretório public/app existe
const publicAppExists = fs.existsSync(frontendPath);
console.log(`[INIT] Public/app directory exists: ${publicAppExists}`);

if (publicAppExists) {
  // Listar arquivos no diretório para debug
  try {
    const files = fs.readdirSync(frontendPath);
    console.log(`[INIT] Arquivos em public/app: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
  } catch (err) {
    console.log(`[INIT] Erro ao listar arquivos: ${err.message}`);
  }
}

// Verificar se o frontend existe (pode não existir em desenvolvimento local)
const frontendExists = fs.existsSync(indexPath);

if (frontendExists) {
  // Servir arquivos estáticos do frontend (JS, CSS, imagens, etc.)
  // Usar caminho absoluto para garantir que funcione no Cloud Run
  const absoluteFrontendPath = path.resolve(frontendPath);
  const absoluteIndexPath = path.resolve(indexPath);
  
  console.log(`[INIT] Absolute frontend path: ${absoluteFrontendPath}`);
  console.log(`[INIT] Absolute index path: ${absoluteIndexPath}`);
  
  app.use(express.static(absoluteFrontendPath));
  
  // Para todas as rotas que não começam com /api ou /health, servir o index.html (SPA fallback)
  // Isso permite que o React Router funcione corretamente
  // IMPORTANTE: Esta rota deve ser a ÚLTIMA rota registrada
  app.get('*', (req, res) => {
    // Excluir rotas de API e health check
    if (req.path.startsWith('/api') || req.path === '/health') {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    // Caso contrário, servir o index.html do React
    console.log(`[FRONTEND] Servindo index.html para: ${req.path}`);
    res.sendFile(absoluteIndexPath, (err) => {
      if (err) {
        console.error(`[FRONTEND] Erro ao servir index.html: ${err.message}`);
        console.error(`[FRONTEND] Stack: ${err.stack}`);
        if (!res.headersSent) {
          res.status(500).send('Erro ao carregar frontend');
        }
      }
    });
  });
  
  console.log('[INIT] ✅ Frontend React configurado para servir em /');
  console.log(`[INIT] Frontend path: ${absoluteFrontendPath}`);
} else {
  // Em desenvolvimento local: frontend roda separado na porta 3000 (React dev server)
  // Backend apenas serve API na porta 3005
  // Em produção (Cloud Run): frontend é buildado e copiado para backend/public/app
  const isDevelopment = process.env.NODE_ENV !== 'production';
  console.log(`[INIT] ${isDevelopment ? '✅' : '⚠️'} Modo: ${isDevelopment ? 'DESENVOLVIMENTO' : 'PRODUÇÃO'}`);
  console.log(`[INIT] ${isDevelopment ? 'Frontend rodando separadamente na porta 3000' : 'Frontend não encontrado - servindo apenas API'}`);
  if (!isDevelopment) {
    console.log(`[INIT] ⚠️ Frontend não encontrado em: ${indexPath}`);
    console.log(`[INIT] ⚠️ Verifique se o frontend foi buildado e copiado para backend/public/app`);
  }
  
  // Em produção sem frontend, servir mensagem JSON na raiz
  // Mas ainda permitir que outras rotas funcionem
  app.get('/', (req, res) => {
    if (!isDevelopment) {
      res.json({ 
        message: 'Servidor Larroudé RFID funcionando!',
        mode: 'production',
        note: 'Frontend não encontrado. Verifique se o frontend foi buildado e copiado para backend/public/app',
        frontendPath: frontendPath,
        indexPath: indexPath
      });
    } else {
      res.json({ 
        message: 'Servidor Larroudé RFID funcionando!',
        mode: 'development',
        note: 'Frontend rodando separadamente em http://localhost:3000'
      });
    }
  });
}

// Iniciar servidor com tratamento de erros robusto
console.log('[STARTUP] Iniciando servidor...');
console.log(`[STARTUP] PORT=${PORT}`);
console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV || 'not set'}`);

let server;

// Função para verificar e limpar porta antes de iniciar
function checkAndClearPort(port) {
  const { execSync } = require('child_process');
  
  try {
    if (process.platform === 'win32') {
      try {
        const portCheck = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { 
          encoding: 'utf8', 
          stdio: 'pipe' 
        });
        
        if (portCheck && portCheck.trim()) {
          console.log(`[STARTUP] ⚠️ Porta ${port} em uso, tentando liberar...`);
          const lines = portCheck.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid)) {
              try {
                execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', stdio: 'pipe' });
                console.log(`[STARTUP] ✅ Processo ${pid} encerrado`);
              } catch (killError) {
                // Ignorar erros ao tentar encerrar processo
              }
            }
          }
          // Aguardar um pouco para a porta ser liberada (usar setTimeout seria melhor, mas como é síncrono, usar pequeno delay)
          require('child_process').execSync('timeout /t 2 /nobreak >nul 2>&1', { stdio: 'pipe' });
        }
      } catch (e) {
        // Porta não está em uso, continuar normalmente
      }
    } else {
      // Linux/Mac: usar lsof
      try {
        const portCheck = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' });
        if (portCheck && portCheck.trim()) {
          console.log(`[STARTUP] ⚠️ Porta ${port} em uso, tentando liberar...`);
          const pids = portCheck.trim().split('\n');
          for (const pid of pids) {
            if (pid && !isNaN(pid)) {
              try {
                execSync(`kill -9 ${pid}`, { encoding: 'utf8', stdio: 'pipe' });
                console.log(`[STARTUP] ✅ Processo ${pid} encerrado`);
              } catch (killError) {
                // Ignorar erros
              }
            }
          }
          // Aguardar um pouco (Linux/Mac)
          require('child_process').execSync('sleep 2', { stdio: 'pipe' });
        }
      } catch (e) {
        // Porta não está em uso
      }
    }
  } catch (error) {
    console.log(`[STARTUP] ⚠️ Erro ao verificar porta ${port}: ${error.message}`);
  }
}

// Função para iniciar o servidor
function startServer() {
  // Verificar e limpar porta antes de iniciar
  checkAndClearPort(PORT);
try {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`✅ Servidor escutando em 0.0.0.0:${PORT}`);
    console.log(`✅ Health check disponível em http://0.0.0.0:${PORT}/health`);
  });

    server.on('listening', () => {
      console.log('✅ Servidor está escutando!');
      console.log('[STARTUP] Servidor iniciado com sucesso e pronto para receber requisições');
    });
    
    // Tratar erros do servidor de forma mais robusta (não encerrar o processo)
  server.on('error', (error) => {
      console.error('❌ Erro no servidor HTTP:', error.message);
    console.error('❌ Stack:', error.stack);
      
      // Se for erro de porta em uso, tentar limpar e reiniciar
      if (error.code === 'EADDRINUSE') {
        console.log('[SERVER] Tentando limpar porta e reiniciar...');
        checkAndClearPort(PORT);
        // Não tentar reiniciar automaticamente - deixar o nodemon fazer isso
      }
      
      // Não encerrar o processo imediatamente - deixar o nodemon gerenciar
      // Apenas logar o erro e continuar
    });
    
    // Tratar erros de conexão do cliente (não devem derrubar o servidor)
    server.on('clientError', (error, socket) => {
      // Filtrar erros comuns que são normais (timeouts, conexões fechadas pelo cliente, etc.)
      const errorMessage = error.message || '';
      const isNormalError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('EPIPE') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('read ECONNRESET');
      
      // Apenas logar se não for um erro normal (para não poluir os logs)
      if (!isNormalError) {
        console.warn('[SERVER] ⚠️ Erro de cliente HTTP:', error.message);
      } else {
        // Log apenas em modo debug (opcional)
        if (process.env.DEBUG_CLIENT_ERRORS === 'true') {
          console.log('[SERVER] [DEBUG] Cliente desconectou normalmente:', error.message);
        }
      }
      
      // Fechar a conexão do cliente, mas não derrubar o servidor
      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });
    
    // Configurar timeout do servidor para evitar conexões penduradas
    server.keepAliveTimeout = 65000; // 65 segundos
    server.headersTimeout = 66000; // 66 segundos (deve ser maior que keepAliveTimeout)
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Iniciar API Python Image Proxy ANTES do servidor iniciar
// A API Python sempre inicia junto com o backend (local e Cloud Run)
(async () => {
  try {
    // Iniciar API Python sempre que possível (local e Cloud Run)
    if (imageProxyStarter && process.env.AUTO_START_IMAGE_PROXY !== 'false') {
      console.log('[STARTUP] Iniciando API Python Image Proxy antes do servidor...');
      
      // Iniciar API Python com tratamento de erro robusto
      try {
        await imageProxyStarter.startImageProxy();
        console.log('[STARTUP] ✅ API Python Image Proxy iniciada com sucesso');
      } catch (proxyError) {
        console.error('[STARTUP] ⚠️ Erro ao iniciar API Python:', proxyError.message);
        console.warn('[STARTUP] Continuando sem API Python (pode ser iniciada manualmente depois)');
      }
      
      // Usar a porta detectada pelo starter (se disponível) ou tentar detectar automaticamente
      const detectedPort = process.env._IMAGE_PROXY_ACTUAL_PORT || process.env.IMAGE_PROXY_PORT || '8000';
      const imageProxyUrl = process.env.IMAGE_PROXY_URL || `http://127.0.0.1:${detectedPort}`;
      
      console.log(`[STARTUP] Tentando conectar na API Python em ${imageProxyUrl}...`);
      
      // Aguardar até 10 segundos para a API estar pronta
      let attempts = 0;
      const maxAttempts = 20; // 20 tentativas de 500ms = 10 segundos
      let apiReady = false;
      
      while (attempts < maxAttempts && !apiReady) {
        try {
          const response = await axios.get(`${imageProxyUrl}/status`, { timeout: 1000 });
          if (response.status === 200) {
            console.log(`[STARTUP] ✅ API Python Image Proxy está pronta em ${imageProxyUrl}!`);
            apiReady = true;
          }
        } catch (error) {
          // API ainda não está pronta, continuar tentando
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      // Se não conseguiu conectar, iniciar servidor mesmo assim (API pode iniciar depois)
      // O backend tem detecção automática de porta, então vai encontrar a API quando ela estiver pronta
      if (!apiReady) {
        console.log('[STARTUP] ⚠️ API Python Image Proxy não respondeu em 10s, iniciando servidor mesmo assim...');
        console.log('[STARTUP] 💡 O backend vai detectar automaticamente a porta da API quando ela estiver pronta');
      }
      
      startServer();
    } else {
      if (process.env.AUTO_START_IMAGE_PROXY === 'false') {
        console.log('[STARTUP] AUTO_START_IMAGE_PROXY=false, pulando inicialização automática da API Python');
      }
      startServer();
    }
  } catch (error) {
    console.error('[STARTUP] ⚠️ Erro crítico na inicialização:', error.message);
    console.error('[STARTUP] Stack:', error.stack);
    console.warn('[STARTUP] Tentando iniciar servidor mesmo assim...');
    try {
      startServer();
    } catch (startError) {
      console.error('[STARTUP] ❌ Erro fatal ao iniciar servidor:', startError.message);
      // Não fazer process.exit aqui - deixar o nodemon gerenciar
    }
  }
})().catch((error) => {
  // Capturar qualquer erro não tratado na IIFE async
  console.error('[STARTUP] ❌ Erro não tratado na inicialização:', error.message);
  console.error('[STARTUP] Stack:', error.stack);
  console.warn('[STARTUP] Tentando iniciar servidor mesmo assim...');
  try {
    startServer();
  } catch (startError) {
    console.error('[STARTUP] ❌ Erro fatal ao iniciar servidor:', startError.message);
    // Não fazer process.exit - deixar o nodemon gerenciar o restart
  }
}).then(() => {
  // Garantir que o servidor foi iniciado mesmo se a API Python falhar
  if (!server) {
    console.warn('[STARTUP] ⚠️ Servidor não foi iniciado, tentando iniciar agora...');
    try {
      startServer();
    } catch (startError) {
      console.error('[STARTUP] ❌ Erro ao iniciar servidor:', startError.message);
    }
  }
  });

  // Garantir que o processo não termine silenciosamente
  process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
    console.error('❌ Stack:', error.stack);
    
    // Tentar parar a API Python se estiver rodando
    if (imageProxyStarter) {
      try {
        imageProxyStarter.stopImageProxy();
      } catch (stopError) {
        console.error('Erro ao parar API Python:', stopError.message);
      }
    }
    
    // Apenas encerrar se for um erro crítico que realmente impede o funcionamento
    // Para erros menores, apenas logar e continuar
    if (error.message && (
      error.message.includes('EADDRINUSE') ||
      error.message.includes('port') ||
      error.message.includes('listen')
    )) {
      console.error('❌ Erro crítico de porta, encerrando...');
    process.exit(1);
    } else {
      console.warn('⚠️ Erro não crítico, continuando execução...');
      // Não encerrar o processo - deixar o nodemon gerenciar
    }
  });

// Parar API Python ao encerrar o servidor
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Encerrando servidor...');
    if (imageProxyStarter) {
      imageProxyStarter.stopImageProxy();
    }
    if (server) {
      server.close(() => {
        console.log('[SHUTDOWN] Servidor encerrado');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] Recebido SIGTERM, encerrando servidor...');
    if (imageProxyStarter) {
      imageProxyStarter.stopImageProxy();
    }
    if (server) {
      server.close(() => {
        console.log('[SHUTDOWN] Servidor encerrado');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
    if (reason && reason.stack) {
      console.error('❌ Stack:', reason.stack);
    }
    // Não encerrar o processo imediatamente - apenas logar o erro
    // O servidor pode continuar funcionando mesmo com algumas promises rejeitadas
    console.warn('⚠️ Continuando execução apesar da promise rejeitada...');
    
    // Se for um erro de conexão (ECONNREFUSED, ETIMEDOUT, etc), apenas logar
    if (reason && reason.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(reason.code)) {
      console.warn('⚠️ Erro de conexão detectado (não crítico):', reason.code);
      return; // Não fazer nada, apenas logar
    }
    
    // Se for um erro de rede, apenas logar
    if (reason && reason.message && (
      reason.message.includes('Network Error') ||
      reason.message.includes('ECONNREFUSED') ||
      reason.message.includes('ETIMEDOUT') ||
      reason.message.includes('socket hang up')
    )) {
      console.warn('⚠️ Erro de rede detectado (não crítico):', reason.message);
      return; // Não fazer nada, apenas logar
    }
  });

  console.log('[STARTUP] Servidor configurado com sucesso');

module.exports = app;