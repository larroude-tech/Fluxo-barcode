const sharp = require('sharp');
const axios = require('axios');

/**
 * Processa código ZPL e converte para imagem PNG usando Labelary API
 * @param {string} zplCode - Código ZPL para processar
 * @returns {Promise<string>} - Base64 da imagem PNG gerada
 */
async function processZPLToImage(zplCode) {
  try {
    console.log('📸 Processando ZPL via Labelary API para preview...');
    console.log('   [CONFIG] Resolução: 8dpmm (203 DPI) - mesma da impressora física');
    console.log('   📏 Tamanho da etiqueta: 4" x 2" (831 x 376 dots)');
    
    // Usar API do Labelary para converter ZPL real para imagem
    // Label de 4" x 2" a 203 DPI = aproximadamente 831 x 376 pixels
    // IMPORTANTE: 8dpmm = 203 DPI (dots per inch)
    // QR codes de 40 dots devem aparecer como 40 pixels no preview
    const labelaryResponse = await axios.post(
      'http://api.labelary.com/v1/printers/8dpmm/labels/4x2/0/',
      zplCode,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'image/png'
        },
        responseType: 'arraybuffer',
        timeout: 10000
      }
    );
    
    // Converter para base64
    const base64Image = Buffer.from(labelaryResponse.data).toString('base64');
    console.log('[OK] ZPL processado com sucesso via Labelary');
    console.log('   [SIZE] Preview gerado: cada dot do ZPL = 1 pixel na imagem');
    console.log('   [AVISO] NOTA: QR codes de 60 dots devem aparecer como ~60 pixels no preview');
    console.log('   📏 Tamanho esperado no preview: 60 pixels = 0.75 cm (se zoom 100%)');
    
    return base64Image;
    
  } catch (error) {
    console.log('[AVISO] Erro ao processar ZPL via Labelary:', error.message);
    console.log('[LOG] Usando fallback SVG simplificado...');
    
    // Fallback: criar SVG básico sem ícone de sapato
    const svg = createLabelSVGSimple();
    
    // Converter SVG para PNG usando Sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .resize(831, 376)
      .toBuffer();
    
    const base64Image = pngBuffer.toString('base64');
    console.log('[OK] Fallback SVG gerado com sucesso');
    
    return base64Image;
  }
}

/**
 * Cria SVG simplificado como fallback (sem ícone de sapato)
 */
function createLabelSVGSimple() {
  return `<svg width="831" height="376" xmlns="http://www.w3.org/2000/svg">
    <!-- Fundo branco apenas -->
    <rect width="831" height="376" fill="white"/>
    
  </svg>`;
}

module.exports = {
  processZPLToImage
};
