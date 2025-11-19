import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Settings, 
  Wifi, 
  Usb, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  Monitor,
  Zap,
  Activity,
  Terminal,
  Save,
  Play,
  RotateCcw,
  Download
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import './PrinterConfig.css';

const PrinterConfig = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState({
    rfid: 'offline',
    usb: 'offline', 
    python: 'offline',
    pythonUsb: 'offline',
    mupa: 'offline'
  });
  
  // Estados para diferentes seções
  const [rfidData, setRfidData] = useState({
    discoveredPrinters: [],
    testResults: [],
    isConnected: false
  });
  
  const [usbData, setUsbData] = useState({
    ports: [],
    connectedPort: null,
    testResult: null
  });
  
  const [pythonData, setPythonData] = useState({
    printers: [],
    connectionStatus: null,
    testResult: null
  });
  
  const [mupaData, setMupaData] = useState({
    status: null,
    lastTest: null
  });
  
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({
    printerIP: '',
    printerPort: '9100',
    printerName: 'ZDesigner ZD621R-203dpi ZPL',
    rfidEnabled: true,
    autoConnect: false
  });

  // Verificar status dos serviços ao carregar
  useEffect(() => {
    checkAllServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleString('pt-BR');
    setLogs(prev => [...prev.slice(-49), { timestamp, message, type }]);
  };

  const checkAllServices = async () => {
    const newServices = { ...services };

    // RFID (saúde do serviço)
    try {
      await axios.get(`${API_BASE_URL}/rfid/status`);
      newServices.rfid = 'online';
      addLog(`✅ Serviço RFID online`, 'success');
    } catch (error) {
      newServices.rfid = 'offline';
      addLog(`❌ Serviço RFID offline`, 'error');
    }

    // USB (status real do hardware)
    try {
      const resp = await axios.get(`${API_BASE_URL}/usb/status`);
      const connected = !!resp.data?.connected;
      const printers = Number(resp.data?.printerCount || 0);
      newServices.usb = (connected || printers > 0) ? 'online' : 'offline';
      // Atualizar lista de portas detectadas, se fornecida
      if (Array.isArray(resp.data?.ports)) {
        setUsbData(prev => ({ ...prev, ports: resp.data.ports }));
      }
      addLog(`✅ USB ${newServices.usb.toUpperCase()} (conectado: ${connected ? 'sim' : 'não'}, impressoras: ${printers})`, newServices.usb === 'online' ? 'success' : 'warning');
    } catch (error) {
      newServices.usb = 'offline';
      addLog(`❌ USB offline`, 'error');
    }

    // Python API
    try {
      await axios.get(`${API_BASE_URL}/python/status`);
      newServices.python = 'online';
      addLog(`✅ Serviço PYTHON online`, 'success');
    } catch (error) {
      newServices.python = 'offline';
      addLog(`❌ Serviço PYTHON offline`, 'error');
    }

    // Python USB
    try {
      await axios.get(`${API_BASE_URL}/python-usb/status`);
      newServices.pythonUsb = 'online';
      addLog(`✅ Serviço PYTHON-USB online`, 'success');
    } catch (error) {
      newServices.pythonUsb = 'offline';
      addLog(`❌ Serviço PYTHON-USB offline`, 'error');
    }

    // MUPA
    try {
      await axios.get(`${API_BASE_URL}/mupa/status`);
      newServices.mupa = 'online';
      addLog(`✅ Serviço MUPA online`, 'success');
    } catch (error) {
      newServices.mupa = 'offline';
      addLog(`❌ Serviço MUPA offline`, 'error');
    }

    setServices(newServices);
  };

  // ===== FUNÇÕES RFID =====
  const discoverRFIDPrinters = async () => {
    setIsLoading(true);
    addLog('🔍 Descobrindo impressoras RFID na rede...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/rfid/discover`, {
        timeout: 10000
      });
      
      setRfidData(prev => ({
        ...prev,
        discoveredPrinters: response.data.printers
      }));
      
      addLog(`✅ Descobertas ${response.data.count} impressoras RFID`, 'success');
    } catch (error) {
      addLog(`❌ Erro ao descobrir impressoras RFID: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const testRFIDPrinter = async (ip, port = 9100) => {
    setIsLoading(true);
    addLog(`🧪 Testando impressora RFID ${ip}:${port}...`, 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/rfid/test`, { ip, port });
      
      setRfidData(prev => ({
        ...prev,
        testResults: [...prev.testResults, response.data.result]
      }));
      
      addLog(`✅ Teste da impressora ${ip} concluído`, 'success');
    } catch (error) {
      addLog(`❌ Erro no teste RFID: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const runFullRFIDTest = async () => {
    setIsLoading(true);
    addLog('🚀 Executando teste completo RFID...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/rfid/full-test`);
      
      setRfidData(prev => ({
        ...prev,
        discoveredPrinters: response.data.discovered,
        testResults: response.data.tested
      }));
      
      addLog(`✅ Teste completo RFID finalizado - ${response.data.discovered.length} descobertas, ${response.data.tested.length} testadas`, 'success');
    } catch (error) {
      addLog(`❌ Erro no teste completo RFID: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== FUNÇÕES USB =====
  const detectUSBPrinters = async () => {
    setIsLoading(true);
    addLog('🔍 Detectando impressoras USB...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/usb/detect`);
      
      setUsbData(prev => ({
        ...prev,
        ports: [...response.data.detection.serial, ...response.data.detection.windows, ...response.data.detection.usb]
      }));
      
      addLog(`✅ Detectadas ${response.data.total} impressoras USB`, 'success');
    } catch (error) {
      addLog(`❌ Erro na detecção USB: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const connectUSB = async (portPath = null) => {
    setIsLoading(true);
    const endpoint = portPath ? 
      `${API_BASE_URL}/usb/connect` : 
      `${API_BASE_URL}/usb/auto-connect`;
    
    addLog(`🔌 ${portPath ? `Conectando à porta ${portPath}` : 'Auto-conectando USB'}...`, 'info');
    
    try {
      const response = await axios.post(endpoint, portPath ? { portPath } : {});
      
      setUsbData(prev => ({
        ...prev,
        connectedPort: portPath || response.data.result?.connectedPort,
        testResult: response.data.result
      }));
      
      addLog(`✅ Conexão USB estabelecida`, 'success');
    } catch (error) {
      addLog(`❌ Erro na conexão USB: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const testUSBConnection = async () => {
    setIsLoading(true);
    addLog('🧪 Testando conexão USB...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/usb/full-test`);
      
      setUsbData(prev => ({
        ...prev,
        testResult: response.data.testResult,
        ports: [...(response.data.detection?.serial || []), ...(response.data.detection?.windows || []), ...(response.data.detection?.usb || [])]
      }));
      
      addLog(`✅ Teste USB concluído`, 'success');
    } catch (error) {
      addLog(`❌ Erro no teste USB: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== FUNÇÕES PYTHON =====
  // eslint-disable-next-line no-unused-vars
  const detectPythonPrinters = async () => {
    setIsLoading(true);
    addLog('🔍 Detectando impressoras via Python...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/python/detect`);
      
      setPythonData(prev => ({
        ...prev,
        printers: response.data.result.printers || []
      }));
      
      addLog(`✅ Python detectou ${response.data.result.printers?.length || 0} impressoras`, 'success');
    } catch (error) {
      addLog(`❌ Erro na detecção Python: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const testPythonConnection = async () => {
    setIsLoading(true);
    addLog('🧪 Testando conexão Python...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/python/full-test`);
      
      setPythonData(prev => ({
        ...prev,
        testResult: response.data.result
      }));
      
      addLog(`✅ Teste Python concluído`, 'success');
    } catch (error) {
      addLog(`❌ Erro no teste Python: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== FUNÇÕES MUPA =====
  // eslint-disable-next-line no-unused-vars
  const testMupaIntegration = async () => {
    setIsLoading(true);
    addLog('🧪 Testando integração MUPA RFID...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/mupa/test`, {
        text: 'MUPA_TESTE_01'
      });
      
      setMupaData(prev => ({
        ...prev,
        lastTest: response.data.result
      }));
      
      addLog(`✅ Teste MUPA concluído`, 'success');
    } catch (error) {
      addLog(`❌ Erro no teste MUPA: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestZPL = async () => {
    setIsLoading(true);
    const testZPL = `^XA
^FO50,50^A0N,30,30^FDTeste de Configuração^FS
^FO50,100^A0N,20,20^FDData: ${new Date().toLocaleString('pt-BR')}^FS
^XZ`;

    addLog('📤 Enviando comando ZPL de teste...', 'info');
    
    try {
      // Tentar Python USB primeiro (método que funciona)
      if (services.pythonUsb === 'online') {
        await axios.post(`${API_BASE_URL}/python-usb/send-zpl`, { zplCommand: testZPL });
        addLog('✅ ZPL enviado via Python USB', 'success');
      } else if (services.usb === 'online') {
        await axios.post(`${API_BASE_URL}/usb/send-zpl`, { zplCommand: testZPL });
        addLog('✅ ZPL enviado via USB', 'success');
      } else if (services.python === 'online') {
        await axios.post(`${API_BASE_URL}/python/send-zpl`, { zplCommand: testZPL });
        addLog('✅ ZPL enviado via Python', 'success');
      } else {
        throw new Error('Nenhum serviço de impressão disponível');
      }
    } catch (error) {
      addLog(`❌ Erro ao enviar ZPL: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const testPythonUSB = async () => {
    setIsLoading(true);
    addLog('🧪 Testando Python USB (método que funciona)...', 'info');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/python-usb/full-test`);
      
      const result = response.data.result;
      addLog(`✅ Teste Python USB concluído`, 'success');
      addLog(`📊 Impressoras encontradas: ${result.summary?.printersFound || 0}`, 'info');
      addLog(`📊 Conexão: ${result.summary?.connectionSuccess ? 'OK' : 'FALHA'}`, result.summary?.connectionSuccess ? 'success' : 'error');
      addLog(`📊 ZPL enviado: ${result.summary?.zplSent ? 'OK' : 'FALHA'}`, result.summary?.zplSent ? 'success' : 'error');
      
    } catch (error) {
      addLog(`❌ Erro no teste Python USB: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('🗑️ Logs limpos', 'info');
  };

  const saveConfig = () => {
    localStorage.setItem('printerConfig', JSON.stringify(config));
    addLog('💾 Configuração salva', 'success');
  };

  const loadConfig = () => {
    const savedConfig = localStorage.getItem('printerConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
      addLog('📁 Configuração carregada', 'success');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return <CheckCircle className="status-icon online" />;
      case 'offline': return <XCircle className="status-icon offline" />;
      default: return <AlertCircle className="status-icon warning" />;
    }
  };

  const renderOverview = () => (
    <div className="config-section">
      <h3><Monitor className="section-icon" />Status dos Serviços</h3>
      
      <div className="services-grid">
        <div className="service-card">
          <div className="service-header">
            <Wifi className="service-icon" />
            <span>RFID Network</span>
            {getStatusIcon(services.rfid)}
          </div>
          <div className="service-stats">
            <span>Impressoras: {rfidData.discoveredPrinters.length}</span>
            <span>Testes: {rfidData.testResults.length}</span>
          </div>
        </div>

        <div className="service-card">
          <div className="service-header">
            <Usb className="service-icon" />
            <span>USB Connection</span>
            {getStatusIcon(services.usb)}
          </div>
          <div className="service-stats">
            <span>Portas: {usbData.ports.length}</span>
            <span>Conectado: {usbData.connectedPort ? 'Sim' : 'Não'}</span>
          </div>
        </div>

        <div className="service-card">
          <div className="service-header">
            <Zap className="service-icon" />
            <span>Python API</span>
            {getStatusIcon(services.python)}
          </div>
          <div className="service-stats">
            <span>Impressoras: {pythonData.printers.length}</span>
            <span>Status: {pythonData.connectionStatus?.status || 'N/A'}</span>
          </div>
        </div>

        <div className="service-card">
          <div className="service-header">
            <Zap className="service-icon" />
            <span>Python USB</span>
            {getStatusIcon(services.pythonUsb)}
          </div>
          <div className="service-stats">
            <span>Método: win32print</span>
            <span>Status: {services.pythonUsb === 'online' ? 'Funcionando' : 'Offline'}</span>
          </div>
        </div>

        <div className="service-card">
          <div className="service-header">
            <Activity className="service-icon" />
            <span>MUPA RFID</span>
            {getStatusIcon(services.mupa)}
          </div>
          <div className="service-stats">
            <span>Último teste: {mupaData.lastTest ? 'OK' : 'N/A'}</span>
            <span>RFID: {config.rfidEnabled ? 'Ativado' : 'Desativado'}</span>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <h4>Ações Rápidas</h4>
        <div className="action-buttons">
          <button 
            onClick={checkAllServices}
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? <RefreshCw className="spinning" /> : <RefreshCw />}
            Verificar Serviços
          </button>
          
          <button 
            onClick={runFullRFIDTest}
            disabled={isLoading || services.rfid === 'offline'}
            className="btn btn-secondary"
          >
            <TestTube />
            Teste Completo RFID
          </button>
          
          <button 
            onClick={testUSBConnection}
            disabled={isLoading || services.usb === 'offline'}
            className="btn btn-secondary"
          >
            <Usb />
            Teste Completo USB
          </button>
          
          <button 
            onClick={sendTestZPL}
            disabled={isLoading || (services.usb === 'offline' && services.python === 'offline' && services.pythonUsb === 'offline')}
            className="btn btn-success"
          >
            <Play />
            Enviar ZPL Teste
          </button>
          
          <button 
            onClick={testPythonUSB}
            disabled={isLoading || services.pythonUsb === 'offline'}
            className="btn btn-warning"
          >
            <Zap />
            Teste Python USB
          </button>
        </div>
      </div>
    </div>
  );

  const renderRFIDConfig = () => (
    <div className="config-section">
      <h3><Wifi className="section-icon" />Configuração RFID</h3>
      
      <div className="config-controls">
        <div className="control-group">
          <label>IP da Impressora:</label>
          <input
            type="text"
            value={config.printerIP}
            onChange={(e) => setConfig(prev => ({ ...prev, printerIP: e.target.value }))}
            placeholder="192.168.1.100"
          />
        </div>
        
        <div className="control-group">
          <label>Porta:</label>
          <input
            type="number"
            value={config.printerPort}
            onChange={(e) => setConfig(prev => ({ ...prev, printerPort: e.target.value }))}
            placeholder="9100"
          />
        </div>
        
        <div className="control-buttons">
          <button onClick={discoverRFIDPrinters} disabled={isLoading} className="btn btn-primary">
            <Wifi />
            Descobrir Impressoras
          </button>
          
          {config.printerIP && (
            <button 
              onClick={() => testRFIDPrinter(config.printerIP, config.printerPort)}
              disabled={isLoading}
              className="btn btn-secondary"
            >
              <TestTube />
              Testar IP Específico
            </button>
          )}
        </div>
      </div>

      {rfidData.discoveredPrinters.length > 0 && (
        <div className="discovered-printers">
          <h4>Impressoras Descobertas</h4>
          <div className="printers-list">
            {rfidData.discoveredPrinters.map((printer, index) => (
              <div key={index} className="printer-item">
                <span>{printer.ip}:{printer.port}</span>
                <button 
                  onClick={() => testRFIDPrinter(printer.ip, printer.port)}
                  disabled={isLoading}
                  className="btn btn-sm btn-primary"
                >
                  Testar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderUSBConfig = () => (
    <div className="config-section">
      <h3><Usb className="section-icon" />Configuração USB</h3>
      
      <div className="config-controls">
        <div className="control-buttons">
          <button onClick={detectUSBPrinters} disabled={isLoading} className="btn btn-primary">
            <Usb />
            Detectar Portas USB
          </button>
          
          <button onClick={() => connectUSB()} disabled={isLoading} className="btn btn-secondary">
            <Zap />
            Auto-Conectar
          </button>
        </div>
      </div>

      {usbData.ports.length > 0 && (
        <div className="usb-ports">
          <h4>Portas Disponíveis</h4>
          <div className="ports-list">
            {usbData.ports.map((port, index) => (
              <div key={index} className="port-item">
                <span>{port.path || port.name || port}</span>
                <button 
                  onClick={() => connectUSB(port.path || port)}
                  disabled={isLoading}
                  className="btn btn-sm btn-primary"
                >
                  Conectar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {usbData.testResult && (
        <div className="test-results">
          <h4>Resultado do Teste USB</h4>
          <div className="result-item">
            <pre>{JSON.stringify(usbData.testResult, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="config-section">
      <h3><Settings className="section-icon" />Configurações Gerais</h3>
      
      <div className="settings-form">
        <div className="form-group">
          <label>Nome da Impressora:</label>
          <input
            type="text"
            value={config.printerName}
            onChange={(e) => setConfig(prev => ({ ...prev, printerName: e.target.value }))}
          />
        </div>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.rfidEnabled}
              onChange={(e) => setConfig(prev => ({ ...prev, rfidEnabled: e.target.checked }))}
            />
            Habilitar RFID
          </label>
        </div>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.autoConnect}
              onChange={(e) => setConfig(prev => ({ ...prev, autoConnect: e.target.checked }))}
            />
            Conectar Automaticamente
          </label>
        </div>
        
        <div className="form-actions">
          <button onClick={saveConfig} className="btn btn-success">
            <Save />
            Salvar Configuração
          </button>
          
          <button onClick={loadConfig} className="btn btn-secondary">
            <Download />
            Carregar Configuração
          </button>
        </div>
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className="config-section">
      <h3><Terminal className="section-icon" />Logs do Sistema</h3>
      
      <div className="logs-controls">
        <button onClick={clearLogs} className="btn btn-danger btn-sm">
          <RotateCcw />
          Limpar Logs
        </button>
      </div>
      
      <div className="logs-container">
        {logs.map((log, index) => (
          <div key={index} className={`log-entry log-${log.type}`}>
            <span className="log-timestamp">{log.timestamp}</span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="no-logs">Nenhum log disponível</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="printer-config">
      <div className="config-header">
        <h2>
          <Settings className="header-icon" />
          Configuração da Impressora RFID
        </h2>
      </div>

      <div className="config-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Monitor />
          Visão Geral
        </button>
        
        <button 
          className={`tab ${activeTab === 'rfid' ? 'active' : ''}`}
          onClick={() => setActiveTab('rfid')}
        >
          <Wifi />
          RFID
        </button>
        
        <button 
          className={`tab ${activeTab === 'usb' ? 'active' : ''}`}
          onClick={() => setActiveTab('usb')}
        >
          <Usb />
          USB
        </button>
        
        <button 
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings />
          Configurações
        </button>
        
        <button 
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <Terminal />
          Logs
        </button>
      </div>

      <div className="config-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'rfid' && renderRFIDConfig()}
        {activeTab === 'usb' && renderUSBConfig()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'logs' && renderLogs()}
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <RefreshCw className="spinning" />
            <span>Processando...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrinterConfig;
