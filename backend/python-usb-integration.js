const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonUSBIntegration {
    constructor() {
        this.printerName = null; // Será detectado automaticamente
        this.isConnected = false;
        this.lastTestResult = null;
    }

    /**
     * Detecta e define o nome da impressora automaticamente
     */
    async detectPrinterName() {
        try {
            const { exec } = require('child_process');
            const path = require('path');
            
            // PRIMEIRO: Tentar obter a impressora padrão do Windows
            console.log('[DETECT] Verificando impressora padrão do Windows...');
            const defaultPrinterScript = `
import win32print

def get_default_printer():
    try:
        default_name = win32print.GetDefaultPrinter()
        if default_name:
            # Verificar se é uma impressora Zebra
            name_lower = default_name.lower()
            if 'zebra' in name_lower or 'zdesigner' in name_lower or 'zd' in name_lower or 'zt' in name_lower:
                result = {
                    "success": True,
                    "is_default": True,
                    "printer_name": default_name,
                    "message": "Impressora padrão Zebra encontrada"
                }
                print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
                return
    except Exception as e:
        pass
    
    result = {
        "success": False,
        "message": "Nenhuma impressora Zebra padrão encontrada"
    }
    print("ERROR:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    get_default_printer()
`;
            
            return new Promise((resolve, reject) => {
                // Tentar obter impressora padrão primeiro
                this.executePythonScript(defaultPrinterScript).then(defaultResult => {
                    const lines = defaultResult.output.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('SUCCESS:')) {
                            try {
                                const result = JSON.parse(line.replace('SUCCESS:', ''));
                                if (result.success && result.printer_name) {
                                    this.printerName = result.printer_name;
                                    console.log(`[OK] Usando impressora padrão do Windows: ${this.printerName}`);
                                    resolve(this.printerName);
                                    return;
                                }
                            } catch (e) {
                                // Continuar para fallback
                            }
                        }
                    }
                    
                    // Se não encontrou padrão Zebra, listar todas e escolher a melhor
                    console.log('[DETECT] Impressora padrão não é Zebra. Listando todas as impressoras...');
                    this.listPrinters().then(listResult => {
                        if (listResult.success && listResult.result && listResult.result.printers) {
                            const allPrinters = listResult.result.printers || [];
                            
                            // Filtrar apenas Zebra
                            const zebraPrinters = allPrinters.filter(p => {
                                if (!p || typeof p !== 'object') return false;
                                const name = (p.name || '').toLowerCase();
                                return name.includes('zebra') || 
                                       name.includes('zdesigner') || 
                                       name.includes('zd') ||
                                       name.includes('zt') ||
                                       name.includes('gk') ||
                                       name.includes('zp');
                            });
                            
                            if (zebraPrinters.length > 0) {
                                console.log(`[DETECT] ${zebraPrinters.length} impressora(s) Zebra encontrada(s):`);
                                zebraPrinters.forEach((p, i) => {
                                    console.log(`  ${i + 1}. ${p.name}`);
                                });
                                
                                // Verificar status de cada impressora e escolher a melhor
                                // Priorizar: 1) Impressoras online, 2) Com menos jobs na fila
                                const checkPrinterStatus = async (printerName) => {
                                    const tempName = this.printerName;
                                    this.printerName = printerName;
                                    try {
                                        const status = await this.testConnection();
                                        return {
                                            name: printerName,
                                            online: status.success && this.isConnected,
                                            jobsInQueue: status.result?.jobs_in_queue || 999,
                                            status: status.result?.status || 999,
                                            result: status.result
                                        };
                                    } catch (e) {
                                        return {
                                            name: printerName,
                                            online: false,
                                            jobsInQueue: 999,
                                            status: 999,
                                            error: e.message
                                        };
                                    } finally {
                                        this.printerName = tempName;
                                    }
                                };
                                
                                // Verificar status de todas as impressoras
                                console.log('[DETECT] Verificando status de todas as impressoras Zebra...');
                                const statusPromises = zebraPrinters.map(p => checkPrinterStatus(p.name));
                                Promise.all(statusPromises).then(statuses => {
                                    // Ordenar: online primeiro, depois por menor número de jobs
                                    statuses.sort((a, b) => {
                                        if (a.online !== b.online) {
                                            return b.online ? 1 : -1; // Online primeiro
                                        }
                                        return a.jobsInQueue - b.jobsInQueue; // Menos jobs primeiro
                                    });
                                    
                                    console.log('[DETECT] Status das impressoras:');
                                    statuses.forEach((s, i) => {
                                        console.log(`  ${i + 1}. ${s.name} - Online: ${s.online}, Jobs: ${s.jobsInQueue}, Status: ${s.status}`);
                                    });
                                    
                                    // Selecionar a melhor impressora
                                    const bestPrinter = statuses[0];
                                    this.printerName = bestPrinter.name;
                                    
                                    if (bestPrinter.online) {
                                        console.log(`[OK] Impressora selecionada: ${this.printerName} (Online, ${bestPrinter.jobsInQueue} jobs na fila)`);
                                    } else {
                                        console.warn(`[AVISO] Impressora selecionada: ${this.printerName} (Offline ou não verificável)`);
                                        if (statuses.length > 1 && statuses[1].online) {
                                            console.log(`[INFO] Tentando próxima impressora online: ${statuses[1].name}`);
                                            this.printerName = statuses[1].name;
                                        }
                                    }
                                    
                                    resolve(this.printerName);
                                }).catch(() => {
                                    // Se falhar, usar a primeira da lista
                                    this.printerName = zebraPrinters[0].name;
                                    console.warn(`[AVISO] Não foi possível verificar status, usando primeira da lista: ${this.printerName}`);
                                    resolve(this.printerName);
                                });
                                
                                return;
                            } else {
                                console.warn(`[AVISO] Nenhuma impressora Zebra encontrada na lista`);
                                allPrinters.forEach((p, i) => {
                                    console.log(`[DEBUG] Impressora ${i + 1}: ${p.name}`);
                                });
                            }
                        }
                        
                        // Último fallback: nome padrão
                        this.printerName = "ZDesigner ZD230-203dpi ZPL";
                        console.warn(`[AVISO] Usando nome padrão: ${this.printerName}`);
                        console.warn(`[AVISO] Verifique se a impressora Zebra está instalada no Windows`);
                        console.warn(`[AVISO] Dica: Configure uma impressora Zebra como padrão no Windows`);
                        resolve(this.printerName);
                    }).catch(() => {
                        this.printerName = "ZDesigner ZD230-203dpi ZPL";
                        console.warn(`[AVISO] Erro na listagem, usando nome padrão: ${this.printerName}`);
                        resolve(this.printerName);
                    });
                }).catch(() => {
                    // Se falhar completamente, usar fallback
                    this.printerName = "ZDesigner ZD230-203dpi ZPL";
                    console.warn(`[AVISO] Erro na detecção, usando nome padrão: ${this.printerName}`);
                    resolve(this.printerName);
                });
            });
        } catch (error) {
            // Fallback para nome padrão
            this.printerName = "ZDesigner ZD230-203dpi ZPL";
            console.warn(`[AVISO] Erro na detecção, usando nome padrão: ${this.printerName}`);
            return this.printerName;
        }
    }

    /**
     * Garante que o nome da impressora está definido
     */
    async ensurePrinterName() {
        if (!this.printerName) {
            await this.detectPrinterName();
        }
        return this.printerName;
    }

    /**
     * Executa script Python e retorna resultado
     */
    async executePythonScript(scriptContent, args = []) {
        return new Promise((resolve, reject) => {
            // Criar arquivo temporário do script
            const tempScriptPath = path.join(__dirname, `temp_script_${Date.now()}.py`);
            
            try {
                fs.writeFileSync(tempScriptPath, scriptContent, 'utf8');
                
                // Executar script Python
                const pythonProcess = spawn('python', [tempScriptPath, ...args], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                let stdout = '';
                let stderr = '';
                
                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
                
                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                
                pythonProcess.on('close', (code) => {
                    // Limpar arquivo temporário
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // Ignorar erro de limpeza
                    }
                    
                    if (code === 0) {
                        resolve({
                            success: true,
                            output: stdout,
                            error: stderr,
                            code: code
                        });
                    } else {
                        reject({
                            success: false,
                            output: stdout,
                            error: stderr,
                            code: code
                        });
                    }
                });
                
                pythonProcess.on('error', (error) => {
                    // Limpar arquivo temporário
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // Ignorar erro de limpeza
                    }
                    
                    reject({
                        success: false,
                        error: error.message,
                        code: -1
                    });
                });
                
            } catch (error) {
                reject({
                    success: false,
                    error: error.message,
                    code: -1
                });
            }
        });
    }

    /**
     * Testa conexão com a impressora
     */
    async testConnection() {
        console.log('[TEST] Testando conexão USB via Python...');
        
        // Garantir que o nome da impressora está definido
        await this.ensurePrinterName();
        
        const pythonScript = `
import win32print
import time

def test_usb_connection():
    printer_name = "${this.printerName}"
    
    try:
        # Verificar se impressora existe
        handle = win32print.OpenPrinter(printer_name)
        
        # Obter informações
        info = win32print.GetPrinter(handle, 2)
        
        result = {
            "success": True,
            "printer_name": info['pPrinterName'],
            "port": info['pPortName'],
            "driver": info['pDriverName'],
            "status": info['Status'],
            "jobs_in_queue": info['cJobs'],
            "online": info['Status'] == 0
        }
        
        win32print.ClosePrinter(handle)
        
        print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    test_usb_connection()
`;

        try {
            const result = await this.executePythonScript(pythonScript);
            
            // Parsear resultado
            const lines = result.output.split('\n');
            let testResult = null;
            
            for (const line of lines) {
                if (line.startsWith('SUCCESS:')) {
                    testResult = JSON.parse(line.replace('SUCCESS:', ''));
                    this.isConnected = testResult.online;
                    break;
                } else if (line.startsWith('ERROR:')) {
                    testResult = JSON.parse(line.replace('ERROR:', ''));
                    this.isConnected = false;
                    break;
                }
            }
            
            this.lastTestResult = testResult;
            
            console.log('[OK] Teste de conexão USB concluído:', testResult);
            
            return {
                success: true,
                result: testResult,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[ERRO] Erro no teste de conexão USB:', error);
            
            this.isConnected = false;
            this.lastTestResult = { success: false, error: error.error || error.message };
            
            return {
                success: false,
                error: error.error || error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Envia comando ZPL para a impressora
     */
    async sendZPL(zplCommand, encoding = 'ascii', copies = 1) {
        console.log(`[SEND] Enviando ZPL via Python USB (${copies} cópia${copies > 1 ? 's' : ''})...`);
        
        // Garantir que o nome da impressora está definido
        await this.ensurePrinterName();
        
        // Verificar status da impressora antes de enviar
        console.log(`[CHECK] Verificando status da impressora "${this.printerName}" antes de enviar...`);
        const statusCheck = await this.testConnection();
        if (!statusCheck.success || !this.isConnected) {
            const errorMsg = `Impressora "${this.printerName}" não está online ou não foi encontrada. Verifique se a impressora está ligada e instalada no Windows.`;
            console.error(`[ERRO] ${errorMsg}`);
            return {
                success: false,
                error: errorMsg,
                details: statusCheck.result,
                timestamp: new Date().toISOString()
            };
        }
        
        const pythonScript = `
import win32print
import time

def send_zpl_command():
    printer_name = "${this.printerName}"
    copies = ${copies}
    zpl_command = """${zplCommand.replace(/"/g, '\\"')}"""
    
    # Ajustar comando ^PQ para número de cópias
    if copies > 1:
        # Substituir ^PQ1,0,1,Y por ^PQ{copies},0,1,Y
        import re
        zpl_command = re.sub(r'\\^PQ\\d+,0,1,Y', f'^PQ{copies},0,1,Y', zpl_command)
        # Se não encontrar ^PQ, adicionar antes de ^XZ
        if '^PQ' not in zpl_command:
            zpl_command = zpl_command.replace('^XZ', f'^PQ{copies},0,1,Y\\n^XZ')
    
    try:
        # Verificar se impressora existe e está online ANTES de enviar
        handle = win32print.OpenPrinter(printer_name)
        info = win32print.GetPrinter(handle, 2)
        
        # Verificar status da impressora
        printer_status = info['Status']
        is_online = printer_status == 0
        
        if not is_online:
            win32print.ClosePrinter(handle)
            error_msg = f"Impressora não está online. Status: {printer_status}"
            error_result = {
                "success": False,
                "error": error_msg,
                "printer_status": printer_status,
                "printer_name": printer_name
            }
            print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
            return
        
        # Configurar para modo RAW
        doc_info = ("Python_ZPL_Job", None, "RAW")
        
        # Iniciar job
        job_id = win32print.StartDocPrinter(handle, 1, doc_info)
        
        # Enviar dados
        win32print.StartPagePrinter(handle)
        bytes_written = win32print.WritePrinter(handle, zpl_command.encode('${encoding}', errors='ignore'))
        win32print.EndPagePrinter(handle)
        win32print.EndDocPrinter(handle)
        
        # Verificar status após envio
        info_after = win32print.GetPrinter(handle, 2)
        
        win32print.ClosePrinter(handle)
        
        result = {
            "success": True,
            "job_id": job_id,
            "bytes_written": bytes_written,
            "jobs_in_queue": info_after['cJobs'],
            "printer_status": info_after['Status'],
            "copies_sent": copies,
            "printer_name": printer_name
        }
        
        print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
        
    except win32print.error as e:
        error_result = {
            "success": False,
            "error": f"Erro win32print: {str(e)}",
            "printer_name": printer_name,
            "error_code": e.winerror if hasattr(e, 'winerror') else None
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "printer_name": printer_name
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    send_zpl_command()
`;

        try {
            const result = await this.executePythonScript(pythonScript);
            
            // Parsear resultado
            const lines = result.output.split('\n');
            let sendResult = null;
            
            for (const line of lines) {
                if (line.startsWith('SUCCESS:')) {
                    sendResult = JSON.parse(line.replace('SUCCESS:', ''));
                    break;
                } else if (line.startsWith('ERROR:')) {
                    sendResult = JSON.parse(line.replace('ERROR:', ''));
                    break;
                }
            }
            
            if (sendResult?.success) {
                console.log('[OK] ZPL enviado via Python USB com sucesso');
                console.log(`   [INFO] Job ID: ${sendResult.job_id}, Bytes escritos: ${sendResult.bytes_written}`);
                console.log(`   [INFO] Impressora: ${sendResult.printer_name || this.printerName}`);
                console.log(`   [INFO] Status: ${sendResult.printer_status}, Jobs na fila: ${sendResult.jobs_in_queue}`);
            } else {
                console.error('[ERRO] Falha ao enviar ZPL via Python USB');
                console.error(`   [ERRO] Erro: ${sendResult?.error || 'Erro desconhecido'}`);
                console.error(`   [ERRO] Impressora: ${sendResult?.printer_name || this.printerName}`);
                if (sendResult?.error_code) {
                    console.error(`   [ERRO] Código de erro: ${sendResult.error_code}`);
                }
            }
            
            return {
                success: sendResult?.success || false,
                result: sendResult,
                error: sendResult?.success ? undefined : (sendResult?.error || 'Erro desconhecido ao enviar ZPL'),
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[ERRO] Erro ao enviar ZPL via Python USB:', error);
            console.error(`   [ERRO] Detalhes: ${JSON.stringify(error, null, 2)}`);
            
            // Mensagem de erro mais clara
            let errorMessage = 'Erro ao enviar ZPL para impressora';
            if (error.error) {
                errorMessage = error.error;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            return {
                success: false,
                error: errorMessage,
                details: error,
                printerName: this.printerName,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Lista impressoras disponíveis
     */
    async listPrinters() {
        console.log('[DEBUG] Listando impressoras via Python...');
        
        const pythonScript = `
import win32print

def list_printers():
    try:
        # Usar flag 2 (PRINTER_ENUM_ALL) para detectar todas as impressoras
        printers = win32print.EnumPrinters(2)
        
        printer_list = []
        for printer in printers:
            printer_info = {
                "name": printer[2],
                "server": printer[1] or "",
                "description": printer[0] or ""
            }
            printer_list.append(printer_info)
        
        result = {
            "success": True,
            "printers": printer_list,
            "count": len(printer_list)
        }
        
        print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    list_printers()
`;

        try {
            const result = await this.executePythonScript(pythonScript);
            
            // Parsear resultado
            const lines = result.output.split('\n');
            let listResult = null;
            
            for (const line of lines) {
                if (line.startsWith('SUCCESS:')) {
                    listResult = JSON.parse(line.replace('SUCCESS:', ''));
                    break;
                } else if (line.startsWith('ERROR:')) {
                    listResult = JSON.parse(line.replace('ERROR:', ''));
                    break;
                }
            }
            
            console.log('[OK] Impressoras listadas via Python:', listResult);
            
            return {
                success: true,
                result: listResult,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[ERRO] Erro ao listar impressoras via Python:', error);
            
            return {
                success: false,
                error: error.error || error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Envia ZPL de teste
     */
    async sendTestZPL() {
        const testZPL = `^XA
^FO50,50^A0N,40,40^FDTeste USB Python^FS
^FO50,100^A0N,25,25^FDData: ${new Date().toLocaleString('pt-BR')}^FS
^FO50,130^A0N,25,25^FDPython Integration^FS
^FO50,160^A0N,20,20^FDImpressora: ${this.printerName}^FS
^XZ`;

        return await this.sendZPL(testZPL);
    }

    /**
     * Obtém status da integração
     */
    getStatus() {
        return {
            printerName: this.printerName,
            isConnected: this.isConnected,
            lastTestResult: this.lastTestResult,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Executa teste completo
     */
    async fullTest() {
        console.log('[START] Executando teste completo Python USB...');
        
        try {
            // 1. Listar impressoras
            const listResult = await this.listPrinters();
            
            // 2. Testar conexão
            const connectionResult = await this.testConnection();
            
            // 3. Enviar ZPL de teste se conectado
            let zplResult = null;
            if (this.isConnected) {
                zplResult = await this.sendTestZPL();
            }
            
            const fullResult = {
                success: true,
                list: listResult,
                connection: connectionResult,
                zplTest: zplResult,
                summary: {
                    printersFound: listResult.result?.count || 0,
                    connectionSuccess: this.isConnected,
                    zplSent: zplResult?.success || false
                },
                timestamp: new Date().toISOString()
            };
            
            console.log('[OK] Teste completo Python USB concluído');
            return fullResult;
            
        } catch (error) {
            console.error('[ERRO] Erro no teste completo Python USB:', error);
            
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = PythonUSBIntegration;
