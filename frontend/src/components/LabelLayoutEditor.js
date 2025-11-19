import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Move, Save, Type, Image as ImageIcon, Loader2, RotateCcw, Square, Minus, QrCode, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config';
import './components.css';

const LABEL_WIDTH = 831; // dots (4.1 polegadas a 203 DPI)
const LABEL_HEIGHT = 500; // dots (2.46 polegadas a 203 DPI) - aumentado para mais espaço vertical
const DPI = 203; // DPI da impressora Zebra

// Funções de conversão entre dots e cm
// 1 cm = 203 / 2.54 ≈ 79.921 dots
const dotsToCm = (dots) => (dots * 2.54) / DPI;
const cmToDots = (cm) => (cm * DPI) / 2.54;

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

// Converter layout de dots para cm (para exibição e edição)
const layoutToCm = (layout) => {
  if (!layout) return layout;
  const converted = {};
  
  Object.keys(layout).forEach(key => {
    const value = layout[key];
    if (typeof value === 'object' && value !== null) {
      converted[key] = { ...value };
      if (typeof value.x === 'number') converted[key].x = dotsToCm(value.x);
      if (typeof value.y === 'number') converted[key].y = dotsToCm(value.y);
      if (typeof value.width === 'number') converted[key].width = dotsToCm(value.width);
      if (typeof value.height === 'number') {
        // Para altura, manter em cm mesmo (já que pode ser altura de fonte ou barcode)
        converted[key].height = dotsToCm(value.height);
      }
      // fontSize mantém em pontos (pt), não converte
    } else {
      converted[key] = value;
    }
  });
  
  return converted;
};

// Converter layout de cm para dots (para salvar no backend)
const layoutToDots = (layout) => {
  if (!layout) return layout;
  const converted = {};
  
  Object.keys(layout).forEach(key => {
    const value = layout[key];
    if (typeof value === 'object' && value !== null) {
      converted[key] = { ...value };
      if (typeof value.x === 'number') converted[key].x = cmToDots(value.x);
      if (typeof value.y === 'number') converted[key].y = cmToDots(value.y);
      if (typeof value.width === 'number') converted[key].width = cmToDots(value.width);
      if (typeof value.height === 'number') {
        converted[key].height = cmToDots(value.height);
      }
      // fontSize mantém em pontos (pt), não converte
    } else {
      converted[key] = value;
    }
  });
  
  return converted;
};

const defaultLayout = () => ({
  // Coordenadas baseadas no TEMPLATE_LARROUD_OFICIAL.zpl
  // Labels (textos fixos) - FT187,147, FT188,176, FT187,204, FT187,234
  labelStyleName: { x: 187, y: 147, fontSize: 20 },
  labelVpn: { x: 188, y: 176, fontSize: 20 },
  labelColor: { x: 187, y: 204, fontSize: 20 },
  labelSize: { x: 187, y: 234, fontSize: 20 },
  
  // Valores (dados) - FT353,147, FT353,175, FT353,204, FT353,232
  styleName: { x: 353, y: 147, fontSize: 23 },
  vpn: { x: 353, y: 175, fontSize: 23 },
  color: { x: 353, y: 204, fontSize: 23 },
  size: { x: 353, y: 232, fontSize: 23 },
  
  // QR Codes - Posicionados nas laterais para não sobrepor textos
  // QR esquerdo: bem à esquerda, alinhado verticalmente com textos
  qrLeft: { x: 50, y: 200, size: 4 },
  // QR codes direitos: bem à direita, um no topo e um embaixo (dentro do MainBox)
  qrTop: { x: 600, y: 120, size: 4 },
  qrBottom: { x: 600, y: 300, size: 4 },
  
  // PO Info - À direita, entre os QR codes, sem sobrepor textos
  poInfo: { x: 580, y: 200, fontSize: 16 },
  
  // Barcode - FT222,308
  barcode: { x: 222, y: 308, height: 57.296875, width: 400 },
  
  // MainBox - FO31,80^GB640,280,3
  mainBox: { x: 31, y: 80, width: 640, height: 280 },
  
  // DividerLine - FO177,81^GB0,275,3
  dividerLine: { x: 177, y: 81, height: 275 },
  
  // Imagem do produto (placeholder - futuramente será a imagem real do produto)
  productImage: { x: 80, y: 120, width: 80, height: 80 }
});

const drawLayout = (ctx, layout, data, options = {}) => {
  if (!ctx || !layout) {
    return;
  }

  const {
    skipClear = false,
    drawBackground = true,
    overlayAlpha = 1,
    selectedType = null,
    selectedKey = null
  } = options;

  if (!skipClear) {
    ctx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
  }

  if (drawBackground) {
    // Área total da etiqueta (cinza - margens externas)
    ctx.fillStyle = '#e5e7eb'; // Cinza claro para área de margem
    ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    
    // Área de impressão (branca - onde as etiquetas são impressas)
    // Margens reduzidas para aumentar área branca e facilitar manutenção
    // Margens mínimas: 0.2cm topo/fundo, 0.1cm esquerda/direita
    // 0.2cm = 203/2.54*0.2 ≈ 16 dots, 0.1cm = 203/2.54*0.1 ≈ 8 dots
    const topMargin = 16; // 0.2cm ≈ 16 dots (203 DPI)
    const bottomMargin = 16; // 0.2cm ≈ 16 dots (203 DPI)
    const leftMargin = 8; // 0.1cm ≈ 8 dots (203 DPI)
    const rightMargin = 8; // 0.1cm ≈ 8 dots (203 DPI)
    
    const printAreaX = leftMargin;
    const printAreaY = topMargin;
    const printAreaWidth = LABEL_WIDTH - leftMargin - rightMargin;
    const printAreaHeight = LABEL_HEIGHT - topMargin - bottomMargin;
    
    ctx.fillStyle = '#ffffff'; // Branco para área de impressão
    ctx.fillRect(printAreaX, printAreaY, printAreaWidth, printAreaHeight);
    
    // Linha de guia para área de impressão (opcional - desenho fino)
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(printAreaX, printAreaY, printAreaWidth, printAreaHeight);
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.globalAlpha = overlayAlpha;

  // Preview mode: não mostrar elementos de edição (mainBox, dividerLine)
  const isPreviewMode = selectedType === null && selectedKey === null;
  
  // Desenhar quadrado principal (mainBox) - apenas no editor, não na preview
  if (!isPreviewMode && layout.mainBox) {
    const isSelected = selectedType === 'mainBox';
    ctx.strokeStyle = isSelected ? '#2563eb' : '#3b82f6';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(
      layout.mainBox.x,
      layout.mainBox.y,
      layout.mainBox.width,
      layout.mainBox.height
    );
    if (isSelected) {
      // Destacar com fundo semi-transparente
      ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
      ctx.fillRect(
        layout.mainBox.x,
        layout.mainBox.y,
        layout.mainBox.width,
        layout.mainBox.height
      );
    }
  }

  // Desenhar linha divisória (dividerLine) - apenas no editor, não na preview
  if (!isPreviewMode && layout.dividerLine) {
    const isSelected = selectedType === 'dividerLine';
    ctx.strokeStyle = isSelected ? '#2563eb' : '#3b82f6';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(layout.dividerLine.x, layout.dividerLine.y);
    ctx.lineTo(layout.dividerLine.x, layout.dividerLine.y + layout.dividerLine.height);
    ctx.stroke();
    if (isSelected) {
      // Destacar com círculos nas extremidades
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(layout.dividerLine.x, layout.dividerLine.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(layout.dividerLine.x, layout.dividerLine.y + layout.dividerLine.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Desenhar campos de texto
  const textFields = [
    { key: 'labelStyleName', label: 'STYLE NAME:', value: '' },
    { key: 'styleName', label: '', value: data.STYLE_NAME || 'Produto Exemplo' },
    { key: 'labelVpn', label: 'VPN:', value: '' },
    { key: 'vpn', label: '', value: data.VPN || 'ABC-123-RED-38' },
    { key: 'labelColor', label: 'MAT./COLOR:', value: '' },
    { key: 'color', label: '', value: data.DESCRIPTION || data.COLOR || 'RED' },
    { key: 'labelSize', label: 'SIZE:', value: '' },
    { key: 'size', label: '', value: data.SIZE || '38' },
    { key: 'poInfo', label: '', value: `PO${data.PO || '001'}` }
  ];

  textFields.forEach(({ key, label, value }) => {
    const field = layout[key];
    if (field && field.fontSize) {
      // Na preview, não mostrar labels (textos fixos como "STYLE NAME:", "VPN:", etc.)
      // Apenas mostrar os valores (styleName, vpn, color, size, poInfo)
      if (isPreviewMode && key.startsWith('label')) {
        return; // Pular labels na preview
      }
      
      const isSelected = !isPreviewMode && selectedType === 'text' && selectedKey === key;
      ctx.save();
      if (isSelected && !isPreviewMode) {
        // Destacar campo selecionado com fundo (apenas no editor, não na preview)
        ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
        const textWidth = ctx.measureText(label + value).width;
        ctx.fillRect(field.x - 4, field.y - 2, textWidth + 8, field.fontSize + 4);
      }
      // Na preview, sempre texto preto simples, sem destaque
      ctx.fillStyle = isPreviewMode ? '#0f172a' : (isSelected ? '#1e40af' : '#0f172a');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `${field.fontSize || 20}px Arial`;
      ctx.fillText(label + value, field.x, field.y);
      ctx.restore();
    }
  });

  // Desenhar código de barras
  if (layout.barcode) {
    const isSelected = !isPreviewMode && selectedType === 'barcode' && selectedKey === 'barcode';
    ctx.save();
    const height = layout.barcode.height || 57;
    // Usar width do layout se disponível, senão usar 300 como padrão
    const widthInCm = layout.barcode.width || dotsToCm(400);
    const width = cmToDots(widthInCm);
    if (isSelected) {
      // Destacar com borda (apenas no editor)
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.strokeRect(layout.barcode.x - 4, layout.barcode.y - 4, width + 8, height + 8);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
      ctx.fillRect(layout.barcode.x - 4, layout.barcode.y - 4, width + 8, height + 8);
    }
    const barWidth = width / 80;
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 80; i += 1) {
      if (i % 2 === 0) {
        ctx.fillRect(
          layout.barcode.x + i * barWidth,
          layout.barcode.y,
          barWidth * 0.9,
          height
        );
      }
    }
    ctx.restore();
  }

  // Desenhar imagem do produto (placeholder)
  // layout está em cm, mas o canvas precisa de dots
  // Garantir que productImage existe e tem dimensões válidas
  const imgInCm = layout.productImage || { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
  const imgWidth = imgInCm.width && imgInCm.width > 0 ? imgInCm.width : dotsToCm(80);
  const imgHeight = imgInCm.height && imgInCm.height > 0 ? imgInCm.height : dotsToCm(80);
  const img = {
    x: cmToDots(imgInCm.x || dotsToCm(80)),
    y: cmToDots(imgInCm.y || dotsToCm(120)),
    width: cmToDots(imgWidth),
    height: cmToDots(imgHeight)
  };
  
  // Só desenhar se tiver dimensões válidas
  if (img.width > 10 && img.height > 10) {
    const isSelected = !isPreviewMode && selectedType === 'image' && selectedKey === 'productImage';
    ctx.save();
    if (isSelected) {
      // Destacar imagem selecionada (apenas no editor)
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.strokeRect(img.x - 4, img.y - 4, img.width + 8, img.height + 8);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
      ctx.fillRect(img.x - 4, img.y - 4, img.width + 8, img.height + 8);
    }
    // Desenhar retângulo com borda para representar a imagem
    // Na preview, usar estilo mais discreto
    ctx.strokeStyle = isSelected ? '#2563eb' : (isPreviewMode ? '#9ca3af' : '#6b7280');
    ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.05)' : (isPreviewMode ? '#f9fafb' : '#f3f4f6');
    ctx.lineWidth = isSelected ? 3 : (isPreviewMode ? 1 : 2);
    ctx.setLineDash(isPreviewMode ? [2, 2] : [8, 4]);
    ctx.fillRect(img.x, img.y, img.width, img.height);
    ctx.strokeRect(img.x, img.y, img.width, img.height);
    ctx.setLineDash([]);
    
    // Desenhar ícone de imagem no centro (menos destacado na preview)
    ctx.fillStyle = isSelected ? '#2563eb' : (isPreviewMode ? '#d1d5db' : '#9ca3af');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = isPreviewMode ? '10px Arial' : '12px Arial';
    ctx.fillText('📷 IMG', img.x + img.width / 2, img.y + img.height / 2);
    ctx.restore();
  }

  // Desenhar QR codes
  const qrCodes = [
    { key: 'qrLeft', label: 'QR Left' },
    { key: 'qrTop', label: 'QR Top' },
    { key: 'qrBottom', label: 'QR Bottom' }
  ];

  qrCodes.forEach(({ key, label }) => {
    const qr = layout[key];
    if (qr) {
      const isSelected = !isPreviewMode && selectedType === 'qr' && selectedKey === key;
      const size = (qr.size || 4) * 20; // Converter size para pixels
      ctx.save();
      if (isSelected) {
        // Destacar QR code selecionado (apenas no editor)
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.strokeRect(qr.x - 4, qr.y - 4, size + 8, size + 8);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
        ctx.fillRect(qr.x - 4, qr.y - 4, size + 8, size + 8);
      }
      // Na preview, não mostrar bordas coloridas dos QR codes
      ctx.strokeStyle = isSelected ? '#2563eb' : (isPreviewMode ? 'transparent' : '#10b981');
      ctx.fillStyle = isSelected ? '#2563eb' : (isPreviewMode ? '#111827' : '#10b981');
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(qr.x, qr.y, size, size);
      // Desenhar padrão de QR code simples
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (i === 0 || i === 2 || j === 0 || j === 2) {
            ctx.fillRect(qr.x + i * (size / 3), qr.y + j * (size / 3), size / 3, size / 3);
          }
        }
      }
      ctx.restore();
    }
  });

  ctx.restore();
};

const LabelLayoutEditor = ({ isOpen, onClose, previewImage, onSaveLayout, labelData }) => {
  const [layout, setLayout] = useState(() => {
    // Converter layout padrão de dots para cm ao inicializar
    const defaultLayoutData = defaultLayout();
    return layoutToCm(defaultLayoutData);
  });
  const [selectedType, setSelectedType] = useState('text');
  const [selectedKey, setSelectedKey] = useState('styleName');
  const [dragState, setDragState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef(null);

  const selectedElement = useMemo(() => {
    if (!layout) {
      return null;
    }
    
    let element = null;
    if (selectedType === 'mainBox') {
      element = layout.mainBox || null;
    } else if (selectedType === 'dividerLine') {
      element = layout.dividerLine || null;
    } else if (selectedType === 'qr') {
      element = layout[selectedKey] || null;
    } else if (selectedType === 'image' && selectedKey === 'productImage') {
      // Garantir que productImage existe, se não existir, criar com valores padrão
      element = layout.productImage || { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
    } else if (selectedType === 'text' || selectedType === 'barcode') {
      element = layout[selectedKey] || null;
    }
    
    return element;
  }, [layout, selectedType, selectedKey]);

  const updateLayout = useCallback((key, updater) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const newLayout = { ...prev };
      // Garantir que productImage existe antes de atualizar
      if (key === 'productImage' && !newLayout.productImage) {
        newLayout.productImage = { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
      }
      if (key === 'mainBox' || key === 'dividerLine' || key === 'productImage') {
        newLayout[key] = { ...newLayout[key], ...updater(newLayout[key] || {}) };
      } else {
        newLayout[key] = { ...newLayout[key], ...updater(newLayout[key] || {}) };
      }
      return newLayout;
    });
  }, []);

  const [availableLayouts, setAvailableLayouts] = useState([]);
  const [selectedLayoutName, setSelectedLayoutName] = useState('Default');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveLayoutName, setSaveLayoutName] = useState('');

  const loadAvailableLayouts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/layout/list`);
      if (data?.layouts) {
        setAvailableLayouts(data.layouts);
        if (data.layouts.length > 0 && !data.layouts.find(l => l.name === selectedLayoutName)) {
          setSelectedLayoutName(data.layouts[0].name);
        }
      }
    } catch (error) {
      console.error('Erro ao listar layouts:', error);
    }
  }, [selectedLayoutName]);

  const loadLayoutFromServer = useCallback(async (layoutName = null) => {
    setIsLoading(true);
    try {
      const nameToLoad = layoutName || selectedLayoutName || 'Default';
      const { data } = await axios.get(`${API_BASE_URL}/layout/load/${nameToLoad}`);
      if (data?.layout) {
        // Se o layout tem uma estrutura aninhada, extrair o layout interno
        // Pode ser data.layout.layout (estrutura antiga) ou data.layout (estrutura nova)
        let layoutData = data.layout;
        if (layoutData && layoutData.layout && typeof layoutData.layout === 'object') {
          // Estrutura aninhada antiga: { layout: { layout: {...} } }
          console.warn('[LOAD] Layout carregado com estrutura aninhada dupla, extraindo layout interno');
          layoutData = layoutData.layout;
        }
        
        // Verificar se os valores estão em dots ou cm
        // Valores em dots são grandes (> 50), valores em cm são pequenos (< 10)
        const sampleKey = Object.keys(layoutData)[0];
        let layoutInCm;
        if (sampleKey && layoutData[sampleKey] && layoutData[sampleKey].x !== undefined) {
          const sampleX = layoutData[sampleKey].x;
          if (sampleX < 10 && sampleX > 0) {
            // Valores estão em cm (errado - deveriam estar em dots)
            // Converter cm -> dots -> cm (resultado final em cm para o editor)
            console.warn(`[LOAD] AVISO: Layout salvo incorretamente em cm (x=${sampleX}). Convertendo para dots primeiro...`);
            // Assumir que está em cm e converter para dots
            const tempLayoutInDots = {};
            Object.keys(layoutData).forEach(key => {
              const val = layoutData[key];
              if (typeof val === 'object' && val !== null) {
                tempLayoutInDots[key] = { ...val };
                if (typeof val.x === 'number') tempLayoutInDots[key].x = cmToDots(val.x);
                if (typeof val.y === 'number') tempLayoutInDots[key].y = cmToDots(val.y);
                if (typeof val.width === 'number') tempLayoutInDots[key].width = cmToDots(val.width);
                if (typeof val.height === 'number') tempLayoutInDots[key].height = cmToDots(val.height);
              }
            });
            // Agora converter de dots para cm (correto)
            layoutInCm = layoutToCm(tempLayoutInDots);
          } else {
            // Valores estão em dots (correto)
            layoutInCm = layoutToCm(layoutData);
          }
        } else {
          // Converter de dots (do servidor) para cm (para edição)
          layoutInCm = layoutToCm(layoutData);
        }
        // Garantir que productImage existe, se não existir, criar com valores padrão
        if (!layoutInCm.productImage) {
          layoutInCm.productImage = { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
        }
        setLayout(layoutInCm);
        setSelectedKey('styleName');
        setSelectedType('text');
        setSelectedLayoutName(nameToLoad);
        toast.success(`Layout "${nameToLoad}" carregado do servidor.`);
      } else {
        const defaultLayoutData = defaultLayout();
        // Converter de dots para cm
        const defaultLayoutInCm = layoutToCm(defaultLayoutData);
        // Garantir que productImage existe
        if (!defaultLayoutInCm.productImage) {
          defaultLayoutInCm.productImage = { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
        }
        setLayout(defaultLayoutInCm);
        setSelectedKey('styleName');
        setSelectedType('text');
        toast.info('Layout padrão carregado.');
      }
    } catch (error) {
      console.error('Erro ao carregar layout:', error);
      const defaultLayoutData = defaultLayout();
      // Converter de dots para cm
      const defaultLayoutInCm = layoutToCm(defaultLayoutData);
      // Garantir que productImage existe
      if (!defaultLayoutInCm.productImage) {
        defaultLayoutInCm.productImage = { x: dotsToCm(80), y: dotsToCm(120), width: dotsToCm(80), height: dotsToCm(80) };
      }
      setLayout(defaultLayoutInCm);
      setSelectedKey('styleName');
      setSelectedType('text');
      toast.error('Não foi possível carregar o layout salvo. Usando padrão.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLayoutName]);

  useEffect(() => {
    if (isOpen) {
      loadAvailableLayouts();
      loadLayoutFromServer();
    }
  }, [isOpen, loadAvailableLayouts, loadLayoutFromServer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext('2d');
    // Usar dados reais da etiqueta se disponíveis, senão usar dados de exemplo
    const displayData = labelData || SAMPLE_LABEL;
    // Converter layout de cm (edição) para dots (desenho no canvas)
    const layoutInDots = layoutToDots(layout);
    drawLayout(ctx, layoutInDots, displayData, {
      selectedType,
      selectedKey
    });
  }, [layout, selectedType, selectedKey, labelData]);


  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedElement || !isOpen) return;
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
          const key = selectedType === 'image' ? 'productImage' : selectedType;
          updateLayout(key, (el) => ({ y: (el.y || 0) - step }));
        } else {
          updateLayout(selectedKey, (el) => ({ y: (el.y || 0) - step }));
        }
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
          const key = selectedType === 'image' ? 'productImage' : selectedType;
          updateLayout(key, (el) => ({ y: (el.y || 0) + step }));
        } else {
          updateLayout(selectedKey, (el) => ({ y: (el.y || 0) + step }));
        }
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
          const key = selectedType === 'image' ? 'productImage' : selectedType;
          updateLayout(key, (el) => ({ x: (el.x || 0) - step }));
        } else {
          updateLayout(selectedKey, (el) => ({ x: (el.x || 0) - step }));
        }
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
          const key = selectedType === 'image' ? 'productImage' : selectedType;
          updateLayout(key, (el) => ({ x: (el.x || 0) + step }));
        } else {
          updateLayout(selectedKey, (el) => ({ x: (el.x || 0) + step }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedElement, selectedType, selectedKey, updateLayout]);

  const handleCanvasMouseDown = (event) => {
    if (!canvasRef.current || !layout) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Calcular escala do canvas (tamanho CSS vs tamanho real)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Converter layout de cm para dots para detecção de cliques no canvas
    const layoutInDots = layoutToDots(layout);

    // Verificar se clicou no mainBox
    if (layoutInDots.mainBox) {
      const box = layoutInDots.mainBox;
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        setSelectedType('mainBox');
        setSelectedKey('mainBox');
        setDragState({
          type: 'mainBox',
          key: 'mainBox',
          offsetX: x, // Manter em pixels (canvas)
          offsetY: y // Manter em pixels (canvas)
        });
        return;
      }
    }

    // Verificar se clicou na dividerLine
    if (layoutInDots.dividerLine) {
      const line = layoutInDots.dividerLine;
      if (Math.abs(x - line.x) < 10 && y >= line.y && y <= line.y + line.height) {
        setSelectedType('dividerLine');
        setSelectedKey('dividerLine');
        setDragState({
          type: 'dividerLine',
          key: 'dividerLine',
          offsetX: x, // Manter em pixels (canvas)
          offsetY: y // Manter em pixels (canvas)
        });
        return;
      }
    }

    // Verificar QR codes
    const qrCodes = ['qrLeft', 'qrTop', 'qrBottom'];
    for (const qrKey of qrCodes) {
      const qr = layoutInDots[qrKey];
      if (qr) {
        const size = (qr.size || 4) * 20;
        if (x >= qr.x && x <= qr.x + size && y >= qr.y && y <= qr.y + size) {
          setSelectedType('qr');
          setSelectedKey(qrKey);
          setDragState({
            type: 'qr',
            key: qrKey,
            offsetX: x, // Manter em pixels (canvas)
            offsetY: y // Manter em pixels (canvas)
          });
          return;
        }
      }
    }

    // Verificar campos de texto
    const textFields = [
      'labelStyleName', 'styleName', 'labelVpn', 'vpn', 'labelColor', 'color',
      'labelSize', 'size', 'poInfo'
    ];
    for (const fieldKey of textFields) {
      const field = layoutInDots[fieldKey];
      if (field && field.fontSize) {
        const width = 200;
        const height = field.fontSize + 10;
        if (x >= field.x && x <= field.x + width && y >= field.y && y <= field.y + height) {
          setSelectedType('text');
          setSelectedKey(fieldKey);
          setDragState({
            type: 'text',
            key: fieldKey,
            offsetX: x, // Manter em pixels (canvas)
            offsetY: y // Manter em pixels (canvas)
          });
          return;
        }
      }
    }

    // Verificar código de barras
    if (layoutInDots.barcode) {
      const barcode = layoutInDots.barcode;
      const widthInCm = barcode.width || dotsToCm(400);
      const width = cmToDots(widthInCm);
      const height = barcode.height || 57;
      if (x >= barcode.x && x <= barcode.x + width && y >= barcode.y && y <= barcode.y + height) {
        setSelectedType('barcode');
        setSelectedKey('barcode');
        setDragState({
          type: 'barcode',
          key: 'barcode',
          offsetX: x, // Manter em pixels (canvas)
          offsetY: y // Manter em pixels (canvas)
        });
        return;
      }
    }

    // Verificar imagem do produto (sempre verificar, mesmo se não existir no layout)
    const productImageInDots = layoutInDots.productImage || { x: 80, y: 120, width: 80, height: 80 };
    const img = productImageInDots;
    const width = (img.width && img.width > 0) ? img.width : 80;
    const height = (img.height && img.height > 0) ? img.height : 80;
    const imgX = (img.x && img.x >= 0) ? img.x : 80;
    const imgY = (img.y && img.y >= 0) ? img.y : 120;
    if (x >= imgX && x <= imgX + width && y >= imgY && y <= imgY + height) {
      setSelectedType('image');
      setSelectedKey('productImage');
      setDragState({
        type: 'image',
        key: 'productImage',
        offsetX: x, // Manter em pixels (canvas)
        offsetY: y // Manter em pixels (canvas)
      });
      // Garantir que productImage existe no layout se ainda não existir
      if (!layout.productImage) {
        setLayout(prev => ({
          ...prev,
          productImage: { x: dotsToCm(imgX), y: dotsToCm(imgY), width: dotsToCm(width), height: dotsToCm(height) }
        }));
      }
      return;
    }
  };

  const handleMouseMove = (event) => {
    if (!dragState || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Calcular escala do canvas (tamanho CSS vs tamanho real)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // offsetX/Y contém a posição absoluta do clique inicial em pixels (canvas)
    // Calcular a diferença do movimento e converter para cm
    const layoutInDots = layoutToDots(layout);
    const currentElement = layoutInDots[dragState.key];
    
    if (currentElement) {
      // Calcular diferença do movimento em pixels
      const deltaXDots = x - dragState.offsetX;
      const deltaYDots = y - dragState.offsetY;
      
      // Posição atual do elemento em dots
      const currentXDots = currentElement.x || 0;
      const currentYDots = currentElement.y || 0;
      
      // Nova posição em dots
      const newXDots = currentXDots + deltaXDots;
      const newYDots = currentYDots + deltaYDots;
      
      // Converter para cm
      const xCm = dotsToCm(newXDots);
      const yCm = dotsToCm(newYDots);
      
      // Atualizar offset para o próximo movimento
      setDragState({
        ...dragState,
        offsetX: x,
        offsetY: y
      });
      
      // Mapear key correta para tipos especiais
      let updateKey = dragState.key;
      if (dragState.type === 'image' && dragState.key === 'productImage') {
        updateKey = 'productImage';
      } else if (dragState.type === 'mainBox') {
        updateKey = 'mainBox';
      } else if (dragState.type === 'dividerLine') {
        updateKey = 'dividerLine';
      }
      
      updateLayout(updateKey, () => ({
        x: Math.round(xCm * 100) / 100, // Arredondar para 2 decimais
        y: Math.round(yCm * 100) / 100
      }));
    }
  };

  const stopDragging = () => setDragState(null);

  const nudge = (dx, dy) => {
    if (!selectedKey) return;
    // Converter pixels para cm (0.05cm ≈ 1 dot a 203 DPI)
    const dxCm = dotsToCm(dx);
    const dyCm = dotsToCm(dy);
    if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
      const key = selectedType === 'image' ? 'productImage' : selectedType;
      updateLayout(key, (el) => ({
        x: Math.round(((el.x || 0) + dxCm) * 100) / 100,
        y: Math.round(((el.y || 0) + dyCm) * 100) / 100
      }));
    } else {
      updateLayout(selectedKey, (el) => ({
        x: Math.round(((el.x || 0) + dxCm) * 100) / 100,
        y: Math.round(((el.y || 0) + dyCm) * 100) / 100
      }));
    }
  };

  const handleSave = async () => {
    // Mostrar modal para salvar com nome ou sobrescrever
    setSaveLayoutName(selectedLayoutName);
    setShowSaveModal(true);
  };

  const handleSaveLayout = async (layoutName, overwrite = false) => {
    try {
      setIsSaving(true);
      
      // Converter layout de cm (edição) para dots (servidor) antes de salvar
      const layoutInDots = layoutToDots(layout);
      
      // Debug: verificar valores antes de salvar
      console.log('[SAVE] Layout em cm (editor):', {
        labelStyleName: layout.labelStyleName,
        mainBox: layout.mainBox,
        productImage: layout.productImage
      });
      console.log('[SAVE] Layout em dots (enviando ao servidor):', {
        labelStyleName: layoutInDots.labelStyleName,
        mainBox: layoutInDots.mainBox,
        productImage: layoutInDots.productImage
      });
      
      const { data } = await axios.post(`${API_BASE_URL}/layout/save-template`, {
        name: layoutName,
        layout: layoutInDots
      });
      
      toast.success(`Layout "${layoutName}" salvo com sucesso.`);
      
      // Atualizar lista de layouts
      await loadAvailableLayouts();
      setSelectedLayoutName(layoutName);
      setShowSaveModal(false);
      
      // Se for sobrescrever, também atualizar via callback se fornecido
      if (onSaveLayout) {
        await onSaveLayout({ name: layoutName, layout: layout });
      }
    } catch (error) {
      console.error('Erro ao salvar layout:', error);
      toast.error('Não foi possível salvar o layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    const restored = defaultLayout();
    // Converter de dots para cm
    const restoredInCm = layoutToCm(restored);
    setLayout(restoredInCm);
    setSelectedKey('styleName');
    setSelectedType('text');
    toast.info('Layout restaurado para o padrão.');
  };

  if (!isOpen) {
    return null;
  }

  const textFields = [
    { key: 'labelStyleName', label: 'Label STYLE NAME' },
    { key: 'styleName', label: 'STYLE NAME' },
    { key: 'labelVpn', label: 'Label VPN' },
    { key: 'vpn', label: 'VPN' },
    { key: 'labelColor', label: 'Label COLOR' },
    { key: 'color', label: 'COLOR' },
    { key: 'labelSize', label: 'Label SIZE' },
    { key: 'size', label: 'SIZE' },
    { key: 'poInfo', label: 'PO Info' }
  ];

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
            <select
              className="btn btn-secondary"
              value={selectedLayoutName}
              onChange={(e) => {
                setSelectedLayoutName(e.target.value);
                loadLayoutFromServer(e.target.value);
              }}
              disabled={isLoading}
              style={{ padding: '8px 12px', fontSize: '14px', cursor: 'pointer' }}
            >
              {availableLayouts.map((layout) => (
                <option key={layout.name} value={layout.name}>
                  {layout.name}
                </option>
              ))}
              {availableLayouts.length === 0 && (
                <option value="Default">Default</option>
              )}
            </select>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving ? (
                <>
                  <Loader2 className="spinner-inline" size={16} />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Salvar Layout
                </>
              )}
            </button>
            <button className="btn btn-outline" onClick={onClose}>
              Fechar
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
                  Selecione um item para editar. Arraste na área central ou use as setas.
                </p>
                
                <div className="element-list">
                  <div className="element-group">
                    <strong>Formas</strong>
                    <button
                      className={`element-item ${selectedType === 'mainBox' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType('mainBox');
                        setSelectedKey('mainBox');
                      }}
                    >
                      <Square size={16} />
                      <div className="element-info">
                        <strong>Quadrado Principal</strong>
                        <span>X:{layout.mainBox?.x || 0}px • Y:{layout.mainBox?.y || 0}px</span>
                      </div>
                    </button>
                    <button
                      className={`element-item ${selectedType === 'dividerLine' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType('dividerLine');
                        setSelectedKey('dividerLine');
                      }}
                    >
                      <Minus size={16} />
                      <div className="element-info">
                        <strong>Linha Divisória</strong>
                        <span>X:{(layout.dividerLine?.x || 0).toFixed(2)}cm • Y:{(layout.dividerLine?.y || 0).toFixed(2)}cm</span>
                      </div>
                    </button>
                    <button
                      className={`element-item ${selectedType === 'image' && selectedKey === 'productImage' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType('image');
                        setSelectedKey('productImage');
                      }}
                    >
                      <ImageIcon size={16} />
                      <div className="element-info">
                        <strong>Imagem do Produto</strong>
                        <span>X:{(layout.productImage?.x || 0).toFixed(2)}cm • Y:{(layout.productImage?.y || 0).toFixed(2)}cm</span>
                      </div>
                    </button>
                  </div>

                  <div className="element-group">
                    <strong>QR Codes</strong>
                    {['qrLeft', 'qrTop', 'qrBottom'].map((qrKey) => (
                      <button
                        key={qrKey}
                        className={`element-item ${selectedType === 'qr' && selectedKey === qrKey ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedType('qr');
                          setSelectedKey(qrKey);
                        }}
                      >
                        <QrCode size={16} />
                        <div className="element-info">
                          <strong>{qrKey === 'qrLeft' ? 'QR Esquerdo' : qrKey === 'qrTop' ? 'QR Superior' : 'QR Inferior'}</strong>
                          <span>X:{(layout[qrKey]?.x || 0).toFixed(2)}cm • Y:{(layout[qrKey]?.y || 0).toFixed(2)}cm</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="element-group">
                    <strong>Campos de Texto</strong>
                    {textFields.map((field) => (
                      <button
                        key={field.key}
                        className={`element-item ${selectedType === 'text' && selectedKey === field.key ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedType('text');
                          setSelectedKey(field.key);
                        }}
                      >
                        <Type size={16} />
                        <div className="element-info">
                          <strong>{field.label}</strong>
                          <span>X:{(layout[field.key]?.x || 0).toFixed(2)}cm • Y:{(layout[field.key]?.y || 0).toFixed(2)}cm</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="element-group">
                    <strong>Outros</strong>
                    <button
                      className={`element-item ${selectedType === 'barcode' && selectedKey === 'barcode' ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType('barcode');
                        setSelectedKey('barcode');
                      }}
                    >
                      <Type size={14} />
                      <div className="element-info">
                        <strong>Código de Barras</strong>
                        <span>X:{(layout.barcode?.x || 0).toFixed(2)}cm • Y:{(layout.barcode?.y || 0).toFixed(2)}cm</span>
                      </div>
                    </button>
                  </div>
                </div>
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
                width={LABEL_WIDTH}
                height={LABEL_HEIGHT}
                className="label-editor-canvas"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
              />
            </div>

          </div>

          <div className="editor-panel right resizable-panel">
            <div className="panel-header">Configurações do elemento</div>
            <div className="panel-body scrollable">
              {selectedElement ? (
                <>
                  <div className="form-section">
                    <div className="form-section-title">Posição</div>
                    <div className="form-grid">
                      <label>
                        <span>X (cm)</span>
                        <input
                          type="number"
                          step="0.01"
                          value={selectedElement.x ?? 0}
                          onChange={(event) => {
                            if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
                              updateLayout(selectedType === 'image' ? 'productImage' : selectedType, () => ({ x: Number(event.target.value) }));
                            } else {
                              updateLayout(selectedKey, () => ({ x: Number(event.target.value) }));
                            }
                          }}
                        />
                      </label>
                      <label>
                        <span>Y (cm)</span>
                        <input
                          type="number"
                          step="0.01"
                          value={selectedElement.y ?? 0}
                          onChange={(event) => {
                            if (selectedType === 'mainBox' || selectedType === 'dividerLine' || selectedType === 'image') {
                              updateLayout(selectedType === 'image' ? 'productImage' : selectedType, () => ({ y: Number(event.target.value) }));
                            } else {
                              updateLayout(selectedKey, () => ({ y: Number(event.target.value) }));
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {selectedType === 'mainBox' && (
                    <div className="form-section">
                      <div className="form-section-title">Dimensões</div>
                      <div className="form-grid">
                        <label>
                          <span>Largura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(100)}
                            max={dotsToCm(LABEL_WIDTH)}
                            value={selectedElement.width ?? 0}
                            onChange={(event) =>
                              updateLayout('mainBox', () => ({ width: Number(event.target.value) }))
                            }
                          />
                        </label>
                        <label>
                          <span>Altura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(50)}
                            max={dotsToCm(LABEL_HEIGHT)}
                            value={selectedElement.height ?? 0}
                            onChange={(event) =>
                              updateLayout('mainBox', () => ({ height: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedType === 'dividerLine' && (
                    <div className="form-section">
                      <div className="form-section-title">Dimensões</div>
                      <div className="form-grid">
                        <label>
                          <span>Altura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(10)}
                            max={dotsToCm(LABEL_HEIGHT)}
                            value={selectedElement.height ?? 0}
                            onChange={(event) =>
                              updateLayout('dividerLine', () => ({ height: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedType === 'image' && (
                    <div className="form-section">
                      <div className="form-section-title">Dimensões</div>
                      <div className="form-grid">
                        <label>
                          <span>Largura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(20)}
                            max={dotsToCm(200)}
                            value={selectedElement.width ?? 0}
                            onChange={(event) =>
                              updateLayout('productImage', () => ({ width: Number(event.target.value) }))
                            }
                          />
                        </label>
                        <label>
                          <span>Altura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(20)}
                            max={dotsToCm(200)}
                            value={selectedElement.height ?? 0}
                            onChange={(event) =>
                              updateLayout('productImage', () => ({ height: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedType === 'qr' && (
                    <div className="form-section">
                      <div className="form-section-title">Tamanho</div>
                      <div className="form-grid">
                        <label>
                          <span>Tamanho</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            step={0.5}
                            value={selectedElement.size ?? 4}
                            onChange={(event) =>
                              updateLayout(selectedKey, () => ({ size: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {(selectedType === 'text' || selectedKey === 'poInfo') && (
                    <div className="form-section">
                      <div className="form-section-title">Fonte</div>
                      <div className="form-grid">
                        <label>
                          <span>Tamanho da fonte</span>
                          <input
                            type="number"
                            min={8}
                            max={100}
                            value={selectedElement.fontSize ?? 20}
                            onChange={(event) =>
                              updateLayout(selectedKey, () => ({ fontSize: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedType === 'barcode' && (
                    <div className="form-section">
                      <div className="form-section-title">Dimensões</div>
                      <div className="form-grid">
                        <label>
                          <span>Largura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(100)}
                            max={dotsToCm(700)}
                            value={selectedElement.width ?? dotsToCm(400)}
                            onChange={(event) =>
                              updateLayout('barcode', () => ({ width: Number(event.target.value) }))
                            }
                          />
                        </label>
                        <label>
                          <span>Altura (cm)</span>
                          <input
                            type="number"
                            step="0.01"
                            min={dotsToCm(20)}
                            max={dotsToCm(400)}
                            value={selectedElement.height ?? dotsToCm(57)}
                            onChange={(event) =>
                              updateLayout('barcode', () => ({ height: Number(event.target.value) }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="panel-help">Selecione um elemento para editar as propriedades.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal para salvar layout com nome */}
      {showSaveModal && (
        <div className="modal-backdrop" style={{ zIndex: 10001 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Salvar Layout</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  <span>Nome do Layout</span>
                  <input
                    type="text"
                    value={saveLayoutName}
                    onChange={(e) => setSaveLayoutName(e.target.value)}
                    placeholder="Digite o nome do layout"
                    disabled={isSaving}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && saveLayoutName.trim()) {
                        const exists = availableLayouts.find(l => l.name === saveLayoutName.trim());
                        if (exists) {
                          if (window.confirm(`Layout "${saveLayoutName}" já existe. Deseja sobrescrever?`)) {
                            handleSaveLayout(saveLayoutName.trim(), true);
                          }
                        } else {
                          handleSaveLayout(saveLayoutName.trim(), false);
                        }
                      }
                    }}
                  />
                </label>
              </div>
              {saveLayoutName.trim() && availableLayouts.find(l => l.name === saveLayoutName.trim()) && (
                <div className="alert alert-warning" style={{ marginTop: '12px', padding: '12px' }}>
                  ⚠️ Um layout com este nome já existe. Ao salvar, ele será sobrescrito.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (saveLayoutName.trim()) {
                    const exists = availableLayouts.find(l => l.name === saveLayoutName.trim());
                    if (exists) {
                      if (window.confirm(`Layout "${saveLayoutName}" já existe. Deseja sobrescrever?`)) {
                        handleSaveLayout(saveLayoutName.trim(), true);
                      }
                    } else {
                      handleSaveLayout(saveLayoutName.trim(), false);
                    }
                  } else {
                    toast.error('Por favor, digite um nome para o layout.');
                  }
                }}
                disabled={isSaving || !saveLayoutName.trim()}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabelLayoutEditor;
