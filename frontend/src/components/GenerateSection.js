import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, AlertCircle, CheckCircle, Clock, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config';

const GenerateSection = ({ 
  data, 
  previews, 
  onGenerationComplete, 
  isGenerating, 
  setIsGenerating 
}) => {
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  const [generationStats, setGenerationStats] = useState(null);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(null);
  
  // Calcular total de etiquetas baseado no campo QTY
  const totalLabels = data ? data.reduce((total, item) => {
    const qty = parseInt(item.QTY) || 1;
    return total + qty;
  }, 0) : 0;

  // Simular progresso durante a geração
  useEffect(() => {
    let progressInterval;
    
    if (isGenerating && !downloadUrl) {
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev; // Parar em 95% até a resposta real
          return prev + Math.random() * 3 + 1; // Incremento aleatório entre 1-4%
        });
      }, 200);
    }
    
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, [isGenerating, downloadUrl]);

  const normalizeItems = (items) => {
    return (items || []).map((row) => {
      const sku = (row.SKU || row.VPN || '').toString().trim();
      const skuParts = sku.split('-');
      const rawSize = (row.SIZE || (skuParts.length >= 3 ? skuParts[2] : '') || '').toString().trim();
      const size = rawSize.replace(',', '.');
      const colorCode = skuParts.length >= 4 ? skuParts[3] : '';
      const color = row.COLOR || colorCode;
      
      return {
        ...row,
        SKU: sku,
        SIZE: size || row.SIZE || '',
        COLOR: color,
        // Garantir que PO e LOCAL sejam preservados
        PO: row.PO || '',
        LOCAL: row.LOCAL || ''
      };
    });
  };

  const generateAllLabels = async () => {
    setIsGenerating(true);
    setError(null);
    setDownloadUrl(null);
    setGenerationStats(null);
    setProgress(0);
    
    // Simular progresso baseado no número real de etiquetas
    const estimatedTimePerLabel = 0.5; // 0.5 segundos por etiqueta
    setEstimatedTime(Math.ceil(totalLabels * estimatedTimePerLabel));

    try {
      const normalized = normalizeItems(data);
      const response = await axios.post(`${API_BASE_URL}/generate-labels`, {
        data: normalized
      }, {
        timeout: 300000 // 5 minutos de timeout
      });

      if (response.data && response.data.downloadUrl) {
        setProgress(100); // Completar progresso
        setDownloadUrl(response.data.downloadUrl);
        setGenerationStats({
          totalLabels: response.data.totalLabels,
          message: response.data.message
        });
        onGenerationComplete(response.data);
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (error) {
      console.error('Erro ao gerar etiquetas:', error);
      const errorMessage = error.response?.data?.error || 'Erro ao gerar etiquetas';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
      toast.success('Download iniciado!');
    }
  };

  return (
    <div className="card">
      {previews && previews.length > 0 && (
        <div className="preview-section">
          <h3>Previews das Etiquetas</h3>
          <div className="preview-vertical-list">
            {previews.map((preview, index) => (
              <div key={index} className="label-preview-vertical">
                <div className="preview-image-container-large">
                  <img
                    src={preview.preview}
                    alt={`Preview da etiqueta ${index + 1}`}
                    className="preview-image-large"
                  />
                </div>
              </div>
            ))}
          </div>
          
        </div>
      )}

      {error && (
        <div className="error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {generationStats && (
        <div className="success">
          <CheckCircle size={16} />
          {generationStats.message}
        </div>
      )}

      <div className="generate-actions">
        {!downloadUrl && !isGenerating && (
          <button
            className="btn btn-primary btn-large"
            onClick={generateAllLabels}
            disabled={!data || data.length === 0}
          >
            <Download size={20} />
            Gerar Todas as Etiquetas ({data?.length || 0})
          </button>
        )}

        {isGenerating && (
          <div className="generating-status">
            <div className="progress-container">
              <div className="progress-header">
                <div className="spinner-large"></div>
                <div className="generating-text">
                  <h4>Gerando etiquetas...</h4>
                  <p>Processando {data?.length || 0} etiquetas</p>
                </div>
              </div>
              
              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="progress-text">{Math.round(progress)}%</div>
              </div>
              
              <div className="progress-details">
                <div className="progress-item">
                  <Clock size={16} />
                  <span>Tempo estimado: {estimatedTime ? `${estimatedTime}s` : 'Calculando...'}</span>
                </div>
                <div className="progress-item">
                  <FileText size={16} />
                  <span>Etiquetas: {Math.ceil((progress / 100) * (data?.length || 0))} de {data?.length || 0}</span>
                </div>
              </div>
              
              <div className="progress-info">
                <small>Por favor, não feche esta página durante o processo.</small>
              </div>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="download-ready">
            <div className="download-success">
              <CheckCircle size={24} color="#10b981" />
              <h4>Etiquetas geradas com sucesso!</h4>
              <p>Seu arquivo ZIP está pronto para download.</p>
            </div>
            <button
              className="btn btn-success btn-large"
              onClick={handleDownload}
            >
              <Download size={20} />
              Baixar Etiquetas (ZIP)
            </button>
            <div className="download-info">
              <small>
                O arquivo contém {generationStats?.totalLabels || data?.length} etiquetas em formato ZPL.
              </small>
            </div>
          </div>
        )}
      </div>

      <div className="info">
        <h4>Informações sobre a geração:</h4>
        <ul>
          <li>Cada etiqueta será gerada como um arquivo ZPL individual</li>
          <li>Todos os arquivos ZPL serão compactados em um arquivo ZIP</li>
          <li>O arquivo incluirá QR codes e códigos de barras</li>
          <li>O layout seguirá o padrão mostrado no preview</li>
          <li>Arquivos ZPL são compatíveis com impressoras Zebra</li>
        </ul>
      </div>
    </div>
  );
};

export default GenerateSection;