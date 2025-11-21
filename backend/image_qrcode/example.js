/**
 * Exemplo de uso do módulo generateQRWithLogo
 * 
 * Este arquivo demonstra como usar o módulo para gerar QR Codes personalizados
 */

const { generateQRWithLogo, generateQRWithLogoDefault } = require('./generateQRWithLogo');
const path = require('path');

async function exemploBasico() {
  console.log('\n=== Exemplo 1: Uso Básico ===\n');
  
  await generateQRWithLogoDefault('https://www.example.com', null, {
    size: 500,
    logoSizePercent: 20,
    errorCorrectionLevel: 'H'
  });
}

async function exemploCustomizado() {
  console.log('\n=== Exemplo 2: Uso Customizado ===\n');
  
  const data = 'L106-LEER-9.5-BLAC-1556';
  const outputPath = path.join(__dirname, 'qr_customizado.png');
  const logoPath = path.join(__dirname, 'L_logo.png');
  
  await generateQRWithLogo(data, outputPath, logoPath, {
    size: 600,
    logoSizePercent: 20,
    margin: 4,
    errorCorrectionLevel: 'H'
  });
}

async function exemploComDiferentesTamanhos() {
  console.log('\n=== Exemplo 3: Diferentes Tamanhos ===\n');
  
  const data = 'https://www.example.com';
  
  // QR Code pequeno
  await generateQRWithLogo(data, path.join(__dirname, 'qr_pequeno.png'), null, {
    size: 300,
    logoSizePercent: 20
  });
  
  // QR Code médio
  await generateQRWithLogo(data, path.join(__dirname, 'qr_medio.png'), null, {
    size: 500,
    logoSizePercent: 20
  });
  
  // QR Code grande
  await generateQRWithLogo(data, path.join(__dirname, 'qr_grande.png'), null, {
    size: 800,
    logoSizePercent: 20
  });
}

// Executar exemplos
(async () => {
  try {
    await exemploBasico();
    await exemploCustomizado();
    await exemploComDiferentesTamanhos();
    
    console.log('\n✅ Todos os exemplos executados com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro ao executar exemplos:', error.message);
  }
})();

