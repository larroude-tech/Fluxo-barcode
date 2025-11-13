import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DataSelector from './components/FileUpload';
import PreviewSection from './components/PreviewSection';
import GenerateSection from './components/GenerateSection';
import PrinterConfig from './components/PrinterConfig';
import { ToastContainer, toast } from 'react-toastify';
import { Database, Eye, Download } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './components/components.css';

function App() {
  const [excelData, setExcelData] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState('labels');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDataLoaded = (data) => {
    setExcelData(data);
    setPreviews([]);
    setCurrentStep(2);
    if (data && data.length) {
      toast.success(`${data.length} registros carregados.`);
    } else {
      toast.warn('Nenhum registro encontrado para a seleção atual.');
    }
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

  const renderLabelsPage = () => (
    <div className="page-content">
      <div className="labels-section">
        {/* Indicador de Progresso */}
        <div className="progress-indicator">
          <div className={`step-indicator ${currentStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <span>Selecione a PO</span>
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

        {/* Passo 1: Seleção da PO */}
        {currentStep === 1 && (
          <div className="step">
            <div className="step-title">
              <Database size={20} />
              Selecione a PO
            </div>
            <DataSelector onDataLoaded={handleDataLoaded} />
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
                Voltar à Seleção
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
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'labels':
        return renderLabelsPage();

      case 'config':
        return (
          <div className="page-content">
            <PrinterConfig />
          </div>
        );

      default:
        return renderLabelsPage();
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