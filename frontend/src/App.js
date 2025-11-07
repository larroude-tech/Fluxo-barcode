import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import HomePage from './components/HomePage';
import FileUpload from './components/FileUpload';
import PreviewSection from './components/PreviewSection';
import GenerateSection from './components/GenerateSection';
import PrinterConfig from './components/PrinterConfig';
import { ToastContainer, toast } from 'react-toastify';
import { Upload, Eye, Download } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './components/components.css';

function App() {
  const [excelData, setExcelData] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleFileUpload = (data) => {
    setExcelData(data);
    setPreviews([]);
    setCurrentStep(2);
    toast.success(`Arquivo processado com sucesso! ${data.length} registros encontrados.`);
  };

  const handlePreviewGenerated = (previewData) => {
    setPreviews(previewData);
    setCurrentStep(3);
    toast.success(`Preview gerado com ${previewData.length} etiquetas.`);
  };

  const handleGenerationComplete = (result) => {
    setIsGenerating(false);
    toast.success(`${result.totalLabels} etiquetas geradas com sucesso! (${result.totalItems} itens únicos)`);
  };

  const resetApp = () => {
    setExcelData(null);
    setPreviews([]);
    setCurrentStep(1);
    setIsGenerating(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage setActiveTab={setActiveTab} />;
      
      case 'labels':
        return (
          <div className="page-content">
            <div className="labels-section">
              {/* Indicador de Progresso */}
              <div className="progress-indicator">
                <div className={`step-indicator ${currentStep >= 1 ? 'active' : ''}`}>
                  <div className="step-number">1</div>
                  <span>Upload Excel</span>
                </div>
                <div className={`step-indicator ${currentStep >= 2 ? 'active' : ''}`}>
                  <div className="step-number">2</div>
                  <span>Preview</span>
                </div>
                <div className={`step-indicator ${currentStep >= 3 ? 'active' : ''}`}>
                  <div className="step-number">3</div>
                  <span>Gerar Etiquetas</span>
                </div>
              </div>

              {/* Passo 1: Upload do arquivo */}
              {currentStep === 1 && (
                <div className="step">
                  <div className="step-title">
                    <Upload size={20} />
                    Upload do Arquivo Excel
                  </div>
                  <FileUpload onFileUpload={handleFileUpload} />
                </div>
              )}

              {/* Passo 2: Preview das etiquetas */}
              {currentStep === 2 && excelData && (
                <div className="step">
                  <div className="step-title">
                    <Eye size={20} />
                    Preview das Etiquetas
                  </div>
                  <PreviewSection 
                    data={excelData} 
                    onPreviewGenerated={handlePreviewGenerated}
                  />
                  <div className="actions">
                    <button className="btn btn-secondary" onClick={resetApp}>
                      Voltar ao Upload
                    </button>
                  </div>
                </div>
              )}

              {/* Passo 3: Geração das etiquetas */}
              {currentStep === 3 && previews.length > 0 && (
                <div className="step">
                  <div className="step-title">
                    <Download size={20} />
                    Gerar Todas as Etiquetas
                  </div>
                  <GenerateSection 
                    data={excelData}
                    previews={previews}
                    onGenerationComplete={handleGenerationComplete}
                    isGenerating={isGenerating}
                    setIsGenerating={setIsGenerating}
                  />
                  <div className="actions">
                    <button className="btn btn-secondary" onClick={() => setCurrentStep(2)}>
                      Voltar ao Preview
                    </button>
                    <button className="btn btn-secondary" onClick={resetApp}>
                      Novo Arquivo
                    </button>
                  </div>
                </div>
              )}

              {/* Estatísticas */}
              {excelData && (
                <div className="stats">
                  <div className="stat-card">
                    <div className="stat-number">{excelData.length}</div>
                    <div className="stat-label">Total de Registros</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{previews.length}</div>
                    <div className="stat-label">Previews Gerados</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{currentStep}</div>
                    <div className="stat-label">Passo Atual</div>
                  </div>
                </div>
              )}

              {/* Gerenciador CSV */}
              <div className="csv-labels-section">
                <div className="csv-labels-card">
                  <h3>🏷️ Gerenciador Avançado de Etiquetas</h3>
                  <p>Acesse o gerenciador completo da Larroudé com lista de impressão individual e controle de quantidade:</p>
                  <button 
                    className="btn btn-primary csv-labels-link"
                    onClick={() => window.open('/csv-labels.html', '_blank')}
                  >
                    🏷️ Abrir Gerenciador de Etiquetas
                  </button>
                  <div className="csv-info">
                    <h4>Funcionalidades:</h4>
                    <ul>
                      <li>📋 Lista de todos os itens do CSV</li>
                      <li>🖨️ Impressão individual com controle de quantidade</li>
                      <li>🎯 Novo layout ZPL otimizado (PR2,2, sem RFID)</li>
                      <li>💰 Economia máxima de material</li>
                      <li>✅ Sistema sem VOID garantido</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="page-content">
            <PrinterConfig />
          </div>
        );

      // Relatórios e Documentação removidos - funcionalidades em desenvolvimento

      default:
        return <HomePage setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />
      
      <div className="main-content">
        <Header 
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeTab={activeTab}
        />
        
        <main className="content-area">
          {renderContent()}
        </main>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
}

export default App;