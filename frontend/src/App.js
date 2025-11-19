import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DataSelector from './components/FileUpload';
import PreviewSection from './components/PreviewSection';
import PrinterConfig from './components/PrinterConfig';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './components/components.css';

function App() {
  const [excelData, setExcelData] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState('labels');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDataLoaded = (data) => {
    setExcelData(data);
    setCurrentStep(2);
    if (data && data.length) {
      toast.success(`${data.length} registros carregados.`);
    }
  };

  const resetApp = () => {
    setExcelData(null);
    setCurrentStep(1);
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
            <span>Preview e Impressão</span>
          </div>
        </div>

        {/* Passo 1: Seleção da PO */}
        {currentStep === 1 && (
          <div className="step">
            <DataSelector onDataLoaded={handleDataLoaded} />
          </div>
        )}

        {/* Passo 2: Preview das etiquetas */}
        {currentStep === 2 && excelData && (
          <div className="step">
            <PreviewSection 
              data={excelData} 
              onBackToSelection={resetApp}
            />
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
        position="bottom-left"
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