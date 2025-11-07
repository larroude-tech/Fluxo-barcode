import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Wifi, Printer, TestTube, Download, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import './RFIDPrinterTest.css';

const RFIDPrinterTest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [manualIP, setManualIP] = useState('');
  const [manualPort, setManualPort] = useState('9100');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const API_BASE = 'http://localhost:3002/api/rfid';

  // Verificar status do serviço
  useEffect(() => {
    checkServiceStatus();
  }, []);

  const checkServiceStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/status`);
      setStatus('online');
    } catch (error) {
      setStatus('offline');
      setError('Serviço de teste RFID não está disponível');
    }
  };

  // Descobrir impressoras na rede
  const discoverPrinters = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_BASE}/discover`, {
        timeout: 10000
      });
      
      setDiscoveredPrinters(response.data.printers);
      
      if (response.data.count === 0) {
        setError('Nenhuma impressora Zebra ZD621R foi descoberta na rede');
      }
    } catch (error) {
      setError('Erro ao descobrir impressoras: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  // Testar impressora específica
  const testPrinter = async (ip, port = 9100) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_BASE}/test`, {
        ip,
        port: parseInt(port)
      });
      
      const newResult = response.data.result;
      setTestResults(prev => [...prev, newResult]);
      
      return newResult;
    } catch (error) {
      setError('Erro ao testar impressora: ' + (error.response?.data?.error || error.message));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Testar impressora manual
  const testManualPrinter = async () => {
    if (!manualIP.trim()) {
      setError('Por favor, insira o IP da impressora');
      return;
    }
    
    const result = await testPrinter(manualIP, manualPort);
    if (result) {
      setManualIP('');
      setManualPort('9100');
    }
  };

  // Executar teste completo
  const runFullTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_BASE}/full-test`, {
        timeout: 10000
      });
      
      setDiscoveredPrinters(response.data.discovered);
      setTestResults(response.data.tested);
      
      if (response.data.discovered.length === 0) {
        setError('Nenhuma impressora foi descoberta automaticamente');
      }
    } catch (error) {
      setError('Erro no teste completo: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  // Limpar resultados
  const clearResults = async () => {
    try {
      await axios.post(`${API_BASE}/clear`);
      setDiscoveredPrinters([]);
      setTestResults([]);
      setError(null);
    } catch (error) {
      setError('Erro ao limpar resultados: ' + (error.response?.data?.error || error.message));
    }
  };

  // Baixar relatório
  const downloadReport = async () => {
    try {
      const response = await axios.get(`${API_BASE}/report`);
      const report = response.data.report;
      
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json'
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rfid-test-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setError('Erro ao baixar relatório: ' + (error.response?.data?.error || error.message));
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return <CheckCircle className="status-icon online" />;
      case 'offline': return <XCircle className="status-icon offline" />;
      default: return <AlertCircle className="status-icon warning" />;
    }
  };

  const getTestStatusIcon = (test) => {
    if (test.tcpConnected) return <CheckCircle className="test-icon success" />;
    return <XCircle className="test-icon error" />;
  };

  return (
    <div className="rfid-printer-test">
      <div className="test-header">
        <h2>
          <Printer className="header-icon" />
          Teste de Impressora RFID Zebra ZD621R
        </h2>
        <div className="service-status">
          <span>Status do Serviço:</span>
          {getStatusIcon(status)}
          <span className={`status-text ${status}`}>
            {status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle className="error-icon" />
          {error}
        </div>
      )}

      <div className="test-controls">
        <div className="control-section">
          <h3>
            <Search className="section-icon" />
            Descoberta de Impressoras
          </h3>
          <div className="control-buttons">
            <button 
              onClick={discoverPrinters} 
              disabled={isLoading || status === 'offline'}
              className="btn btn-primary"
            >
              {isLoading ? <RefreshCw className="spinning" /> : <Wifi />}
              Descobrir Impressoras
            </button>
            <button 
              onClick={runFullTest} 
              disabled={isLoading || status === 'offline'}
              className="btn btn-secondary"
            >
              {isLoading ? <RefreshCw className="spinning" /> : <TestTube />}
              Teste Completo
            </button>
          </div>
        </div>

        <div className="control-section">
          <h3>
            <Printer className="section-icon" />
            Teste Manual
          </h3>
          <div className="manual-test">
            <input
              type="text"
              placeholder="IP da impressora (ex: 192.168.1.100)"
              value={manualIP}
              onChange={(e) => setManualIP(e.target.value)}
              className="ip-input"
            />
            <input
              type="number"
              placeholder="Porta"
              value={manualPort}
              onChange={(e) => setManualPort(e.target.value)}
              className="port-input"
            />
            <button 
              onClick={testManualPrinter}
              disabled={isLoading || status === 'offline'}
              className="btn btn-primary"
            >
              Testar
            </button>
          </div>
        </div>

        <div className="control-section">
          <h3>
            <Download className="section-icon" />
            Relatórios
          </h3>
          <div className="control-buttons">
            <button 
              onClick={downloadReport}
              disabled={testResults.length === 0}
              className="btn btn-secondary"
            >
              <Download />
              Baixar Relatório
            </button>
            <button 
              onClick={clearResults}
              disabled={testResults.length === 0}
              className="btn btn-danger"
            >
              <RefreshCw />
              Limpar Resultados
            </button>
          </div>
        </div>
      </div>

      {discoveredPrinters.length > 0 && (
        <div className="results-section">
          <h3>
            <Wifi className="section-icon" />
            Impressoras Descobertas ({discoveredPrinters.length})
          </h3>
          <div className="printers-grid">
            {discoveredPrinters.map((printer, index) => (
              <div key={index} className="printer-card">
                <div className="printer-info">
                  <h4>Impressora {index + 1}</h4>
                  <p><strong>IP:</strong> {printer.ip}</p>
                  <p><strong>Porta:</strong> {printer.port}</p>
                  <p><strong>Descoberta:</strong> {new Date(printer.timestamp).toLocaleString('pt-BR')}</p>
                </div>
                <button 
                  onClick={() => testPrinter(printer.ip, printer.port)}
                  disabled={isLoading}
                  className="btn btn-primary btn-sm"
                >
                  Testar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {testResults.length > 0 && (
        <div className="results-section">
          <h3>
            <TestTube className="section-icon" />
            Resultados dos Testes ({testResults.length})
          </h3>
          <div className="test-results">
            {testResults.map((result, index) => (
              <div key={index} className="test-result-card">
                <div className="result-header">
                  <h4>Teste {index + 1} - {result.ip}:{result.port}</h4>
                  {getTestStatusIcon(result.tests.tcp)}
                </div>
                
                <div className="test-details">
                  <div className="test-item">
                    <span className="test-label">Conectividade TCP:</span>
                    <span className={`test-value ${result.tests.tcp.tcpConnected ? 'success' : 'error'}`}>
                      {result.tests.tcp.tcpConnected ? '✅ OK' : '❌ FALHOU'}
                    </span>
                  </div>
                  
                  {result.tests.tcp.error && (
                    <div className="test-error">
                      Erro: {result.tests.tcp.error}
                    </div>
                  )}
                  
                  {result.tests.zpl && (
                    <div className="test-item">
                      <span className="test-label">Envio ZPL:</span>
                      <span className={`test-value ${result.tests.zpl.zplSent ? 'success' : 'error'}`}>
                        {result.tests.zpl.zplSent ? '✅ OK' : '❌ FALHOU'}
                      </span>
                    </div>
                  )}
                  
                  <div className="test-item">
                    <span className="test-label">Status HTTP:</span>
                    <span className={`test-value ${result.tests.http.httpStatus ? 'success' : 'warning'}`}>
                      {result.tests.http.httpStatus ? '✅ OK' : '⚠️ N/A'}
                    </span>
                  </div>
                  
                  <div className="test-item">
                    <span className="test-label">Modelo:</span>
                    <span className="test-value">{result.tests.info.model}</span>
                  </div>
                  
                  <div className="test-item">
                    <span className="test-label">Capacidades:</span>
                    <span className="test-value">{result.tests.info.capabilities.join(', ')}</span>
                  </div>
                </div>
                
                <div className="result-timestamp">
                  Testado em: {new Date(result.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

export default RFIDPrinterTest;
