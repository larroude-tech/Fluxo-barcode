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

const QRCodeFinder = require('./qr-code-finder');
console.log('[INIT] qr-code-finder carregado');

const upload = {
  single: () => (req, res, next) => next()
};

const registerPostgresLabelsRoutes = require('./routes/postgres-labels');
console.log('[INIT] routes/postgres-labels carregado');

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
} catch (error) {
  console.error('[DB] Erro ao criar pool PostgreSQL:', error);
  console.log('[DB] Continuando sem pool (aplicação pode funcionar sem DB)');
  pool = null;
}

const app = express();
const PORT = process.env.PORT || 3005;

console.log(`[INIT] Inicializando servidor na porta ${PORT}`);
console.log(`[INIT] NODE_ENV=${process.env.NODE_ENV || 'not set'}`);

registerPostgresLabelsRoutes(app, pool);

// Instanciar finder de QR codes
const qrCodeFinder = new QRCodeFinder();

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
    // Remover qualquer informação de caminho de usuário ou sistema
    if (url.includes('C:\\') || url.includes('Users\\') || url.includes('Downloads')) {
      console.warn(`[AVISO] URL contém caminho de sistema, removendo: ${url}`);
      // Se for caminho de arquivo local, não processar
      return url;
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
 * Converte imagem do QR code (URL ou caminho local) para formato ZPL ^GF
 * @param {string} imageUrl - URL ou caminho local da imagem
 * @param {number} width - Largura desejada em dots (padrão: 80 = 1.0cm em 203 DPI)
 * @param {number} height - Altura desejada em dots (padrão: 80 = 1.0cm em 203 DPI)
 * @returns {Promise<string>} - Comando ZPL ^GF com dados da imagem
 */
async function convertImageToZPL(imageUrl, width = 80, height = 80) {
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
                                  imageUrl.includes('/images/') || imageUrl.includes('/image/');
      
      // Se não parece ser uma imagem, gerar QR code diretamente
      if (!hasImageExtension && !isKnownImageService) {
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
      // Ler imagem de caminho local
      console.log(`[FILE] Lendo imagem de caminho local: ${imageUrl}`);
      if (!fs.existsSync(imageUrl)) {
        throw new Error(`Arquivo não encontrado: ${imageUrl}`);
      }
      imageBuffer = fs.readFileSync(imageUrl);
    }
    
    // Converter para bitmap 1-bit (monocromático) e redimensionar usando sharp
    // FORÇAR tamanho exato: 1.0 cm x 1.0 cm = 80 x 80 dots (203 DPI)
    // IMPORTANTE: O bitmap será renderizado pixel por pixel na impressora
    // 80 pixels = 80 dots = 1.0 cm (em 203 DPI)
    let processedImage = sharp(imageBuffer);
    
    // Primeiro, garantir que a imagem seja quadrada e redimensionada EXATAMENTE para width x height
    // Usar 'fill' para forçar tamanho exato, sem preservar aspect ratio
    processedImage = processedImage
      .resize(width, height, { 
        fit: 'fill', // CRÍTICO: Forçar tamanho exato (não preservar aspect ratio)
        background: { r: 255, g: 255, b: 255 }, // Fundo branco
        kernel: 'lanczos3', // Melhor qualidade no redimensionamento
        withoutEnlargement: false, // Permitir aumentar se necessário
        fastShrinkOnLoad: false // Garantir redimensionamento preciso
      })
      .greyscale()
      .threshold(128); // Binarizar (preto e branco)
    
    // Converter para raw data
    const { data, info } = await processedImage
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // DEBUG: Verificar dimensões após processamento
    console.log(`   [DEBUG] Dimensões após Sharp resize: ${info.width}x${info.height}`);
    console.log(`   [OK] Dimensões esperadas: ${width}x${height}`);
    
    // Garantir que as dimensões sejam exatamente as especificadas
    if (info.width !== width || info.height !== height) {
      console.error(`[ERRO] ERRO CRÍTICO: Sharp não redimensionou corretamente!`);
      console.error(`   Obtido: ${info.width}x${info.height}`);
      console.error(`   Esperado: ${width}x${height}`);
      throw new Error(`Falha ao redimensionar imagem para ${width}x${height} dots`);
    }
    
    console.log(`   [OK] Dimensões corretas confirmadas!`);
    
    // Converter para formato hexadecimal do ZPL ^GF
    // ^GF formato: ^GFa,b,c,d,data^FS
    // a = compression type (A=ASCII hex)
    // b = binary byte count
    // c = graphic field count (total bytes)
    // d = bytes per row
    const actualWidth = info.width;
    const actualHeight = info.height;
    const bytesPerRow = Math.ceil(actualWidth / 8);
    const totalBytes = bytesPerRow * actualHeight;
    
    // Converter pixels para bits (1 = preto, 0 = branco)
    // CRÍTICO: Cada pixel do bitmap = 1 dot na impressora
    // 80 pixels = 80 dots = 1.0 cm (em 203 DPI)
    let bitmapHex = '';
    let totalPixels = 0;
    let blackPixels = 0;
    
    for (let row = 0; row < actualHeight; row++) {
      for (let colByte = 0; colByte < bytesPerRow; colByte++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = colByte * 8 + bit;
          if (pixelX < actualWidth) {
            // Dados raw greyscale tem 1 canal por pixel após processamento
            const pixelIndex = row * actualWidth + pixelX;
            if (pixelIndex < data.length) {
              totalPixels++;
              const pixelValue = data[pixelIndex];
              // Se pixel é escuro (menor que 128 devido ao threshold), bit = 1
              if (pixelValue < 128) {
                byte |= (1 << (7 - bit));
                blackPixels++;
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
    
    // Verificar se as dimensões estão corretas
    const expectedCm = (width / 203 * 2.54).toFixed(2);
    const actualCm = (actualWidth / 203 * 2.54).toFixed(2);
    const actualCmHeight = (actualHeight / 203 * 2.54).toFixed(2);
    
    if (actualWidth !== width || actualHeight !== height) {
      console.error(`[ERRO] ERRO: Dimensões não correspondem: esperado ${width}x${height} dots (${expectedCm}cm), obtido ${actualWidth}x${actualHeight} dots (${actualCm}cm x ${actualCmHeight}cm)`);
      throw new Error(`Falha ao redimensionar: obtido ${actualWidth}x${actualHeight} ao invés de ${width}x${height}`);
    } else {
      console.log(`[OK] Imagem convertida para ZPL: ${actualWidth}x${actualHeight} dots = ${actualCm}cm x ${actualCmHeight}cm`);
      console.log(`   [SIZE] TAMANHO FIXO: 1.0 cm x 1.0 cm (80 dots = 1.0 cm em 203 DPI)`);
      console.log(`   [SIZE] Bytes por linha: ${bytesPerRow}, Total de bytes: ${totalBytes}`);
      console.log(`   [DEBUG] Hex data length: ${bitmapHex.length} chars (esperado: ${totalBytes * 2})`);
      console.log(`   🎨 Pixels processados: ${totalPixels} (${blackPixels} pretos, ${totalPixels - blackPixels} brancos)`);
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

// Middleware
app.use(cors());
const maxUploadSize = process.env.MAX_UPLOAD_SIZE || '50mb';
app.use(express.json({ limit: maxUploadSize }));
app.use(express.urlencoded({ limit: maxUploadSize, extended: true }));
app.use(express.static('public'));

// Rotas
app.get('/', (req, res) => {
  res.json({ message: 'Servidor Larroudé RFID funcionando!' });
});

// Health check endpoint para Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Configurar caminho base para busca de QR codes
app.post('/api/qr-codes/set-path', (req, res) => {
  try {
    const { basePath } = req.body;
    
    if (!basePath) {
      return res.status(400).json({ error: 'Caminho base é obrigatório' });
    }

    const success = qrCodeFinder.setBasePath(basePath);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Caminho base configurado com sucesso',
        basePath: qrCodeFinder.basePath
      });
    } else {
      res.status(400).json({ 
        error: 'Caminho não encontrado ou inválido',
        providedPath: basePath
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter caminho base atual
app.get('/api/qr-codes/get-path', (req, res) => {
  res.json({ 
    basePath: qrCodeFinder.basePath,
    exists: fs.existsSync(qrCodeFinder.basePath)
  });
});

// Testar busca de QR code
app.post('/api/qr-codes/test', async (req, res) => {
  try {
    const { poNumber, styleName } = req.body;
    
    if (!poNumber || !styleName) {
      return res.status(400).json({ error: 'PO e Style Name são obrigatórios' });
    }

    const result = qrCodeFinder.findQRCode(poNumber, styleName);
    
    if (result) {
      res.json({ 
        success: true, 
        found: true,
        result: {
          poNumber: result.poNumber,
          styleName: result.styleName,
          fileName: result.fileName,
          filePath: result.filePath,
          qrCodePreview: result.qrCode.substring(0, 50) + '...' // Primeiros 50 chars
        }
      });
    } else {
      res.json({ 
        success: false, 
        found: false,
        message: 'QR code não encontrado na estrutura de pastas',
        basePath: qrCodeFinder.basePath
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
          const color = String(item.COLOR || 'N/A');
          const size = String(item.SIZE || 'N/A');
          
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
          
          // LOCAL vem do CSV (já extraído no upload)
          const localNumber = ''; // LOCAL ignorado
        
        // Carregar template oficial da Larroud
        const fs = require('fs');
        const path = require('path');
        const templatePath = path.join(__dirname, process.env.TEMPLATE_PATH || '../templates/TEMPLATE_LARROUD_OFICIAL.zpl');
        let larroudTemplate;
        
        try {
          larroudTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (error) {
          console.error('Erro ao carregar template:', error);
          throw new Error('Template oficial não encontrado');
        }

          // Validar dados RFID (enviar como string direta, igual ZebraDesigner)
          RFIDUtils.validateRFIDData(rfidContent);
          
          console.log(`[RFID] RFID formato ZebraDesigner (string direta): ${rfidContent}`);
          
          // Carregar layout customizado (se existir)
          let layout = null;
          try {
            const layoutPath = path.join(__dirname, process.env.LAYOUT_PATH || 'label-layout.json');
            if (fs.existsSync(layoutPath)) {
              const layoutData = fs.readFileSync(layoutPath, 'utf8');
              layout = JSON.parse(layoutData);
              console.log('[OK] Layout customizado carregado para impressão individual');
            }
          } catch (layoutError) {
            console.warn('Erro ao carregar layout customizado, usando padrão:', layoutError.message);
          }
          
          // Aplicar layout customizado ao template se disponível
          let workingTemplate = larroudTemplate;
          if (layout) {
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
            
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,16,15/g, (match) => {
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.poInfo?.x && y === layout.poInfo?.y) {
                return `FT${x},${y}^A0N,${layout.poInfo.fontSize || 16},${layout.poInfo.fontSize || 16}`;
              } else if (x === layout.localInfo?.x && y === layout.localInfo?.y) {
                return `FT${x},${y}^A0N,${layout.localInfo.fontSize || 16},${layout.localInfo.fontSize || 16}`;
              }
              return match;
            });
            
            // Ajustar retângulos/bordas
            workingTemplate = workingTemplate.replace(/FO31,80\^GB640,280,3/g, 
              `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
            workingTemplate = workingTemplate.replace(/FO177,81\^GB0,275,3/g,
              `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
          }
          
          // Verificar se há IMAGE_URL do CSV (imagem do QR code)
          console.log(`\n========== VERIFICANDO IMAGE_URL ==========`);
          console.log(`[DEBUG] Item completo:`, JSON.stringify(item, null, 2));
          console.log(`[DEBUG] Chaves do item:`, Object.keys(item));
          console.log(`[DEBUG] item.IMAGE_URL:`, item.IMAGE_URL);
          console.log(`[DEBUG] item['IMAGE_URL']:`, item['IMAGE_URL']);
          
          const imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || '';
          let qrImageZPL = null;
          let useImageForQR = false;
          
          console.log(`[DEBUG] IMAGE_URL extraído: "${imageUrl}"`);
          console.log(`[DEBUG] Tipo: ${typeof imageUrl}, Vazio: ${!imageUrl || imageUrl.trim() === ''}`);
          
          if (imageUrl && imageUrl.trim() !== '') {
            try {
              console.log(`[IMAGE] Usando IMAGE_URL do CSV: ${imageUrl}`);
              // Converter imagem para ZPL (tamanho fixo para QR code: 80x80 dots = 1.0 cm)
              // Tamanho fixo: 1.0 cm x 1.0 cm = 80 x 80 dots (203 DPI)
              // 1.0 cm = 0.3937 polegadas * 203 DPI ≈ 80 dots
              const qrWidth = 80;  // 1.0 cm fixo
              const qrHeight = 80; // 1.0 cm fixo
              qrImageZPL = await convertImageToZPL(imageUrl, qrWidth, qrHeight);
              useImageForQR = true;
              console.log(`[OK] Imagem do QR code convertida para ZPL`);
              console.log(`   [SIZE] Tamanho aplicado: ${qrWidth}x${qrHeight} dots = ${(qrWidth/203*2.54).toFixed(2)}cm x ${(qrHeight/203*2.54).toFixed(2)}cm`);
              console.log(`   [DEBUG] Comando ZPL gerado (primeiros 100 chars): ${qrImageZPL ? qrImageZPL.substring(0, 100) : 'null'}`);
            } catch (imageError) {
              console.error(`[ERRO] Erro ao converter imagem do IMAGE_URL: ${imageError.message}`);
              console.error(`   Stack: ${imageError.stack}`);
              console.warn(`[AVISO] Usando QR code gerado padrão devido ao erro`);
              useImageForQR = false;
            }
          } else {
            console.log(`[INFO] IMAGE_URL vazio ou não fornecido, usando QR code gerado`);
          }
          console.log(`==========================================\n`);
          
          // Buscar QR codes externos (se disponíveis e não houver IMAGE_URL)
          let qrData1 = vpn; // Padrão: usar VPN
          let qrData2 = vpn;
          let qrData3 = vpn;
          
          if (!useImageForQR) {
          try {
            const qrCodeResult = qrCodeFinder.findQRCode(poNumber, styleName);
            if (qrCodeResult && qrCodeResult.qrCode) {
              // Se encontrou QR code externo, usar para todos os 3 QR codes
              qrData1 = qrCodeResult.qrCode;
              qrData2 = qrCodeResult.qrCode;
              qrData3 = qrCodeResult.qrCode;
                console.log(`[OK] QR Code externo encontrado e será usado: ${qrCodeResult.fileName}`);
            } else {
                console.log(`[INFO] QR Code externo não encontrado, usando VPN: ${vpn}`);
            }
          } catch (qrError) {
              console.warn(`[AVISO] Erro ao buscar QR code externo, usando VPN:`, qrError.message);
            }
          }

          // Se usar imagem do IMAGE_URL, substituir os comandos ^BQN ANTES de substituir variáveis
          if (useImageForQR && qrImageZPL) {
            // Obter coordenadas dos QR codes do layout ou usar padrão do template
            const qrLeftX = layout?.qrLeft?.x || 77;
            const qrLeftY = layout?.qrLeft?.y || 355;
            const qrTopX = layout?.qrTop?.x || 737;
            const qrTopY = layout?.qrTop?.y || 167;
            const qrBottomX = layout?.qrBottom?.x || 739;
            const qrBottomY = layout?.qrBottom?.y || 355;
            
            console.log(`[IMAGE] Substituindo QR codes por imagem nas coordenadas: Left(${qrLeftX},${qrLeftY}), Top(${qrTopX},${qrTopY}), Bottom(${qrBottomX},${qrBottomY})`);
            
            // Substituir cada QR code (^BQN) pela imagem (^GF) no template ANTES de substituir variáveis
            // IMPORTANTE: ^GF (Graphic Field) precisa de ^FO (Field Origin), não ^FT (Field Text)
            // O template tem formato em múltiplas linhas:
            // ^FTx,y^BQN,2,3
            // ^FH\^FDLA,{QR_DATA}^FS
            
            // QR esquerdo (FT77,355) - substituir com variável {QR_DATA_3}
            // Padrão robusto: captura desde ^FT até ^FS incluindo qualquer coisa no meio
            const patternLeft = new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_3\\}\\^FS`, 'g');
            if (workingTemplate.match(patternLeft)) {
              workingTemplate = workingTemplate.replace(patternLeft, `^FO${qrLeftX},${qrLeftY}${qrImageZPL}`);
              console.log(`[OK] QR Left substituído (impressão)`);
            }
            
            // QR superior (FT737,167) - substituir com variável {QR_DATA_1}
            const patternTop = new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_1\\}\\^FS`, 'g');
            if (workingTemplate.match(patternTop)) {
              workingTemplate = workingTemplate.replace(patternTop, `^FO${qrTopX},${qrTopY}${qrImageZPL}`);
              console.log(`[OK] QR Top substituído (impressão)`);
            }
            
            // QR inferior (FT739,355) - substituir com variável {QR_DATA_2}
            const patternBottom = new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_2\\}\\^FS`, 'g');
            if (workingTemplate.match(patternBottom)) {
              workingTemplate = workingTemplate.replace(patternBottom, `^FO${qrBottomX},${qrBottomY}${qrImageZPL}`);
              console.log(`[OK] QR Bottom substituído (impressão)`);
            }
            
            // Limpeza final: remover qualquer ^BQN restante nas coordenadas (caso algum padrão não tenha sido capturado)
            const cleanupLeft = new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN[^\\^]*`, 'g');
            const cleanupTop = new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN[^\\^]*`, 'g');
            const cleanupBottom = new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN[^\\^]*`, 'g');
            
            workingTemplate = workingTemplate.replace(cleanupLeft, '');
            workingTemplate = workingTemplate.replace(cleanupTop, '');
            workingTemplate = workingTemplate.replace(cleanupBottom, '');
            
            const remainingBQN = (workingTemplate.match(/\^BQN/g) || []).length;
            console.log(`[OK] QR codes substituídos pela imagem do IMAGE_URL no template`);
            console.log(`[DEBUG] Comandos ^BQN restantes após substituição: ${remainingBQN}`);
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
            .replace(/{RFID_DATA_HEX}/g, rfidContent) // Enviar dados RFID como string direta (igual ZebraDesigner)
            .replace(/{RFID_DATA}/g, rfidContent)
            .replace(/{RFID_STATUS}/g, 'OK');

          // Log completo do ZPL para debug
          console.log('\n============ ZPL FINAL GERADO ============');
          console.log(workingZPL);
          console.log('=========================================\n');

          // Imprimir cada etiqueta individual (1 cópia por vez para manter sequência)
          const printResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
          
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
          
        } catch (error) {
          console.error(`[ERRO] Erro ao processar ${item.STYLE_NAME} ${seq}/${itemQty}:`, error);
          results.push({
            item: `${item.STYLE_NAME || 'Desconhecido'} (${seq}/${itemQty})`,
            success: false,
            message: error.message
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
    
    // Carregar template oficial da Larroud
    const templatePath = path.join(__dirname, '../templates/TEMPLATE_LARROUD_OFICIAL.zpl');
    let larroudTemplate;
    try {
      larroudTemplate = fs.readFileSync(templatePath, 'utf8');
    } catch (fileError) {
      console.error('Erro ao carregar template:', fileError.message);
      return res.status(500).json({ error: 'Template ZPL não encontrado' });
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
          const color = String(item.COLOR || 'N/A');
          const size = String(item.SIZE || 'N/A');
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
          
          // Carregar layout customizado (se existir)
          let layout = null;
          try {
            const layoutPath = path.join(__dirname, process.env.LAYOUT_PATH || 'label-layout.json');
            if (fs.existsSync(layoutPath)) {
              const layoutData = fs.readFileSync(layoutPath, 'utf8');
              layout = JSON.parse(layoutData);
            }
          } catch (layoutError) {
            console.warn('Erro ao carregar layout customizado, usando padrão:', layoutError.message);
          }

          // Aplicar layout customizado ao template se disponível
          let workingTemplate = larroudTemplate;
          if (layout) {
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
            
            workingTemplate = workingTemplate.replace(/FT\d+,\d+\^A0N,16,15/g, (match) => {
              const coords = match.match(/FT(\d+),(\d+)/);
              const x = parseInt(coords[1]);
              const y = parseInt(coords[2]);
              
              if (x === layout.poInfo?.x && y === layout.poInfo?.y) {
                return `FT${x},${y}^A0N,${layout.poInfo.fontSize || 16},${layout.poInfo.fontSize || 16}`;
              } else if (x === layout.localInfo?.x && y === layout.localInfo?.y) {
                return `FT${x},${y}^A0N,${layout.localInfo.fontSize || 16},${layout.localInfo.fontSize || 16}`;
              }
              return match;
            });
            
            // Ajustar retângulos/bordas
            // Retângulo principal: ^FO31,80^GB640,280,3^FS
            workingTemplate = workingTemplate.replace(/FO31,80\^GB640,280,3/g, 
              `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
            
            // Linha divisória: ^FO177,81^GB0,275,3^FS
            workingTemplate = workingTemplate.replace(/FO177,81\^GB0,275,3/g,
              `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
          }
          
          // Verificar se há IMAGE_URL do CSV (imagem do QR code)
          console.log(`\n========== VERIFICANDO IMAGE_URL ==========`);
          console.log(`[DEBUG] Item completo:`, JSON.stringify(item, null, 2));
          console.log(`[DEBUG] Chaves do item:`, Object.keys(item));
          console.log(`[DEBUG] item.IMAGE_URL:`, item.IMAGE_URL);
          console.log(`[DEBUG] item['IMAGE_URL']:`, item['IMAGE_URL']);
          
          const imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || '';
          let qrImageZPL = null;
          let useImageForQR = false;
          
          console.log(`[DEBUG] IMAGE_URL extraído: "${imageUrl}"`);
          console.log(`[DEBUG] Tipo: ${typeof imageUrl}, Vazio: ${!imageUrl || imageUrl.trim() === ''}`);
          
          if (imageUrl && imageUrl.trim() !== '') {
            try {
              console.log(`[IMAGE] Usando IMAGE_URL do CSV: ${imageUrl}`);
              // Converter imagem para ZPL (tamanho fixo para QR code: 80x80 dots = 1.0 cm)
              // Tamanho fixo: 1.0 cm x 1.0 cm = 80 x 80 dots (203 DPI)
              // 1.0 cm = 0.3937 polegadas * 203 DPI ≈ 80 dots
              const qrWidth = 80;  // 1.0 cm fixo
              const qrHeight = 80; // 1.0 cm fixo
              qrImageZPL = await convertImageToZPL(imageUrl, qrWidth, qrHeight);
              useImageForQR = true;
              console.log(`[OK] Imagem do QR code convertida para ZPL`);
              console.log(`   [SIZE] Tamanho aplicado: ${qrWidth}x${qrHeight} dots = ${(qrWidth/203*2.54).toFixed(2)}cm x ${(qrHeight/203*2.54).toFixed(2)}cm`);
              console.log(`   [DEBUG] Comando ZPL gerado (primeiros 100 chars): ${qrImageZPL ? qrImageZPL.substring(0, 100) : 'null'}`);
            } catch (imageError) {
              console.error(`[ERRO] Erro ao converter imagem do IMAGE_URL: ${imageError.message}`);
              console.error(`   Stack: ${imageError.stack}`);
              console.warn(`[AVISO] Usando QR code gerado padrão devido ao erro`);
              useImageForQR = false;
            }
          } else {
            console.log(`[INFO] IMAGE_URL vazio ou não fornecido, usando QR code gerado`);
          }
          console.log(`==========================================\n`);
          
          // Buscar QR codes externos (se disponíveis e não houver IMAGE_URL)
          let qrData1 = vpn; // Padrão: usar VPN
          let qrData2 = vpn;
          let qrData3 = vpn;
          
          if (!useImageForQR) {
          try {
            const qrCodeResult = qrCodeFinder.findQRCode(poNumber, styleName);
            if (qrCodeResult && qrCodeResult.qrCode) {
              // Se encontrou QR code externo, usar para todos os 3 QR codes
              qrData1 = qrCodeResult.qrCode;
              qrData2 = qrCodeResult.qrCode;
              qrData3 = qrCodeResult.qrCode;
                console.log(`[OK] QR Code externo encontrado e será usado: ${qrCodeResult.fileName}`);
            } else {
                console.log(`[INFO] QR Code externo não encontrado, usando VPN: ${vpn}`);
            }
          } catch (qrError) {
              console.warn(`[AVISO] Erro ao buscar QR code externo, usando VPN:`, qrError.message);
            }
          }

          // Se usar imagem do IMAGE_URL, substituir os comandos ^BQN ANTES de substituir variáveis
          if (useImageForQR && qrImageZPL) {
            // Obter coordenadas dos QR codes do layout ou usar padrão do template
            const qrLeftX = layout?.qrLeft?.x || 77;
            const qrLeftY = layout?.qrLeft?.y || 355;
            const qrTopX = layout?.qrTop?.x || 737;
            const qrTopY = layout?.qrTop?.y || 167;
            const qrBottomX = layout?.qrBottom?.x || 739;
            const qrBottomY = layout?.qrBottom?.y || 355;
            
            console.log(`[IMAGE] Substituindo QR codes por imagem nas coordenadas: Left(${qrLeftX},${qrLeftY}), Top(${qrTopX},${qrTopY}), Bottom(${qrBottomX},${qrBottomY})`);
            
            // Substituir cada QR code (^BQN) pela imagem (^GF) no template ANTES de substituir variáveis
            // QR esquerdo (FT77,355) - substituir com variável {QR_DATA_3}
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN,2,[0-9]+\\s*\\n\\s*\\^FH\\\\\\^FDLA,\\{QR_DATA_3\\}\\^FS`, 'g'),
              `^FT${qrLeftX},${qrLeftY}${qrImageZPL}`
            );
            
            // QR superior (FT737,167) - substituir com variável {QR_DATA_1}
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN,2,[0-9]+\\s*\\n\\s*\\^FH\\\\\\^FDLA,\\{QR_DATA_1\\}\\^FS`, 'g'),
              `^FT${qrTopX},${qrTopY}${qrImageZPL}`
            );
            
            // QR inferior (FT739,355) - substituir com variável {QR_DATA_2}
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN,2,[0-9]+\\s*\\n\\s*\\^FH\\\\\\^FDLA,\\{QR_DATA_2\\}\\^FS`, 'g'),
              `^FT${qrBottomX},${qrBottomY}${qrImageZPL}`
            );
            
            // Também tentar padrões alternativos (sem quebra de linha)
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN,2,[0-9]+\\^FH\\\\\\^FDLA,\\{QR_DATA_3\\}\\^FS`, 'g'),
              `^FT${qrLeftX},${qrLeftY}${qrImageZPL}`
            );
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN,2,[0-9]+\\^FH\\\\\\^FDLA,\\{QR_DATA_1\\}\\^FS`, 'g'),
              `^FT${qrTopX},${qrTopY}${qrImageZPL}`
            );
            workingTemplate = workingTemplate.replace(
              new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN,2,[0-9]+\\^FH\\\\\\^FDLA,\\{QR_DATA_2\\}\\^FS`, 'g'),
              `^FT${qrBottomX},${qrBottomY}${qrImageZPL}`
            );
            
            console.log(`[OK] QR codes substituídos pela imagem do IMAGE_URL no template`);
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
            .replace(/{RFID_DATA_HEX}/g, rfidContent)
            .replace(/{RFID_DATA}/g, rfidContent)
            .replace(/{RFID_STATUS}/g, 'OK');

          // Log completo do ZPL para debug
          console.log('\n============ ZPL FINAL GERADO (PRINT-ALL) ============');
          console.log(workingZPL);
          console.log('=========================================\n');

          // Imprimir cada etiqueta individual (1 cópia por vez para manter sequência)
          const printResult = await pythonUSBIntegration.sendZPL(workingZPL, 'ascii', 1);
          
          results.push({
            item: `${styleName} (${seq}/${itemQty})`,
            barcode: sequentialBarcode,
            rfid: rfidContent,
            success: printResult.success,
            message: printResult.success ? `Etiqueta ${seq} impressa com sucesso` : printResult.error,
            details: printResult.result
          });
          
          console.log(`[OK] Etiqueta ${styleName} ${seq}/${itemQty} processada:`, printResult.success ? 'OK' : printResult.error);
          
          // Aguardar um pouco entre impressões para não sobrecarregar a impressora
          // (exceto na última etiqueta)
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo entre impressões
          
        } catch (error) {
          console.error(`[ERRO] Erro ao processar ${item.STYLE_NAME} ${seq}/${itemQty}:`, error);
          results.push({
            item: `${item.STYLE_NAME || 'Desconhecido'} (${seq}/${itemQty})`,
            success: false,
            message: error.message
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

// Endpoint para salvar layout da etiqueta
app.post('/api/layout/save', (req, res) => {
  try {
    const { layout } = req.body;
    
    if (!layout) {
      return res.status(400).json({ error: 'Layout não fornecido' });
    }

    // Salvar layout em arquivo JSON
    const fs = require('fs');
    const path = require('path');
    const layoutPath = path.join(__dirname, process.env.LAYOUT_PATH || 'label-layout.json');
    
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Layout salvo com sucesso',
      layout: layout
    });
  } catch (error) {
    console.error('Erro ao salvar layout:', error);
    res.status(500).json({ error: 'Erro ao salvar layout' });
  }
});

// Endpoint para carregar layout da etiqueta
app.get('/api/layout/load', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const layoutPath = path.join(__dirname, process.env.LAYOUT_PATH || 'label-layout.json');
    
    let layout;
    if (fs.existsSync(layoutPath)) {
      const layoutData = fs.readFileSync(layoutPath, 'utf8');
      layout = JSON.parse(layoutData);
    } else {
      // Layout padrão baseado no TEMPLATE_LARROUD_OFICIAL.zpl
      layout = {
        labelStyleName: { x: 187, y: 147, fontSize: 20 },
        labelVpn: { x: 188, y: 176, fontSize: 20 },
        labelColor: { x: 187, y: 204, fontSize: 20 },
        labelSize: { x: 187, y: 234, fontSize: 20 },
        styleName: { x: 353, y: 147, fontSize: 23 },
        vpn: { x: 353, y: 175, fontSize: 23 },
        color: { x: 353, y: 204, fontSize: 23 },
        size: { x: 353, y: 232, fontSize: 23 },
        barcode: { x: 222, y: 308, height: 39 },
        qrLeft: { x: 77, y: 355, size: 3 },
        qrTop: { x: 737, y: 167, size: 3 },
        qrBottom: { x: 739, y: 355, size: 3 },
        poInfo: { x: 701, y: 220, fontSize: 16 },
        localInfo: { x: 680, y: 238, fontSize: 16 },
        mainBox: { x: 31, y: 80, width: 640, height: 280 },
        dividerLine: { x: 177, y: 81, height: 275 }
      };
    }
    
    res.json({
      success: true,
      layout: layout
    });
  } catch (error) {
    console.error('Erro ao carregar layout:', error);
    res.status(500).json({ error: 'Erro ao carregar layout' });
  }
});

// Endpoint para salvar template nomeado
app.post('/api/layout/save-template', (req, res) => {
  try {
    const { name, layout } = req.body;
    
    if (!name || !layout) {
      return res.status(400).json({ error: 'Nome e layout são obrigatórios' });
    }

    const fs = require('fs');
    const path = require('path');
    const templatesDir = path.join(__dirname, 'layouts');
    
    // Criar diretório de templates se não existir
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    const templatePath = path.join(templatesDir, `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`);
    
    const templateData = {
      name: name,
      layout: layout,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2), 'utf8');
    
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
    const color = String(item.COLOR || "N/A");
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
^LL376
^FO50,50^A0N,30,30^FD${styleName}^FS
^FO50,100^A0N,20,20^FDVPN: ${vpn}^FS
^FO50,130^A0N,20,20^FDCOLOR: ${color}^FS
^FO50,160^A0N,20,20^FDSIZE: ${size}^FS
^XZ`;
      console.warn("Usando template básico para preview");
    }

    // Carregar layout customizado (se existir) para preview também
    let layout = null;
    try {
      const layoutPath = path.join(__dirname, process.env.LAYOUT_PATH || 'label-layout.json');
      if (fs.existsSync(layoutPath)) {
        const layoutData = fs.readFileSync(layoutPath, 'utf8');
        layout = JSON.parse(layoutData);
      }
    } catch (layoutError) {
      console.warn('Erro ao carregar layout customizado para preview, usando padrão');
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
      
      baseTemplate = baseTemplate.replace(/FT\d+,\d+\^A0N,16,15/g, (match) => {
        const coords = match.match(/FT(\d+),(\d+)/);
        const x = parseInt(coords[1]);
        const y = parseInt(coords[2]);
        
        if (x === layout.poInfo?.x && y === layout.poInfo?.y) {
          return `FT${x},${y}^A0N,${layout.poInfo.fontSize || 16},${layout.poInfo.fontSize || 16}`;
        } else if (x === layout.localInfo?.x && y === layout.localInfo?.y) {
          return `FT${x},${y}^A0N,${layout.localInfo.fontSize || 16},${layout.localInfo.fontSize || 16}`;
        }
        return match;
      });
      
      // Ajustar retângulos/bordas no preview também
      // Retângulo principal: ^FO31,80^GB640,280,3^FS
      baseTemplate = baseTemplate.replace(/FO31,80\^GB640,280,3/g, 
        `FO${layout.mainBox?.x || 31},${layout.mainBox?.y || 80}^GB${layout.mainBox?.width || 640},${layout.mainBox?.height || 280},3`);
      
      // Linha divisória: ^FO177,81^GB0,275,3^FS
      baseTemplate = baseTemplate.replace(/FO177,81\^GB0,275,3/g,
        `FO${layout.dividerLine?.x || 177},${layout.dividerLine?.y || 81}^GB0,${layout.dividerLine?.height || 275},3`);
    }
    
    // Usar PO e LOCAL do item (do CSV), não valores hardcoded
    const previewPoNumber2 = item.PO || '0000';
    const previewLocalNumber2 = ''; // LOCAL ignorado
    const poFormatted = `PO${previewPoNumber2}`;
    
    // Verificar se há IMAGE_URL do CSV (imagem do QR code) para usar no preview também
    const imageUrl = item.IMAGE_URL || item['IMAGE_URL'] || '';
    let qrImageZPL = null;
    let useImageForQR = false;
    
    if (imageUrl && imageUrl.trim() !== '') {
      try {
        console.log(`[IMAGE] [PREVIEW] Usando IMAGE_URL do CSV: ${imageUrl}`);
        // Tamanho fixo: 1.0 cm x 1.0 cm = 80 x 80 dots (203 DPI)
        // Mesmo tamanho para preview e impressão física
        const qrWidth = 80;  // 1.0 cm fixo
        const qrHeight = 80; // 1.0 cm fixo
        qrImageZPL = await convertImageToZPL(imageUrl, qrWidth, qrHeight);
        useImageForQR = true;
        console.log(`[OK] [PREVIEW] Imagem do QR code convertida para ZPL`);
        console.log(`   [SIZE] [PREVIEW] Tamanho fixo: ${qrWidth}x${qrHeight} dots = ${(qrWidth/203*2.54).toFixed(2)}cm x ${(qrHeight/203*2.54).toFixed(2)}cm`);
        console.log(`   [INFO] [PREVIEW] QR code com tamanho fixo de 1.0 cm (80x80 dots) tanto no preview quanto na impressão`);
        console.log(`   [DEBUG] [PREVIEW] Comando ZPL gerado (primeiros 100 chars): ${qrImageZPL ? qrImageZPL.substring(0, 100) : 'null'}`);
      } catch (imageError) {
        console.warn(`[AVISO] [PREVIEW] Erro ao converter imagem do IMAGE_URL, usando QR code gerado: ${imageError.message}`);
        useImageForQR = false;
      }
    }
    
    // Buscar QR codes externos (se disponíveis e não houver IMAGE_URL)
    let qrData1 = vpn; // Padrão: usar VPN
    let qrData2 = vpn;
    let qrData3 = vpn;
    
    if (!useImageForQR) {
      try {
        const qrCodeResult = qrCodeFinder.findQRCode(previewPoNumber2, styleName);
        if (qrCodeResult && qrCodeResult.qrCode) {
          qrData1 = qrCodeResult.qrCode;
          qrData2 = qrCodeResult.qrCode;
          qrData3 = qrCodeResult.qrCode;
          console.log(`[OK] [PREVIEW] QR Code externo encontrado: ${qrCodeResult.fileName}`);
        }
      } catch (qrError) {
        console.warn(`[AVISO] [PREVIEW] Erro ao buscar QR code externo:`, qrError.message);
      }
    }
    
    // Se usar imagem do IMAGE_URL, substituir os comandos ^BQN ANTES de substituir variáveis
    if (useImageForQR && qrImageZPL) {
      // Obter coordenadas dos QR codes do layout ou usar padrão do template
      const qrLeftX = layout?.qrLeft?.x || 77;
      const qrLeftY = layout?.qrLeft?.y || 355;
      const qrTopX = layout?.qrTop?.x || 737;
      const qrTopY = layout?.qrTop?.y || 167;
      const qrBottomX = layout?.qrBottom?.x || 739;
      const qrBottomY = layout?.qrBottom?.y || 355;
      
      console.log(`[DEBUG] [PREVIEW] Tentando substituir QR codes por imagem do IMAGE_URL`);
      console.log(`[DEBUG] [PREVIEW] Coordenadas: Left(${qrLeftX},${qrLeftY}), Top(${qrTopX},${qrTopY}), Bottom(${qrBottomX},${qrBottomY})`);
      console.log(`[DEBUG] [PREVIEW] Comando ZPL a inserir: ${qrImageZPL.substring(0, 100)}...`);
      
      // Verificar se o template contém os padrões antes de substituir
      const hasLeftQR = baseTemplate.includes(`FT${qrLeftX},${qrLeftY}^BQN`);
      const hasTopQR = baseTemplate.includes(`FT${qrTopX},${qrTopY}^BQN`);
      const hasBottomQR = baseTemplate.includes(`FT${qrBottomX},${qrBottomY}^BQN`);
      
      console.log(`[DEBUG] [PREVIEW] QR codes encontrados no template: Left=${hasLeftQR}, Top=${hasTopQR}, Bottom=${hasBottomQR}`);
      
      // Substituir cada QR code (^BQN) pela imagem (^GF) no template ANTES de substituir variáveis
      // IMPORTANTE: ^GF (Graphic Field) precisa de ^FO (Field Origin), não ^FT (Field Text)
      // O template tem formato:
      // ^FTx,y^BQN,2,3
      // ^FH\^FDLA,{QR_DATA_X}^FS
      // Precisamos capturar desde ^FT até ^FS incluindo a quebra de linha
      
      let replacements = 0;
      
      // Padrão mais robusto: captura desde ^FT até ^FS, incluindo qualquer coisa no meio (quebras de linha, espaços, etc)
      // Usar [\s\S]*? para capturar qualquer caractere (incluindo quebras de linha) de forma não-gulosa
      const patternLeft = new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_3\\}\\^FS`, 'g');
      const patternTop = new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_1\\}\\^FS`, 'g');
      const patternBottom = new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN[\\s\\S]*?\\^FH\\\\\\^FDLA,\\{QR_DATA_2\\}\\^FS`, 'g');
      
      // Verificar se os padrões existem antes de substituir
      const matchLeft = baseTemplate.match(patternLeft);
      const matchTop = baseTemplate.match(patternTop);
      const matchBottom = baseTemplate.match(patternBottom);
      
      console.log(`[DEBUG] [PREVIEW] Padrões encontrados: Left=${!!matchLeft}, Top=${!!matchTop}, Bottom=${!!matchBottom}`);
      if (matchLeft) console.log(`[DEBUG] [PREVIEW] Match Left (primeiros 100 chars): ${matchLeft[0].substring(0, 100)}`);
      if (matchTop) console.log(`[DEBUG] [PREVIEW] Match Top (primeiros 100 chars): ${matchTop[0].substring(0, 100)}`);
      if (matchBottom) console.log(`[DEBUG] [PREVIEW] Match Bottom (primeiros 100 chars): ${matchBottom[0].substring(0, 100)}`);
      
      // Substituir cada padrão encontrado
      if (matchLeft) {
        baseTemplate = baseTemplate.replace(patternLeft, `^FO${qrLeftX},${qrLeftY}${qrImageZPL}`);
        replacements++;
        console.log(`[OK] [PREVIEW] QR Left substituído - removido ${matchLeft[0].length} caracteres`);
      }
      if (matchTop) {
        baseTemplate = baseTemplate.replace(patternTop, `^FO${qrTopX},${qrTopY}${qrImageZPL}`);
        replacements++;
        console.log(`[OK] [PREVIEW] QR Top substituído - removido ${matchTop[0].length} caracteres`);
      }
      if (matchBottom) {
        baseTemplate = baseTemplate.replace(patternBottom, `^FO${qrBottomX},${qrBottomY}${qrImageZPL}`);
        replacements++;
        console.log(`[OK] [PREVIEW] QR Bottom substituído - removido ${matchBottom[0].length} caracteres`);
      }
      
      // Se nenhum padrão foi encontrado, tentar padrão genérico mais simples
      if (replacements === 0) {
        console.log(`[AVISO] [PREVIEW] Nenhum padrão específico encontrado, tentando padrão genérico...`);
        
        // Padrão genérico: capturar qualquer ^BQN seguido de qualquer coisa até ^FS nas coordenadas
        const genericPatternLeft = new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN[\\s\\S]*?\\^FS`, 'g');
        const genericPatternTop = new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN[\\s\\S]*?\\^FS`, 'g');
        const genericPatternBottom = new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN[\\s\\S]*?\\^FS`, 'g');
        
        if (baseTemplate.match(genericPatternLeft)) {
          baseTemplate = baseTemplate.replace(genericPatternLeft, `^FO${qrLeftX},${qrLeftY}${qrImageZPL}`);
          replacements++;
          console.log(`[OK] [PREVIEW] QR Left substituído (padrão genérico)`);
        }
        if (baseTemplate.match(genericPatternTop)) {
          baseTemplate = baseTemplate.replace(genericPatternTop, `^FO${qrTopX},${qrTopY}${qrImageZPL}`);
          replacements++;
          console.log(`[OK] [PREVIEW] QR Top substituído (padrão genérico)`);
        }
        if (baseTemplate.match(genericPatternBottom)) {
          baseTemplate = baseTemplate.replace(genericPatternBottom, `^FO${qrBottomX},${qrBottomY}${qrImageZPL}`);
          replacements++;
          console.log(`[OK] [PREVIEW] QR Bottom substituído (padrão genérico)`);
        }
      }
      
      console.log(`[OK] [PREVIEW] Total de substituições: ${replacements}/3`);
      console.log(`[OK] [PREVIEW] QR codes substituídos pela imagem do IMAGE_URL`);
      
      // Debug: verificar se ainda há ^BQN no template após substituição
      const remainingBQN = (baseTemplate.match(/\^BQN/g) || []).length;
      console.log(`[DEBUG] [PREVIEW] Comandos ^BQN restantes no template: ${remainingBQN}`);
      
      if (remainingBQN > 0) {
        console.warn(`[AVISO] [PREVIEW] Ainda há ${remainingBQN} comandos ^BQN no template! Eles podem estar sendo renderizados em cima da imagem.`);
        // Tentar remover qualquer ^BQN restante nas coordenadas específicas
        const finalCleanupLeft = new RegExp(`\\^FT${qrLeftX},${qrLeftY}\\^BQN[^\\^]*`, 'g');
        const finalCleanupTop = new RegExp(`\\^FT${qrTopX},${qrTopY}\\^BQN[^\\^]*`, 'g');
        const finalCleanupBottom = new RegExp(`\\^FT${qrBottomX},${qrBottomY}\\^BQN[^\\^]*`, 'g');
        
        baseTemplate = baseTemplate.replace(finalCleanupLeft, '');
        baseTemplate = baseTemplate.replace(finalCleanupTop, '');
        baseTemplate = baseTemplate.replace(finalCleanupBottom, '');
        
        const remainingAfterCleanup = (baseTemplate.match(/\^BQN/g) || []).length;
        console.log(`[DEBUG] [PREVIEW] Comandos ^BQN após limpeza final: ${remainingAfterCleanup}`);
      }
    }
    
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

    // Debug: verificar se o comando ^GFA está no ZPL final
    const hasGFA = zplCode.includes('^GFA');
    const hasFO = zplCode.includes('^FO');
    console.log(`[DEBUG] [PREVIEW] ZPL final contém ^GFA: ${hasGFA}, contém ^FO: ${hasFO}`);
    
    if (useImageForQR && qrImageZPL) {
      // Verificar se o comando ^GFA está presente nas coordenadas esperadas
      const qrLeftX = layout?.qrLeft?.x || 77;
      const qrLeftY = layout?.qrLeft?.y || 355;
      const qrTopX = layout?.qrTop?.x || 737;
      const qrTopY = layout?.qrTop?.y || 167;
      const qrBottomX = layout?.qrBottom?.x || 739;
      const qrBottomY = layout?.qrBottom?.y || 355;
      
      const hasLeftGFA = zplCode.includes(`^FO${qrLeftX},${qrLeftY}`);
      const hasTopGFA = zplCode.includes(`^FO${qrTopX},${qrTopY}`);
      const hasBottomGFA = zplCode.includes(`^FO${qrBottomX},${qrBottomY}`);
      
      console.log(`[DEBUG] [PREVIEW] Comandos ^FO encontrados no ZPL final: Left=${hasLeftGFA}, Top=${hasTopGFA}, Bottom=${hasBottomGFA}`);
      
      if (!hasLeftGFA && !hasTopGFA && !hasBottomGFA) {
        console.warn(`[AVISO] [PREVIEW] Nenhum comando ^FO encontrado no ZPL final! A substituição pode ter falhado.`);
        console.log(`[DEBUG] [PREVIEW] Amostra do ZPL nas coordenadas esperadas:`);
        console.log(`   Left (${qrLeftX},${qrLeftY}): ${zplCode.substring(zplCode.indexOf(`FT${qrLeftX},${qrLeftY}`) || 0, (zplCode.indexOf(`FT${qrLeftX},${qrLeftY}`) || 0) + 100)}`);
      }
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
  const color = String(item.COLOR || 'N/A');
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

^FO20,125^A0N,14,14^FDCOLOR:^FS
^FO90,125^A0N,14,14^FD${color}^FS
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
  
  page.drawText(`COLOR: ${String(item.COLOR || 'N/A')}`, {
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

// Tratamento de erros
app.use((error, req, res, next) => {
  console.error('Erro:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor com tratamento de erros robusto
console.log('[STARTUP] Iniciando servidor...');
console.log(`[STARTUP] PORT=${PORT}`);
console.log(`[STARTUP] NODE_ENV=${process.env.NODE_ENV || 'not set'}`);

let server;
try {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`✅ Servidor escutando em 0.0.0.0:${PORT}`);
    console.log(`✅ Health check disponível em http://0.0.0.0:${PORT}/health`);
  });

  server.on('error', (error) => {
    console.error('❌ Erro ao iniciar servidor:', error);
    console.error('❌ Stack:', error.stack);
    process.exit(1);
  });

  server.on('listening', () => {
    console.log('✅ Servidor está escutando!');
  });

  // Garantir que o processo não termine silenciosamente
  process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
    console.error('❌ Stack:', error.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
    if (reason && reason.stack) {
      console.error('❌ Stack:', reason.stack);
    }
    process.exit(1);
  });

  console.log('[STARTUP] Servidor configurado com sucesso');
} catch (error) {
  console.error('❌ ERRO CRÍTICO ao iniciar servidor:', error);
  console.error('❌ Stack:', error.stack);
  process.exit(1);
}

module.exports = app;