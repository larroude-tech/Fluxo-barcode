/**
 * Módulo para gerar QR Codes personalizados com logo no centro
 * 
 * Funcionalidades:
 * - Gera QR Code em PNG com alto nível de correção de erro
 * - Cria espaço em branco no centro do QR Code
 * - Insere logo centralizado (20% do tamanho do QR Code)
 * - Mantém legibilidade do QR Code mesmo com logo
 */

const QRCode = require('qrcode');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Gera um QR Code personalizado com logo no centro
 * 
 * @param {string} data - Dados a serem codificados no QR Code (texto ou URL)
 * @param {string} outputPath - Caminho onde salvar o QR Code final (padrão: qr_final.png)
 * @param {string} logoPath - Caminho para o arquivo de logo (padrão: L_logo.png na mesma pasta)
 * @param {Object} options - Opções de configuração
 * @param {number} options.size - Tamanho do QR Code em pixels (padrão: 500)
 * @param {number} options.logoSizePercent - Tamanho do logo em porcentagem do QR Code (padrão: 20)
 * @param {number} options.margin - Margem do QR Code em módulos (padrão: 4)
 * @param {string} options.errorCorrectionLevel - Nível de correção de erro: 'L', 'M', 'Q', 'H' (padrão: 'H')
 * @returns {Promise<string>} - Caminho do arquivo gerado
 */
async function generateQRWithLogo(
  data,
  outputPath = 'qr_final.png',
  logoPath = null,
  options = {}
) {
  try {
    // Configurações padrão
    const config = {
      size: options.size || 500,
      logoSizePercent: options.logoSizePercent || 20,
      margin: options.margin || 4,
      errorCorrectionLevel: options.errorCorrectionLevel || 'H'
    };

    console.log('[QR-LOGO] Iniciando geração de QR Code personalizado...');
    console.log(`[QR-LOGO] Dados: ${data.substring(0, 50)}${data.length > 50 ? '...' : ''}`);
    console.log(`[QR-LOGO] Tamanho: ${config.size}x${config.size}px`);
    console.log(`[QR-LOGO] Logo: ${config.logoSizePercent}% do QR Code`);
    console.log(`[QR-LOGO] Correção de erro: ${config.errorCorrectionLevel}`);

    // 1. Gerar QR Code com alto nível de correção de erro
    console.log('[QR-LOGO] Passo 1: Gerando QR Code...');
    const qrCodeBuffer = await QRCode.toBuffer(data, {
      errorCorrectionLevel: config.errorCorrectionLevel,
      type: 'png',
      width: config.size,
      margin: config.margin,
      color: {
        dark: '#000000',  // Preto
        light: '#FFFFFF'  // Branco
      }
    });

    console.log(`[QR-LOGO] ✅ QR Code gerado: ${qrCodeBuffer.length} bytes`);

    // 2. Obter dimensões do QR Code
    const qrMetadata = await sharp(qrCodeBuffer).metadata();
    const qrWidth = qrMetadata.width;
    const qrHeight = qrMetadata.height;

    console.log(`[QR-LOGO] Dimensões do QR Code: ${qrWidth}x${qrHeight}px`);

    // 3. Calcular tamanho do logo (20% do QR Code)
    const logoSize = Math.floor(qrWidth * (config.logoSizePercent / 100));
    console.log(`[QR-LOGO] Tamanho do logo: ${logoSize}x${logoSize}px`);

    // 4. Criar espaço em branco no centro do QR Code
    console.log('[QR-LOGO] Passo 2: Criando espaço em branco no centro...');
    const whiteAreaSize = logoSize + 10; // Logo + margem de 5px de cada lado
    const whiteAreaX = Math.floor((qrWidth - whiteAreaSize) / 2);
    const whiteAreaY = Math.floor((qrHeight - whiteAreaSize) / 2);

    console.log(`[QR-LOGO] Área branca: ${whiteAreaSize}x${whiteAreaSize}px na posição (${whiteAreaX}, ${whiteAreaY})`);

    // Criar imagem branca para a área central
    const whiteArea = await sharp({
      create: {
        width: whiteAreaSize,
        height: whiteAreaSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    // Aplicar área branca no QR Code (sobrescrever módulos pretos no centro)
    const qrWithWhiteArea = await sharp(qrCodeBuffer)
      .composite([{
        input: whiteArea,
        top: whiteAreaY,
        left: whiteAreaX,
        blend: 'dest-over' // Sobrescrever com branco
      }])
      .png()
      .toBuffer();

    console.log('[QR-LOGO] ✅ Espaço em branco criado no centro');

    // 5. Processar e inserir logo
    let qrFinal;
    if (logoPath && fs.existsSync(logoPath)) {
      console.log('[QR-LOGO] Passo 3: Processando e inserindo logo...');
      console.log(`[QR-LOGO] Logo encontrado: ${logoPath}`);

      // Carregar e redimensionar logo
      const logoMetadata = await sharp(logoPath).metadata();
      console.log(`[QR-LOGO] Logo original: ${logoMetadata.width}x${logoMetadata.height}px`);

      // Redimensionar logo mantendo proporção
      const logo = await sharp(logoPath)
        .resize(logoSize, logoSize, {
          fit: 'contain', // Manter proporção original
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // Fundo branco para áreas transparentes
          kernel: 'lanczos3' // Alta qualidade (equivalente ao LANCZOS do Python)
        })
        .png({ quality: 100 })
        .toBuffer();

      const processedLogoMetadata = await sharp(logo).metadata();
      console.log(`[QR-LOGO] Logo processado: ${processedLogoMetadata.width}x${processedLogoMetadata.height}px`);

      // Calcular posição central do logo
      const actualLogoWidth = processedLogoMetadata.width;
      const actualLogoHeight = processedLogoMetadata.height;
      const logoX = Math.floor((qrWidth - actualLogoWidth) / 2);
      const logoY = Math.floor((qrHeight - actualLogoHeight) / 2);

      console.log(`[QR-LOGO] Logo posicionado no centro: (${logoX}, ${logoY})`);

      // Inserir logo no centro do QR Code
      qrFinal = await sharp(qrWithWhiteArea)
        .composite([{
          input: logo,
          top: logoY,
          left: logoX,
          blend: 'over' // Sobrepor mantendo transparência
        }])
        .png()
        .toBuffer();

      console.log('[QR-LOGO] ✅ Logo inserido com sucesso');
    } else {
      console.log('[QR-LOGO] ⚠️ Logo não encontrado, gerando QR Code apenas com espaço em branco');
      qrFinal = qrWithWhiteArea;
    }

    // 6. Salvar arquivo final
    console.log(`[QR-LOGO] Passo 4: Salvando arquivo final em: ${outputPath}`);
    
    // Garantir que o diretório existe
    const outputDir = path.dirname(outputPath);
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Salvar arquivo (qrFinal já é um buffer PNG)
    fs.writeFileSync(outputPath, qrFinal);

    console.log(`[QR-LOGO] ✅ QR Code personalizado salvo com sucesso: ${outputPath}`);
    console.log('[QR-LOGO] ========================================');

    return outputPath;

  } catch (error) {
    console.error('[QR-LOGO] ❌ Erro ao gerar QR Code personalizado:');
    console.error(`[QR-LOGO] ${error.message}`);
    console.error(`[QR-LOGO] Stack: ${error.stack}`);
    throw error;
  }
}

/**
 * Função auxiliar para gerar QR Code com logo usando caminhos padrão
 * 
 * @param {string} data - Dados a serem codificados no QR Code
 * @param {string} outputPath - Caminho onde salvar (padrão: qr_final.png na pasta image_qrcode)
 * @param {Object} options - Opções de configuração
 * @returns {Promise<string>} - Caminho do arquivo gerado
 */
async function generateQRWithLogoDefault(data, outputPath = null, options = {}) {
  // Caminhos padrão
  const defaultLogoPath = path.join(__dirname, 'L_logo.png');
  const defaultOutputPath = outputPath || path.join(__dirname, 'qr_final.png');

  return await generateQRWithLogo(data, defaultOutputPath, defaultLogoPath, options);
}

// Exportar funções
module.exports = {
  generateQRWithLogo,
  generateQRWithLogoDefault
};

// Se executado diretamente, fazer um teste
if (require.main === module) {
  (async () => {
    try {
      console.log('========================================');
      console.log('Teste de geração de QR Code personalizado');
      console.log('========================================\n');

      const testData = 'https://example.com';
      const outputFile = path.join(__dirname, 'qr_final.png');
      const logoFile = path.join(__dirname, 'L_logo.png');

      await generateQRWithLogo(testData, outputFile, logoFile, {
        size: 500,
        logoSizePercent: 20,
        errorCorrectionLevel: 'H'
      });

      console.log('\n✅ Teste concluído com sucesso!');
      console.log(`📁 Arquivo gerado: ${outputFile}`);
    } catch (error) {
      console.error('\n❌ Erro no teste:', error.message);
      process.exit(1);
    }
  })();
}

