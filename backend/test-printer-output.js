/**
 * Script de Teste de Saída da Impressora
 * 
 * Este script testa a saída da impressora gerando uma etiqueta de teste
 * completa com vários elementos visuais para verificar a qualidade da impressão.
 * 
 * Uso:
 *   node test-printer-output.js
 */

const PythonUSBIntegration = require('./python-usb-integration');

async function testPrinterOutput() {
  console.log('='.repeat(60));
  console.log('  TESTE DE SAÍDA DA IMPRESSORA');
  console.log('='.repeat(60));
  console.log('');
  
  const pythonUSB = new PythonUSBIntegration();
  
  try {
    // 1. Detectar impressora
    console.log('[1/5] Detectando impressora...');
    await pythonUSB.detectPrinterName();
    const printerName = pythonUSB.printerName;
    console.log(`     ✓ Impressora detectada: ${printerName}`);
    console.log('');
    
    // 2. Verificar conexão
    console.log('[2/5] Verificando status da impressora...');
    const statusCheck = await pythonUSB.testConnection();
    
    if (!statusCheck.success || !pythonUSB.isConnected) {
      console.error('     ✗ Impressora não está online ou não foi encontrada');
      console.error('     Detalhes:', JSON.stringify(statusCheck.result, null, 2));
      process.exit(1);
    }
    
    console.log('     ✓ Impressora está online');
    console.log('     Detalhes:', JSON.stringify(statusCheck.result, null, 2));
    console.log('');
    
    // 3. Gerar ZPL de teste
    console.log('[3/5] Gerando etiqueta de teste...');
    const testDate = new Date();
    const testTimestamp = testDate.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    const testZPL = `^XA
^CF0,30
^FO50,30^FD========================================^FS
^FO50,60^FD    TESTE DE SAIDA DA IMPRESSORA^FS
^FO50,90^FD========================================^FS
^CF0,20
^FO50,130^FDData/Hora: ${testTimestamp}^FS
^FO50,160^FDImpressora: ${printerName}^FS
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
    
    console.log(`     ✓ ZPL gerado (${testZPL.length} caracteres)`);
    console.log('');
    
    // 4. Enviar para impressora
    console.log('[4/5] Enviando etiqueta para impressora...');
    const startTime = Date.now();
    const printResult = await pythonUSB.sendZPL(testZPL);
    const duration = Date.now() - startTime;
    
    if (!printResult.success) {
      console.error('     ✗ Falha ao enviar para impressora');
      console.error('     Erro:', printResult.error);
      process.exit(1);
    }
    
    console.log('     ✓ Etiqueta enviada com sucesso!');
    console.log(`     Job ID: ${printResult.result?.job_id || 'N/A'}`);
    console.log(`     Bytes escritos: ${printResult.result?.bytes_written || 0}`);
    console.log(`     Jobs na fila: ${printResult.result?.jobs_in_queue || 0}`);
    console.log(`     Duração: ${duration}ms`);
    console.log('');
    
    // 5. Resumo
    console.log('[5/5] Resumo do teste:');
    console.log('='.repeat(60));
    console.log(`  Impressora: ${printerName}`);
    console.log(`  Status: ${pythonUSB.isConnected ? 'Online' : 'Offline'}`);
    console.log(`  Teste ID: TEST-${Date.now()}`);
    console.log(`  Data/Hora: ${testTimestamp}`);
    console.log(`  Resultado: ${printResult.success ? '✓ SUCESSO' : '✗ FALHA'}`);
    console.log('');
    console.log('  Elementos incluídos na etiqueta de teste:');
    console.log('    ✓ Cabeçalho com título');
    console.log('    ✓ Data e hora do teste');
    console.log('    ✓ Nome da impressora');
    console.log('    ✓ Teste ID único');
    console.log('    ✓ Texto com letras, números e caracteres especiais');
    console.log('    ✓ Código de barras');
    console.log('    ✓ QR Code');
    console.log('    ✓ Linhas de diferentes espessuras');
    console.log('    ✓ Retângulos de diferentes espessuras');
    console.log('    ✓ Textos em diferentes tamanhos de fonte');
    console.log('    ✓ Rodapé');
    console.log('');
    console.log('  ⚠ IMPORTANTE: Verifique na etiqueta impressa se todos');
    console.log('     os elementos estão visíveis e nítidos!');
    console.log('='.repeat(60));
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('  ERRO NO TESTE');
    console.error('='.repeat(60));
    console.error(`  Erro: ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('  Stack trace:');
      console.error(error.stack);
    }
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Executar teste
if (require.main === module) {
  testPrinterOutput();
}

module.exports = testPrinterOutput;

