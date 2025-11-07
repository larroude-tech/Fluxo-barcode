import React, { useState, useEffect } from 'react';
import './USBPrinterTest.css';

const USBPrinterTest = () => {
  const [ports, setPorts] = useState([]);
  const [printerPorts, setPrinterPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zplCommand, setZplCommand] = useState('^XA^FO50,50^A0N,50,50^FDTeste USB^FS^XZ');

  const API_BASE = 'http://localhost:3002/api';

  // Carregar portas disponíveis
  const loadPorts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/ports`);
      const data = await response.json();
      
      if (data.success) {
        setPorts(data.allPorts);
        setPrinterPorts(data.printerPorts);
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro ao carregar portas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Verificar status da conexão
  const checkConnectionStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/usb/info`);
      const data = await response.json();
      
      if (data.success) {
        setConnectionInfo(data.connectionInfo);
        setConnectionStatus(data.connectionInfo.isConnected ? 'connected' : 'disconnected');
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  };

  // Auto-conectar
  const autoConnect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/auto-connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConnectionInfo(data.connectionInfo);
        setConnectionStatus('connected');
        setSelectedPort(data.connectionInfo.portPath);
        setTestResult({
          success: true,
          message: 'Auto-conexão bem-sucedida!'
        });
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro na auto-conexão: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Conectar à porta específica
  const connectToPort = async () => {
    if (!selectedPort) {
      setError('Selecione uma porta');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          portPath: selectedPort
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConnectionInfo(data.connectionInfo);
        setConnectionStatus('connected');
        setTestResult({
          success: true,
          message: 'Conectado com sucesso!'
        });
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro na conexão: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Desconectar
  const disconnect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConnectionStatus('disconnected');
        setConnectionInfo(null);
        setTestResult({
          success: true,
          message: 'Desconectado com sucesso!'
        });
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro ao desconectar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Testar conectividade
  const testConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          portPath: selectedPort
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult(data.result);
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro no teste: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Enviar comando ZPL
  const sendZPL = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/usb/send-zpl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          zplCommand: zplCommand,
          portPath: selectedPort
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: 'Comando ZPL enviado com sucesso!'
        });
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Erro ao enviar ZPL: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Carregar portas ao montar o componente
  useEffect(() => {
    loadPorts();
    checkConnectionStatus();
  }, []);

  return (
    <div className="usb-printer-test">
      <h2>🖨️ Teste de Conexão USB - Impressora RFID</h2>
      
      {/* Status da Conexão */}
      <div className="connection-status">
        <h3>Status da Conexão</h3>
        <div className={`status-indicator ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '✅ Conectado' : '❌ Desconectado'}
        </div>
        {connectionInfo && (
          <div className="connection-info">
            <p><strong>Porta:</strong> {connectionInfo.portPath}</p>
            <p><strong>Última atualização:</strong> {new Date(connectionInfo.timestamp).toLocaleString('pt-BR')}</p>
          </div>
        )}
      </div>

      {/* Lista de Portas */}
      <div className="ports-section">
        <h3>🔍 Portas Disponíveis</h3>
        <button 
          onClick={loadPorts} 
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? '🔄 Carregando...' : '🔄 Atualizar Portas'}
        </button>
        
        <div className="ports-list">
          <h4>Todas as Portas ({ports.length})</h4>
          {ports.map((port, index) => (
            <div key={index} className={`port-item ${printerPorts.includes(port) ? 'printer-port' : ''}`}>
              <span className="port-icon">
                {printerPorts.includes(port) ? '🖨️' : '📡'}
              </span>
              <span className="port-path">{port.path}</span>
              <span className="port-manufacturer">
                {port.manufacturer || 'Desconhecido'}
              </span>
            </div>
          ))}
        </div>

        {printerPorts.length > 0 && (
          <div className="printer-ports">
            <h4>🖨️ Impressoras Detectadas ({printerPorts.length})</h4>
            {printerPorts.map((port, index) => (
              <div key={index} className="port-item printer-port">
                <span className="port-icon">🖨️</span>
                <span className="port-path">{port.path}</span>
                <span className="port-manufacturer">
                  {port.manufacturer || 'Zebra'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controles de Conexão */}
      <div className="connection-controls">
        <h3>🔌 Controles de Conexão</h3>
        
        <div className="control-group">
          <label htmlFor="port-select">Selecionar Porta:</label>
          <select 
            id="port-select"
            value={selectedPort} 
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={loading}
          >
            <option value="">Selecione uma porta...</option>
            {ports.map((port, index) => (
              <option key={index} value={port.path}>
                {port.path} - {port.manufacturer || 'Desconhecido'}
              </option>
            ))}
          </select>
        </div>

        <div className="button-group">
          <button 
            onClick={autoConnect} 
            disabled={loading || connectionStatus === 'connected'}
            className="btn btn-success"
          >
            🔍 Auto-Conectar
          </button>
          
          <button 
            onClick={connectToPort} 
            disabled={loading || !selectedPort || connectionStatus === 'connected'}
            className="btn btn-primary"
          >
            🔌 Conectar
          </button>
          
          <button 
            onClick={disconnect} 
            disabled={loading || connectionStatus === 'disconnected'}
            className="btn btn-warning"
          >
            🔌 Desconectar
          </button>
          
          <button 
            onClick={testConnection} 
            disabled={loading || connectionStatus === 'disconnected'}
            className="btn btn-info"
          >
            🧪 Testar Conexão
          </button>
        </div>
      </div>

      {/* Teste ZPL */}
      <div className="zpl-test">
        <h3>📤 Teste ZPL</h3>
        
        <div className="control-group">
          <label htmlFor="zpl-command">Comando ZPL:</label>
          <textarea
            id="zpl-command"
            value={zplCommand}
            onChange={(e) => setZplCommand(e.target.value)}
            placeholder="Digite o comando ZPL..."
            rows={4}
            disabled={loading || connectionStatus === 'disconnected'}
          />
        </div>

        <button 
          onClick={sendZPL} 
          disabled={loading || connectionStatus === 'disconnected'}
          className="btn btn-success"
        >
          📤 Enviar ZPL
        </button>
      </div>

      {/* Resultados */}
      {testResult && (
        <div className="test-results">
          <h3>📊 Resultados do Teste</h3>
          <div className={`result-card ${testResult.success ? 'success' : 'error'}`}>
            <h4>{testResult.success ? '✅ Sucesso' : '❌ Erro'}</h4>
            <p>{testResult.message || testResult.error}</p>
            {testResult.connectionInfo && (
              <div className="result-details">
                <p><strong>Porta:</strong> {testResult.connectionInfo.portPath}</p>
                <p><strong>Status:</strong> {testResult.connectionInfo.isConnected ? 'Conectado' : 'Desconectado'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="error-message">
          <h3>❌ Erro</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default USBPrinterTest;
