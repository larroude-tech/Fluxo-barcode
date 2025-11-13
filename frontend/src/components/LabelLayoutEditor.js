import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Move, Save, Type, Image as ImageIcon, X, Loader2, FolderOpen, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import './components.css';

const LABEL_WIDTH = 831;
const LABEL_HEIGHT = 376;

const SAMPLE_LABEL = {
  STYLE_NAME: 'Produto Exemplo',
  VPN: 'ABC-123-RED-38',
  DESCRIPTION: 'Leather Upper / Red',
  COLOR: 'RED',
  SIZE: '38',
  QTY: '1',
  PO: 'PO001',
  BARCODE: '197416229924'
};

const defaultLayout = () => ({
  paper: {
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    margin: { top: 18, right: 18, bottom: 18, left: 18 }
  },
  elements: [
    {
      id: 'styleName',
      type: 'text',
      label: 'Nome do Produto',
      valueKey: 'STYLE_NAME',
      x: 48,
      y: 60,
      fontSize: 28,
      fontWeight: 'bold',
      align: 'left'
    },
    {
      id: 'vpn',
      type: 'text',
      label: 'VPN',
      valueKey: 'VPN',
      x: 48,
      y: 110,
      fontSize: 22,
      fontWeight: 'normal',
      align: 'left'
    },
    {
      id: 'colorSize',
      type: 'text',
      label: 'Material / Color',
      valueKey: 'DESCRIPTION',
      x: 48,
      y: 150,
      fontSize: 22,
      fontWeight: 'normal',
      align: 'left'
    },
    {
      id: 'barcode',
      type: 'barcode',
      label: 'Código de barras',
      valueKey: 'BARCODE',
      x: 48,
      y: 200,
      width: 360,
      height: 92,
      humanReadable: true
    },
    {
      id: 'qty',
      type: 'text',
      label: 'Qtd',
      valueKey: 'QTY',
      x: 460,
      y: 120,
      fontSize: 60,
      fontWeight: 'bold',
      align: 'center'
    },
    {
      id: 'po',
      type: 'text',
      label: 'PO',
      valueKey: 'PO',
      x: 460,
      y: 195,
      fontSize: 26,
      fontWeight: 'normal',
      align: 'center'
    }
  ]
});

const drawLayout = (ctx, layout, data, options = {}) => {
  if (!ctx || !layout) {
    return;
  }

  const {
    skipClear = false,
    drawBackground = true,
    overlayAlpha = 1
  } = options;

  if (!skipClear) {
    ctx.clearRect(0, 0, layout.paper.width, layout.paper.height);
  }

  if (drawBackground) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, layout.paper.width, layout.paper.height);

    const { margin } = layout.paper;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      margin.left,
      margin.top,
      layout.paper.width - margin.left - margin.right,
      layout.paper.height - margin.top - margin.bottom
    );
  }

  ctx.save();
  ctx.globalAlpha = overlayAlpha;

  layout.elements.forEach((element) => {
    if (!element) {
      return;
    }
    const rawValue = element.valueKey ? data[element.valueKey] : '';

    if (element.type === 'text') {
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = element.align || 'left';
      ctx.textBaseline = 'top';
      const weight = element.fontWeight === 'bold' ? 'bold ' : '';
      ctx.font = `${weight}${element.fontSize || 20}px Arial`;

      let value = rawValue || '';

      if (element.id === 'colorSize') {
        const description = data.DESCRIPTION || '';
        const fallback = `${data.COLOR || ''}${data.COLOR && data.SIZE ? ' | ' : ''}${data.SIZE || ''}`.trim();
        value = description || fallback || 'Material / Color';
      }

      ctx.fillText(value, element.x, element.y);
      ctx.restore();
    }

    if (element.type === 'barcode') {
      ctx.save();
      const width = element.width || 360;
      const height = element.height || 92;
      const barWidth = width / 80;

      ctx.fillStyle = '#111827';
      for (let i = 0; i < 80; i += 1) {
        if (i % 2 === 0) {
          ctx.fillRect(
            element.x + i * barWidth,
            element.y,
            barWidth * 0.9,
            height
          );
        }
      }

      if (element.humanReadable) {
        ctx.fillStyle = '#0f172a';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(
          rawValue || '',
          element.x + width / 2,
          element.y + height + 10
        );
      }
      ctx.restore();
    }
  });

  ctx.restore();
};

const LabelLayoutEditor = ({ isOpen, onClose, previewImage, onSaveLayout }) => {
  const [layout, setLayout] = useState(() => defaultLayout());
  const [selectedId, setSelectedId] = useState('styleName');
  const [dragState, setDragState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const selectedElement = useMemo(
    () => layout?.elements?.find((el) => el.id === selectedId) || null,
    [layout, selectedId]
  );

  const updateElement = useCallback((elementId, updater) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return {
          ...prev,
        elements: prev.elements.map((el) =>
          el.id === elementId ? { ...el, ...updater(el) } : el
        )
      };
    });
  }, []);

  const loadLayoutFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get('/api/layout/current');
      if (data?.layout) {
        setLayout(data.layout);
        const firstId = data.layout.elements?.[0]?.id || 'styleName';
        setSelectedId(firstId);
        toast.success('Layout carregado do servidor.');
      } else {
        setLayout(defaultLayout());
        setSelectedId('styleName');
        toast.info('Layout padrão carregado.');
      }
    } catch (error) {
      console.error('Erro ao carregar layout:', error);
      toast.error('Não foi possível carregar o layout salvo. Usando padrão.');
      setLayout(defaultLayout());
      setSelectedId('styleName');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    loadLayoutFromServer();
  }, [isOpen, loadLayoutFromServer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext('2d');
    drawLayout(ctx, layout, SAMPLE_LABEL);
  }, [layout]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext('2d');

    if (previewImage) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
        const scaledWidth = img.width * ratio;
        const scaledHeight = img.height * ratio;
        const offsetX = (canvas.width - scaledWidth) / 2;
        const offsetY = (canvas.height - scaledHeight) / 2;
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        drawLayout(ctx, layout, SAMPLE_LABEL, {
          skipClear: true,
          drawBackground: false,
          overlayAlpha: 0.35
        });
      };
      img.src = previewImage;
      return;
    }

    drawLayout(ctx, layout, SAMPLE_LABEL);
  }, [layout, previewImage]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedElement || !isOpen) return;
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        updateElement(selectedElement.id, (el) => ({ y: el.y - step }));
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        updateElement(selectedElement.id, (el) => ({ y: el.y + step }));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        updateElement(selectedElement.id, (el) => ({ x: el.x - step }));
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        updateElement(selectedElement.id, (el) => ({ x: el.x + step }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedElement, updateElement]);

  const handleCanvasMouseDown = (event) => {
    if (!canvasRef.current || !layout) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const element = [...layout.elements].reverse().find((el) => {
      if (el.type === 'text') {
        const width = 280;
        const height = (el.fontSize || 20) + 14;
        return x >= el.x && x <= el.x + width && y >= el.y && y <= el.y + height;
      }
      if (el.type === 'barcode') {
        const width = el.width || 360;
        const height = el.height || 92;
        return (
          x >= el.x &&
          x <= el.x + width &&
          y >= el.y &&
          y <= el.y + height
        );
      }
      return false;
    });

    if (element) {
      setSelectedId(element.id);
      setDragState({
        id: element.id,
        offsetX: x - element.x,
        offsetY: y - element.y
      });
    }
  };

  const handleMouseMove = (event) => {
    if (!dragState || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    updateElement(dragState.id, () => ({
      x: Math.round(x - dragState.offsetX),
      y: Math.round(y - dragState.offsetY)
    }));
  };

  const stopDragging = () => setDragState(null);

  const nudge = (dx, dy) => {
    if (!selectedId) return;
    updateElement(selectedId, (el) => ({
      x: el.x + dx,
      y: el.y + dy
    }));
  };

  const handleMarginChange = (side, value) => {
    setLayout((prev) => ({
      ...prev,
      paper: {
        ...prev.paper,
        margin: {
          ...prev.paper.margin,
          [side]: Number(value)
        }
      }
    }));
  };

  const handleSave = async () => {
    if (!onSaveLayout) {
      return;
    }
    try {
      setIsSaving(true);
        await onSaveLayout(layout);
      toast.success('Layout salvo com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar layout:', error);
      toast.error('Não foi possível salvar o layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    const restored = defaultLayout();
    setLayout(restored);
    setSelectedId(restored.elements[0]?.id || 'styleName');
    toast.info('Layout restaurado para o padrão.');
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content label-editor-modal">
        <div className="modal-header">
          <div>
            <h2>Editor de Layout</h2>
            <p>Arraste os elementos ou use as setas para ajustar posições.</p>
        </div>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={handleRestoreDefault}
              disabled={isLoading || isSaving}
            >
              <RotateCcw size={16} />
              Restaurar padrão
            </button>
            <button
              className="btn btn-secondary"
              onClick={loadLayoutFromServer}
              disabled={isLoading}
            >
              <FolderOpen size={16} />
              Carregar salvo
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="spinner-inline" size={16} />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Salvar
                        </>
                      )}
            </button>
            <button className="btn btn-outline" onClick={onClose}>
              Fechar
            </button>
            <button className="btn btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
                    </div>
              </div>

        {isLoading && (
          <div className="loading-overlay">
            <Loader2 className="spinner-inline" size={20} />
            Carregando layout...
            </div>
        )}

        <div className="label-editor-body">
          <div className="label-editor-columns">
            <div className="editor-panel left resizable-panel">
              <div className="panel-header">
                <Type size={16} />
                Elementos da etiqueta
              </div>
              <div className="panel-body scrollable">
                <p className="panel-help">
                  Selecione um item para editar. Arraste na área central ou use as setas rápidas.
                </p>
                <div className="element-list">
                  {layout.elements.map((element) => (
                      <button
                      key={element.id}
                      className={`element-item ${selectedId === element.id ? 'selected' : ''}`}
                      onClick={() => setSelectedId(element.id)}
                    >
                      <Type size={14} />
                      <div className="element-info">
                        <strong>{element.label}</strong>
                        <span>X:{element.x}px • Y:{element.y}px</span>
                      </div>
                      </button>
                    ))}
                  </div>
            </div>
          </div>

            <div className="editor-panel center">
              <div className="canvas-toolbar">
                <div className="toolbar-group">
                  <span className="toolbar-title">
                    <Move size={16} />
                    Ajustes rápidos
                  </span>
                  <div className="toolbar-buttons">
                    <button onClick={() => nudge(0, -5)}>↑</button>
                    <button onClick={() => nudge(0, 5)}>↓</button>
                    <button onClick={() => nudge(-5, 0)}>←</button>
                    <button onClick={() => nudge(5, 0)}>→</button>
                  </div>
              </div>
            </div>

              <div className="canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  width={layout.paper.width}
                  height={layout.paper.height}
                  className="label-editor-canvas"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={stopDragging}
                  onMouseLeave={stopDragging}
                />
              </div>

              <div className="current-preview">
                <div className="current-preview-header">
                  <ImageIcon size={16} />
                  Prévia Atual da Etiqueta
                </div>
                <canvas
                  ref={previewCanvasRef}
                  width={layout.paper.width}
                  height={layout.paper.height}
                  className="label-preview-canvas"
                />
              </div>
              </div>

            <div className="editor-panel right resizable-panel">
              <div className="panel-header">Configurações do elemento</div>
              <div className="panel-body scrollable">
                {selectedElement ? (
                  <>
                    <div className="form-grid">
                      <label>
                        <span>X (px)</span>
                        <input
                          type="number"
                          value={selectedElement.x}
                          onChange={(event) =>
                            updateElement(selectedElement.id, () => ({
                              x: Number(event.target.value)
                            }))
                          }
                        />
                </label>
                      <label>
                        <span>Y (px)</span>
                      <input
                        type="number"
                          value={selectedElement.y}
                          onChange={(event) =>
                            updateElement(selectedElement.id, () => ({
                              y: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                    </div>

                    {selectedElement.type === 'text' && (
                      <div className="form-grid">
                        <label>
                          <span>Tamanho da fonte</span>
                      <input
                        type="number"
                            min={12}
                            max={72}
                            value={selectedElement.fontSize}
                            onChange={(event) =>
                              updateElement(selectedElement.id, () => ({
                                fontSize: Number(event.target.value)
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Estilo</span>
                          <select
                            value={selectedElement.fontWeight === 'bold' ? 'bold' : 'normal'}
                            onChange={(event) =>
                              updateElement(selectedElement.id, () => ({
                                fontWeight: event.target.value === 'bold' ? 'bold' : 'normal'
                              }))
                            }
                          >
                            <option value="normal">Normal</option>
                            <option value="bold">Negrito</option>
                          </select>
                        </label>
                    </div>
                    )}

                    {selectedElement.type === 'barcode' && (
                      <div className="form-grid">
                        <label>
                          <span>Largura</span>
                      <input
                        type="number"
                            min={200}
                            max={layout.paper.width}
                            value={selectedElement.width}
                            onChange={(event) =>
                              updateElement(selectedElement.id, () => ({
                                width: Number(event.target.value)
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Altura</span>
                      <input
                        type="number"
                            min={40}
                            max={160}
                            value={selectedElement.height}
                            onChange={(event) =>
                              updateElement(selectedElement.id, () => ({
                                height: Number(event.target.value)
                              }))
                            }
                          />
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="panel-help">Selecione um elemento para editar as propriedades.</p>
                )}

                <div className="panel-header spaced">Margens da etiqueta (px)</div>
                <div className="form-grid">
                  {['top', 'right', 'bottom', 'left'].map((side) => (
                    <label key={side}>
                      <span>{side.toUpperCase()}</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={layout.paper.margin[side]}
                        onChange={(event) => handleMarginChange(side, event.target.value)}
                      />
                    </label>
                  ))}
                        </div>
                      </div>
                        </div>
                      </div>
        </div>
      </div>
    </div>
  );
};

export default LabelLayoutEditor;

