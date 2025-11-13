import React, { useState, useMemo, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AlertCircle, ZoomIn, Download, Info, Printer, List, Search, X, Grid3X3, LayoutList, Barcode, Package, Palette, Ruler, Hash, FileText, Settings } from 'lucide-react';
import { toast } from 'react-toastify';
import LabelLayoutEditor from './LabelLayoutEditor.js';
import './PrintList.css';

// Componente atualizado para exibir todas as etiquetas em tamanho real

const PreviewSection = ({ data, onPreviewGenerated }) => {
  const [singlePreview, setSinglePreview] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' ou 'list'
  const [listLayout, setListLayout] = useState('list'); // 'list' ou 'grid'
  const [printingItems, setPrintingItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [layoutEditorPreview, setLayoutEditorPreview] = useState(null);
  const [isPrintingAll, setIsPrintingAll] = useState(false);

  const previews = useMemo(() => {
    if (!singlePreview || !data || data.length === 0) {
      return [];
    }
    return [{ preview: singlePreview, data: data[0] }];
  }, [singlePreview, data]);

  const totalLabels = useMemo(() => {
    if (!data || data.length === 0) {
      return 0;
    }
    return data.reduce((sum, item) => sum + (parseInt(item.QTY, 10) || 1), 0);
  }, [data]);

  // Filtrar dados baseado no termo de pesquisa
  const filteredData = useMemo(() => {
    if (!data || !searchTerm.trim()) {
      return data || [];
    }

    const search = searchTerm.toLowerCase().trim();
    return data.filter(item => {
      // Buscar em todos os campos principais
      const searchableFields = [
        item.STYLE_NAME,
        item.VPN,
        item.COLOR,
        item.SIZE,
        item.QTY?.toString(),
        // Adicionar outros campos se existirem
        item.BRAND,
        item.CATEGORY,
        item.DESCRIPTION
      ];

      return searchableFields.some(field => 
        field && field.toString().toLowerCase().includes(search)
      );
    });
  }, [data, searchTerm]);

  // Limpar pesquisa
  const clearSearch = () => {
    setSearchTerm('');
  };

  // Abrir modal de detalhes
  const openDetailsModal = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

  // Fechar modal de detalhes
  const closeDetailsModal = () => {
    setSelectedItem(null);
    setShowDetailsModal(false);
  };

  // Gerar barcode do item
  const generateBarcode = (item) => {
    return item.BARCODE || item.VPN?.replace(/-/g, '')?.substring(0, 12) || 'N/A';
  };

  const normalizeItems = useCallback((items) => {
    return (items || []).map((row) => {
      const sku = (row.SKU || row.VPN || '').toString().trim();
      const skuParts = sku.split('-');
      const rawSize = (row.SIZE || (skuParts.length >= 3 ? skuParts[2] : '') || '').toString().trim();
      const size = rawSize.replace(',', '.');
      const colorCode = skuParts.length >= 4 ? skuParts[3] : '';
      const color = row.COLOR || colorCode;
      
      if (row.PO) {
        console.log(`🔍 Frontend normalizeItems - PO: "${row.PO}"`);
      }
      
      return {
        ...row,
        SKU: sku,
        SIZE: size || row.SIZE || '',
        COLOR: color,
        PO: row.PO || '',
        LOCAL: row.LOCAL || ''
      };
    });
  }, []);

  const fetchSinglePreview = useCallback(async (item) => {
    const normalized = normalizeItems([item]);
    const response = await axios.post('/api/generate-preview', {
      data: normalized
    }, {
      timeout: 30000
    });
    const previewImage = response.data?.previews?.[0]?.preview || null;
    return previewImage;
  }, [normalizeItems]);

  useEffect(() => {
    let cancelled = false;

    const loadSinglePreview = async () => {
      if (!data || data.length === 0) {
        setSinglePreview(null);
        setLayoutEditorPreview(null);
        return;
      }
      
      try {
        const previewImage = await fetchSinglePreview(data[0]);
        if (!cancelled) {
          setSinglePreview(previewImage);
          setLayoutEditorPreview(previewImage);
        }
      } catch (error) {
        console.warn('Não foi possível carregar preview da etiqueta:', error);
        if (!cancelled) {
          setSinglePreview(null);
          setLayoutEditorPreview(null);
        }
      }
    };

    loadSinglePreview();

    return () => {
      cancelled = true;
    };
  }, [data, fetchSinglePreview]);

  const openModal = (preview, index) => {
    console.log('DEBUG: openModal chamado', { preview, index });
    console.log('DEBUG: preview.preview:', preview.preview);
    console.log('DEBUG: data[index]:', data[index]);
    const previewData = preview.data || data?.[index];
    setSelectedPreview({ preview: preview.preview, index, data: previewData });
    setShowModal(true);
    console.log('DEBUG: showModal definido como true');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPreview(null);
  };

  const downloadPreview = (preview, index) => {
    const link = document.createElement('a');
    link.href = preview.preview;
    link.download = `preview-etiqueta-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Preview baixado com sucesso!');
  };

  const handlePrintAll = async () => {
    if (!data || data.length === 0) {
      toast.error('Nenhum dado disponível para impressão.');
      return;
    }

    const confirmation = window.confirm(
      `Esta ação enviará ${totalLabels} etiqueta(s) para a impressora.
Confirma a impressão agora?`
    );

    if (!confirmation) {
      return;
    }

    setIsPrintingAll(true);
    setError(null);

    try {
      const normalized = normalizeItems(data);
      const response = await axios.post('/api/print-all', {
        data: normalized
      }, {
        timeout: 300000
      });

      const successCount = response.data?.successCount ?? 0;
      const totalCount = response.data?.totalEtiquetas ?? totalLabels;

      if (successCount === totalCount && totalCount > 0) {
        toast.success(`✅ ${successCount} etiqueta(s) enviadas para impressão.`);
      } else if (totalCount > 0) {
        toast.warning(`${successCount}/${totalCount} etiquetas foram enviadas. Verifique o relatório.`);
      } else {
        toast.info('Nenhuma etiqueta foi processada.');
      }
    } catch (error) {
      console.error('Erro ao imprimir todas as etiquetas:', error);
      const message = error.response?.data?.error || error.message || 'Erro ao imprimir todas as etiquetas.';
      setError(message);
      toast.error(
        <div>
          <strong>Erro ao Imprimir Todas</strong>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>{message}</p>
        </div>
      );
    } finally {
      setIsPrintingAll(false);
    }
  };

  const printIndividualLabel = async (itemData, index) => {
    // Perguntar quantas etiquetas imprimir
    const quantity = prompt(
      `Quantas etiquetas de "${itemData.STYLE_NAME}" deseja imprimir?\n\n` +
      `Produto: ${itemData.STYLE_NAME}\n` +
      `VPN: ${itemData.VPN}\n` +
      `Cor: ${itemData.COLOR}\n` +
      `Tamanho: ${itemData.SIZE}\n\n` +
      `Digite a quantidade (recomendado: 1 para testes):`,
      '1'
    );
    
    // Verificar se usuário cancelou ou não digitou nada
    if (quantity === null) {
      return; // Usuário cancelou
    }
    
    // Validar quantidade
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0 || qty > 100) {
      toast.error('Quantidade inválida! Digite um número entre 1 e 100.');
      return;
    }
    
    // Confirmar impressão
    const confirmMessage = qty === 1 
      ? `Confirma impressão de 1 etiqueta de "${itemData.STYLE_NAME}"?`
      : `Confirma impressão de ${qty} etiquetas de "${itemData.STYLE_NAME}"?\n\nATENÇÃO: Isso consumirá ${qty} etiquetas físicas!`;
      
    if (!window.confirm(confirmMessage)) {
      return; // Usuário cancelou confirmação
    }

    const itemId = `${index}`;
    setPrintingItems(prev => new Set(prev).add(itemId));
    
    try {
      console.log(`Imprimindo ${qty} etiqueta(s):`, itemData);
      
      // Criar array com o item repetido pela quantidade solicitada
      const printData = Array(qty).fill(itemData);
      
      const response = await axios.post('/api/print-individual', {
        data: printData,
        quantity: qty
      });

      if (response.data && response.data.results) {
        const successCount = response.data.successCount || 0;
        const totalCount = response.data.totalItems || qty;
        
        if (successCount === totalCount) {
          toast.success(
            qty === 1 
              ? `Etiqueta "${itemData.STYLE_NAME}" impressa com sucesso! (SEM VOID)`
              : `${successCount} etiquetas de "${itemData.STYLE_NAME}" impressas com sucesso! (SEM VOID)`
          );
        } else {
          toast.warning(`${successCount}/${totalCount} etiquetas impressas. Verifique os resultados.`);
        }
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (error) {
      console.error('Erro ao imprimir etiqueta:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao imprimir etiqueta. Verifique se a impressora está conectada.';
      
      // Mostrar popup de erro detalhado
      toast.error(
        <div>
          <strong>Erro na Impressão</strong>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>{errorMessage}</p>
          <p style={{ margin: '8px 0', fontSize: '12px', color: '#666' }}>
            Verifique se a impressora está conectada e tente novamente.
          </p>
        </div>,
        { 
          autoClose: 6000,
          style: { fontSize: '14px' }
        }
      );
    } finally {
      setPrintingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };
 
  return (
    <>
      <LabelLayoutEditor
        isOpen={showLayoutEditor}
        onClose={() => setShowLayoutEditor(false)}
        previewImage={layoutEditorPreview}
        onSaveLayout={async (layout) => {
          try {
            await axios.post('/api/layout/save', { layout });
            toast.success('Layout salvo! As próximas impressões usarão este layout.');
          } catch (error) {
            toast.error('Erro ao salvar layout');
          }
        }}
      />
      
      <div className="card">
      <div className="preview-controls">
        <div className="control-buttons">
          {data && data.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  if (!data || data.length === 0) {
                    toast.warn('Nenhum dado disponível para gerar preview do layout.');
                    return;
                  }

                  if (singlePreview) {
                    setLayoutEditorPreview(singlePreview);
                    setShowLayoutEditor(true);
                    return;
                  }

                  try {
                    const previewImage = await fetchSinglePreview(data[0]);
                    if (previewImage) {
                      setSinglePreview(previewImage);
                      setLayoutEditorPreview(previewImage);
                    } else {
                      setLayoutEditorPreview(null);
                      toast.warn('Preview não retornou imagem, abrindo editor sem preview.');
                    }
                  } catch (previewError) {
                    console.warn('Erro ao gerar preview para editor, abrindo editor sem preview:', previewError);
                    setLayoutEditorPreview(null);
                    toast.info('Editor aberto sem preview. Você pode ajustar o layout mesmo sem impressora conectada.');
                  }

                  setShowLayoutEditor(true);
                } catch (error) {
                  console.error('Erro ao abrir editor:', error);
                  toast.error(
                    <div>
                      <strong>Erro ao Abrir Editor</strong>
                      <p style={{ margin: '8px 0', fontSize: '14px' }}>
                        {error.message || 'Erro desconhecido'}
                      </p>
                      <p style={{ margin: '8px 0', fontSize: '12px', color: '#666' }}>
                        Tentando abrir editor sem preview...
                      </p>
                    </div>,
                    { autoClose: 5000 }
                  );

                  try {
                    setLayoutEditorPreview(null);
                    setShowLayoutEditor(true);
                  } catch (e) {
                    toast.error('Não foi possível abrir o editor de layout.');
                  }
                }
              }}
              title="Editar layout e posicionamento da etiqueta"
            >
              <Settings size={16} />
              Editar Layout
            </button>
          )}

          {data && (
            <div className="view-mode-toggle">
              <button
                className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('list')}
              >
                <List size={16} />
                Lista para Impressão
              </button>
            </div>
          )}

          {/* Layout toggle para modo lista */}
          {data && viewMode === 'list' && (
            <div className="layout-toggle">
              <button 
                className={`btn btn-icon ${listLayout === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setListLayout('list')}
                title="Visualização em Lista"
              >
                <LayoutList size={16} />
              </button>
              <button 
                className={`btn btn-icon ${listLayout === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setListLayout('grid')}
                title="Visualização em Grid"
              >
                <Grid3X3 size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {data && (
        <div className="info">
          <p>
            <strong>Total de registros:</strong> {data.length} itens únicos
          </p>
          {totalLabels > 0 && (
            <p>
              <strong>Total de etiquetas:</strong> {totalLabels} etiquetas serão geradas (baseado no campo QTY)
            </p>
          )}
          <p>
            <strong>Modo atual:</strong> {viewMode === 'list' ? 'Lista para impressão individual' : 'Preview visual das etiquetas'}
          </p>
        </div>
      )}

      {/* Lista de itens para impressão individual */}
      {data && viewMode === 'list' && (
        <div className="items-list">
          <div className="list-header">
            <div className="header-top">
              <h3>
                <List size={20} />
                Lista para Impressão ({filteredData.length} {filteredData.length === 1 ? 'item' : 'itens'})
              </h3>
              
              {/* Layout toggle */}
              <div className="layout-toggle">
                <button 
                  className={`btn btn-icon ${listLayout === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setListLayout('list')}
                  title="Visualização em Lista"
                >
                  <LayoutList size={16} />
                </button>
                <button 
                  className={`btn btn-icon ${listLayout === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setListLayout('grid')}
                  title="Visualização em Grid"
                >
                  <Grid3X3 size={16} />
                </button>
              </div>
            </div>
            
            {/* Campo de pesquisa */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Pesquisar por produto, VPN, cor, tamanho, barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                {searchTerm && (
                  <button
                    onClick={clearSearch}
                    className="clear-search-btn"
                    title="Limpar pesquisa"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              
              {/* Contador de resultados */}
              <div className="search-results-count">
                {searchTerm ? (
                  <>
                    <span className="results-found">{filteredData.length}</span>
                    <span className="results-text">de {data.length} itens</span>
                  </>
                ) : (
                  <>
                    <span className="results-total">{data.length}</span>
                    <span className="results-text">itens totais</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {listLayout === 'list' ? (
            // Layout em Lista
            <div className="items-table">
              <div className="table-header">
                <div className="header-cell">Item</div>
                <div className="header-cell">Produto</div>
                <div className="header-cell">VPN</div>
                <div className="header-cell">Barcode</div>
                <div className="header-cell">Cor</div>
                <div className="header-cell">Tamanho</div>
                <div className="header-cell">PO</div>
                <div className="header-cell">Qtd</div>
                <div className="header-cell">Ações</div>
              </div>
              {filteredData.map((item, index) => {
                const originalIndex = data.findIndex(originalItem => originalItem === item);
                const itemId = `${originalIndex}`;
                const isPrinting = printingItems.has(itemId);
                const barcode = generateBarcode(item);
                
                return (
                  <div key={index} className="table-row">
                    <div className="table-cell">{index + 1}</div>
                    <div className="table-cell">
                      <div className="item-info">
                        <strong>{item.STYLE_NAME || 'N/A'}</strong>
                        {item.BRAND && <div className="item-brand">{item.BRAND}</div>}
                      </div>
                    </div>
                    <div className="table-cell">
                      <code className="vpn-code">{item.VPN || 'N/A'}</code>
                    </div>
                    <div className="table-cell">
                      <div className="barcode-display">
                        <Barcode size={14} />
                        <code>{barcode}</code>
                      </div>
                    </div>
                    <div className="table-cell">
                      <span className="color-badge" style={{
                        backgroundColor: item.COLOR?.toLowerCase() === 'white' ? '#f8f9fa' : item.COLOR?.toLowerCase(),
                        color: item.COLOR?.toLowerCase() === 'white' || !item.COLOR ? '#333' : '#fff',
                        border: item.COLOR?.toLowerCase() === 'white' ? '1px solid #dee2e6' : 'none'
                      }}>
                        {item.COLOR || 'N/A'}
                      </span>
                    </div>
                    <div className="table-cell">{item.SIZE || 'N/A'}</div>
                    <div className="table-cell">{item.PO ? `PO${item.PO}` : 'N/A'}</div>
                    <div className="table-cell">
                      <span className="qty-badge">{item.QTY || 1}</span>
                    </div>
                    <div className="table-cell">
                      <div className="action-buttons">
                        <button
                          className="btn btn-info btn-sm"
                          onClick={() => openDetailsModal(item)}
                          title="Ver detalhes"
                        >
                          <Info size={14} />
                        </button>
                        <button
                          className="btn btn-print"
                          onClick={() => printIndividualLabel(item, originalIndex)}
                          disabled={isPrinting}
                          title={`Imprimir ${item.QTY || 1} etiqueta(s) de ${item.STYLE_NAME}`}
                        >
                          {isPrinting ? (
                            <>
                              <div className="spinner-small"></div>
                              Imprimindo...
                            </>
                          ) : (
                            <>
                              <Printer size={16} />
                              Imprimir
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Layout em Grid
            <div className="items-grid">
              {filteredData.map((item, index) => {
                const originalIndex = data.findIndex(originalItem => originalItem === item);
                const itemId = `${originalIndex}`;
                const isPrinting = printingItems.has(itemId);
                const barcode = generateBarcode(item);

                return (
                  <div key={index} className="grid-item">
                    <div className="grid-item-header">
                      <h4 className="item-title">{item.STYLE_NAME || 'N/A'}</h4>
                      <button
                        className="btn btn-info btn-sm"
                        onClick={() => openDetailsModal(item)}
                        title="Ver detalhes"
                      >
                        <Info size={14} />
                      </button>
                    </div>
                    
                    <div className="grid-item-content">
                      <div className="item-field">
                        <FileText size={14} />
                        <span className="field-label">VPN:</span>
                        <code className="field-value">{item.VPN || 'N/A'}</code>
                      </div>
                      
                      <div className="item-field">
                        <Barcode size={14} />
                        <span className="field-label">Barcode:</span>
                        <code className="field-value">{barcode}</code>
                      </div>
                      
                      <div className="item-field">
                        <Palette size={14} />
                        <span className="field-label">Cor:</span>
                        <span className="color-badge small" style={{
                          backgroundColor: item.COLOR?.toLowerCase() === 'white' ? '#f8f9fa' : item.COLOR?.toLowerCase(),
                          color: item.COLOR?.toLowerCase() === 'white' || !item.COLOR ? '#333' : '#fff',
                          border: item.COLOR?.toLowerCase() === 'white' ? '1px solid #dee2e6' : 'none'
                        }}>
                          {item.COLOR || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="item-field">
                        <Ruler size={14} />
                        <span className="field-label">Tamanho:</span>
                        <span className="field-value">{item.SIZE || 'N/A'}</span>
                      </div>
                      
                      <div className="item-field">
                        <Hash size={14} />
                        <span className="field-label">Quantidade:</span>
                        <span className="qty-badge">{item.QTY || 1}</span>
                      </div>
                      
                      {item.PO && (
                        <div className="item-field">
                          <Hash size={14} />
                          <span className="field-label">PO:</span>
                          <span className="field-value">PO{item.PO}</span>
                        </div>
                      )}
                      
                    </div>
                    
                    <div className="grid-item-footer">
                      <button
                        className="btn btn-print btn-block"
                        onClick={() => printIndividualLabel(item, originalIndex)}
                        disabled={isPrinting}
                        title={`Imprimir ${item.QTY || 1} etiqueta(s) de ${item.STYLE_NAME}`}
                      >
                        {isPrinting ? (
                          <>
                            <div className="spinner-small"></div>
                            Imprimindo...
                          </>
                        ) : (
                          <>
                            <Printer size={16} />
                            Imprimir {item.QTY || 1} etiqueta{(item.QTY || 1) > 1 ? 's' : ''}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bulk-actions">
            <button
              className="btn btn-primary"
              onClick={handlePrintAll}
              disabled={isPrintingAll}
            >
              <Printer size={16} />
              {isPrintingAll ? 'Imprimindo todas...' : `Imprimir todas (${totalLabels})`}
              {isPrintingAll && <div className="spinner-small" style={{ marginLeft: '8px' }}></div>}
            </button>
          </div>
          <div className="list-summary">
            <p>
              <strong>Exibindo:</strong> {filteredData.length} itens 
              {searchTerm && <span> (filtrados de {data.length} totais)</span>} • 
              <strong> Etiquetas:</strong> {filteredData.reduce((sum, item) => sum + (parseInt(item.QTY) || 1), 0)}
              {searchTerm && (
                <span className="search-info">
                  {' • '}
                  <strong>Pesquisando por:</strong> "{searchTerm}"
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Modal de visualização ampliada */}
      {showModal && selectedPreview && (
        console.log('DEBUG: Renderizando modal', { showModal, selectedPreview }) ||
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Etiqueta {selectedPreview.index + 1} - {selectedPreview.data?.STYLE_NAME}</h3>
              <button className="btn btn-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-image">
                <img
                  src={selectedPreview.preview}
                  alt={`Preview ampliado da etiqueta ${selectedPreview.index + 1}`}
                />
              </div>
              <div className="modal-details">
                <div className="detail-grid">
                  <div className="detail-item">
                    <Info size={16} />
                    <div>
                      <strong>Produto:</strong>
                      <span>{selectedPreview.data?.STYLE_NAME || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Info size={16} />
                    <div>
                      <strong>VPN:</strong>
                      <span>{selectedPreview.data?.VPN || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Info size={16} />
                    <div>
                      <strong>Cor:</strong>
                      <span>{selectedPreview.data?.COLOR || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Info size={16} />
                    <div>
                      <strong>Tamanho:</strong>
                      <span>{selectedPreview.data?.SIZE || 'N/A'}</span>
                    </div>
                  </div>
                  {selectedPreview.data?.PO && (
                    <div className="detail-item">
                      <Info size={16} />
                      <div>
                        <strong>PO:</strong>
                        <span>PO{selectedPreview.data.PO}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => downloadPreview({ preview: selectedPreview.preview }, selectedPreview.index)}
                  >
                    <Download size={16} />
                    Baixar Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Item */}
      {showDetailsModal && selectedItem && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Package size={20} />
                Detalhes do Item
              </h3>
              <button 
                className="modal-close-btn"
                onClick={closeDetailsModal}
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-section">
                  <h4>
                    <FileText size={16} />
                    Informações Básicas
                  </h4>
                  <div className="detail-item">
                    <span className="detail-label">Nome do Produto:</span>
                    <span className="detail-value">{selectedItem.STYLE_NAME || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">VPN:</span>
                    <code className="detail-code">{selectedItem.VPN || 'N/A'}</code>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Barcode:</span>
                    <div className="barcode-detail">
                      <Barcode size={16} />
                      <code className="detail-code">{generateBarcode(selectedItem)}</code>
                    </div>
                  </div>
                  {selectedItem.BRAND && (
                    <div className="detail-item">
                      <span className="detail-label">Marca:</span>
                      <span className="detail-value">{selectedItem.BRAND}</span>
                    </div>
                  )}
                  {selectedItem.CATEGORY && (
                    <div className="detail-item">
                      <span className="detail-label">Categoria:</span>
                      <span className="detail-value">{selectedItem.CATEGORY}</span>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h4>
                    <Palette size={16} />
                    Especificações
                  </h4>
                  <div className="detail-item">
                    <span className="detail-label">Cor:</span>
                    <div className="color-detail">
                      <span className="color-badge" style={{
                        backgroundColor: selectedItem.COLOR?.toLowerCase() === 'white' ? '#f8f9fa' : selectedItem.COLOR?.toLowerCase(),
                        color: selectedItem.COLOR?.toLowerCase() === 'white' || !selectedItem.COLOR ? '#333' : '#fff',
                        border: selectedItem.COLOR?.toLowerCase() === 'white' ? '1px solid #dee2e6' : 'none'
                      }}>
                        {selectedItem.COLOR || 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Tamanho:</span>
                    <span className="detail-value size-value">{selectedItem.SIZE || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Quantidade:</span>
                    <span className="qty-badge large">{selectedItem.QTY || 1}</span>
                  </div>
                  {selectedItem.PO && (
                    <div className="detail-item">
                      <span className="detail-label">PO:</span>
                      <span className="po-badge">PO{selectedItem.PO}</span>
                    </div>
                  )}
                </div>

                {/* Informações adicionais se existirem */}
                {(selectedItem.DESCRIPTION || selectedItem.MATERIAL || selectedItem.SEASON) && (
                  <div className="detail-section">
                    <h4>
                      <Info size={16} />
                      Informações Adicionais
                    </h4>
                    {selectedItem.DESCRIPTION && (
                      <div className="detail-item">
                        <span className="detail-label">Descrição:</span>
                        <span className="detail-value">{selectedItem.DESCRIPTION}</span>
                      </div>
                    )}
                    {selectedItem.MATERIAL && (
                      <div className="detail-item">
                        <span className="detail-label">Material:</span>
                        <span className="detail-value">{selectedItem.MATERIAL}</span>
                      </div>
                    )}
                    {selectedItem.SEASON && (
                      <div className="detail-item">
                        <span className="detail-label">Temporada:</span>
                        <span className="detail-value">{selectedItem.SEASON}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="detail-section">
                  <h4>
                    <Printer size={16} />
                    Informações de Impressão
                  </h4>
                  <div className="detail-item">
                    <span className="detail-label">Etiquetas a imprimir:</span>
                    <span className="qty-badge large">{selectedItem.QTY || 1}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Dados RFID:</span>
                    <code className="detail-code rfid-preview">
                      {generateBarcode(selectedItem)}464100000000
                    </code>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status:</span>
                    <span className="status-badge ready">Pronto para impressão</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={closeDetailsModal}
              >
                Fechar
              </button>
              <button 
                className="btn btn-print"
                onClick={() => {
                  const originalIndex = data.findIndex(item => item === selectedItem);
                  printIndividualLabel(selectedItem, originalIndex);
                  closeDetailsModal();
                }}
                title={`Imprimir ${selectedItem.QTY || 1} etiqueta(s)`}
              >
                <Printer size={16} />
                Imprimir {selectedItem.QTY || 1} etiqueta{(selectedItem.QTY || 1) > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default PreviewSection;