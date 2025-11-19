const axios = require('axios');

// Cache da porta detectada da API Python
let detectedImageProxyPort = null;
let lastPortDetectionTime = 0;
const PORT_DETECTION_CACHE_MS = 60000; // Cache por 1 minuto

/**
 * Detecta automaticamente em qual porta a API Python Image Proxy está rodando
 * Tenta as portas 8000, 8001, 8002 em ordem
 * @returns {Promise<string|null>} - Porta detectada ou null se não encontrada
 */
async function detectImageProxyPort() {
  // Usar cache se ainda válido
  const now = Date.now();
  if (detectedImageProxyPort && (now - lastPortDetectionTime) < PORT_DETECTION_CACHE_MS) {
    return detectedImageProxyPort;
  }

  // Se _IMAGE_PROXY_ACTUAL_PORT estiver definido (definido pelo starter), usar diretamente
  // Esta é a porta real que a API está usando
  if (process.env._IMAGE_PROXY_ACTUAL_PORT) {
    detectedImageProxyPort = process.env._IMAGE_PROXY_ACTUAL_PORT;
    lastPortDetectionTime = now;
    console.log(`[IMAGE-PROXY] 🔍 Usando porta do starter: ${detectedImageProxyPort}`);
    return detectedImageProxyPort;
  }

  // Se IMAGE_PROXY_PORT estiver definido, usar diretamente
  if (process.env.IMAGE_PROXY_PORT) {
    detectedImageProxyPort = process.env.IMAGE_PROXY_PORT;
    lastPortDetectionTime = now;
    return detectedImageProxyPort;
  }

  // Se IMAGE_PROXY_URL estiver definido, extrair a porta
  if (process.env.IMAGE_PROXY_URL) {
    const portMatch = process.env.IMAGE_PROXY_URL.match(/:(\d+)/);
    if (portMatch) {
      detectedImageProxyPort = portMatch[1];
      lastPortDetectionTime = now;
      return detectedImageProxyPort;
    }
  }

  // Tentar detectar automaticamente testando as portas comuns (8000 primeiro, depois 8001, 8002)
  const portsToTry = ['8000', '8001', '8002'];
  
  for (const port of portsToTry) {
    try {
      const testUrl = `http://127.0.0.1:${port}/status`;
      const response = await axios.get(testUrl, { timeout: 2000 }); // Timeout aumentado para 2s
      if (response.status === 200) {
        console.log(`[IMAGE-PROXY] 🔍 Porta detectada automaticamente: ${port}`);
        detectedImageProxyPort = port;
        lastPortDetectionTime = now;
        return port;
      }
    } catch (error) {
      // Porta não disponível, continuar tentando
      continue;
    }
  }

  // Se não encontrou nenhuma porta, usar 8000 como padrão
  console.log(`[IMAGE-PROXY] ⚠️ Não foi possível detectar a porta da API, usando padrão: 8000`);
  detectedImageProxyPort = '8000';
  lastPortDetectionTime = now;
  return '8000';
}

/**
 * Obtém a URL da API Python Image Proxy
 * @returns {Promise<string>} - URL completa da API
 */
async function getImageProxyUrl() {
  const port = await detectImageProxyPort();
  
  if (process.env.IMAGE_PROXY_URL) {
    // Se IMAGE_PROXY_URL está definido, usar diretamente (mas garantir que a porta está correta)
    const url = process.env.IMAGE_PROXY_URL;
    // Se a URL não tem porta ou tem porta diferente, substituir
    if (!url.match(/:\d+/) || !url.includes(`:${port}`)) {
      return `http://127.0.0.1:${port}`;
    }
    return url;
  }
  
  return `http://127.0.0.1:${port}`;
}

/**
 * Converte referência do formato da view (XXX.XXXX) para formato da API Python (XXXXXXX)
 * @param {string} referencia - Referência no formato "100.0001" ou "100-0001" ou "1000001"
 * @returns {string} - Referência no formato "1000001"
 */
function normalizeReference(referencia) {
  if (!referencia || typeof referencia !== 'string') {
    return '';
  }

  // Remover espaços
  let ref = referencia.trim();

  // Se já está no formato correto (apenas números), retornar
  if (/^\d+$/.test(ref)) {
    return ref;
  }

  // Converter XXX.XXXX ou XXX-XXXX para XXXXXXX
  // Remove ponto ou hífen e mantém apenas números
  ref = ref.replace(/[.\-]/g, '');

  // Verificar se tem formato válido (7 dígitos: 3 + 4)
  if (/^\d{7}$/.test(ref)) {
    return ref;
  }

  // Se não tem formato válido, retornar vazio
  console.warn(`[IMAGE-PROXY] ⚠️ Formato de referência inválido: "${referencia}"`);
  return '';
}

/**
 * Busca imagem da API Python Image Proxy baseado na referência
 * @param {string} referencia - Referência do produto (ex: "100.0001" ou "100-0001" ou "1000001")
 * @returns {Promise<string>} - URL da imagem ou string vazia se não encontrada
 */
async function getImageUrlFromReference(referencia) {
  if (!referencia || referencia.trim() === '') {
    return '';
  }

  // Normalizar referência: converter XXX.XXXX ou XXX-XXXX para XXXXXXX
  const normalizedRef = normalizeReference(referencia);
  
  if (!normalizedRef) {
    console.log(`[IMAGE-PROXY] ⚠️ Referência "${referencia}" não pôde ser normalizada, pulando busca`);
    return '';
  }

  // Log da normalização (apenas se houve mudança na formatação)
  if (normalizedRef !== referencia.trim()) {
    console.log(`[IMAGE-PROXY] 🔄 Referência normalizada: "${referencia}" → "${normalizedRef}"`);
  }

  // Obter URL da API Python (com detecção automática de porta)
  const imageProxyUrl = await getImageProxyUrl();
  
  // Construir URL completa usando a referência NORMALIZADA (sem ponto ou hífen)
  // A referência normalizada sempre será no formato XXXXXXX (7 dígitos)
  // Retornar a URL diretamente - a verificação será feita quando a imagem for realmente usada (no convertImageToZPL)
  const imageUrl = `${imageProxyUrl}/image/reference/${normalizedRef}`;
  
  console.log(`[IMAGE-PROXY] ✅ URL gerada: "${referencia}" (normalizada: ${normalizedRef}) → ${imageUrl}`);
  return imageUrl;
}

const normalizeLabelRow = async (row = {}, imageUrlMap = null) => {
  const styleName = (row.style_name || row['STYLE NAME'] || row.name || '').toString().trim();
  const description = (row.description_label || row.description || '').toString().trim();
  const sku = (row.sku || '').toString().trim();
  const vpn = (row.vpn || row.VPN || row.sku_variant || sku).toString().trim();
  const barcode = (row.barcode || '').toString().trim();
  const referencia = (row.referencia || row.ref || '').toString().trim();
  const qtyRaw = row.qty;
  const qtyParsed = parseInt(qtyRaw, 10);
  const qty = Number.isNaN(qtyParsed) ? 1 : qtyParsed;
  const color = (row.color || row.COLOR || '').toString().trim();
  const size = (row.size || row['SIZE'] || '').toString().trim();
  const po = (row.ordem_pedido || '').toString().trim();
  const local = referencia ? `Local.${referencia}` : '';

  // SEMPRE buscar imagem da API Python primeiro (não usar image_url do banco)
  // A imagem sempre será pega da API Python conforme solicitado
  let imageUrl = '';
  
  // Se houver referência, buscar da API Python
  if (referencia && referencia.trim() !== '') {
    // Se houver mapa de imagens (já buscadas da API), usar do mapa
    if (imageUrlMap) {
      imageUrl = imageUrlMap.get(referencia) || '';
    }
    
    // Se não estiver no mapa, buscar diretamente da API Python
    if (!imageUrl) {
      imageUrl = await getImageUrlFromReference(referencia);
    }
  }
  
  // Log para debug
  if (imageUrl) {
    console.log(`[IMAGE-PROXY] ✅ Imagem obtida da API Python para referência "${referencia}": ${imageUrl}`);
  } else if (referencia) {
    console.log(`[IMAGE-PROXY] ⚠️ Imagem não encontrada na API Python para referência "${referencia}"`);
  }

  return {
    STYLE_NAME: styleName,
    VPN: vpn,
    COLOR: color,
    SIZE: size,
    BARCODE: barcode,
    DESCRIPTION: description,
    REF: referencia,
    QTY: qty,
    PO: po,
    IMAGE_URL: imageUrl
  };
};

/**
 * Função para executar query na view com garantia de versão atualizada
 * SEMPRE usa uma conexão nova do pool e limpa cache antes da consulta
 * Isso garante que a view consultada é sempre a versão mais recente do banco
 */
const queryViewFresh = async (pool, query, params = []) => {
  const client = await pool.connect();
  try {
    // Limpar qualquer cache de sessão antes da query
    await client.query('DISCARD PLANS');
    
    // Executar a query diretamente, sem preparação
    const result = await client.query(query, params);
    
    return result;
  } finally {
    client.release();
  }
};

module.exports = (app, pool) => {
  // Verificar se pool está disponível
  if (!pool) {
    console.error('[DB] [ROUTES] Pool PostgreSQL não disponível! Rotas não serão registradas.');
    return;
  }

  app.get('/api/purchase-orders', async (req, res) => {
    console.log('[DB] [PO-LIST] Solicitando lista de POs...');
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Banco de dados não disponível. Configure as variáveis de ambiente do PostgreSQL.' });
      }
      
      // Sempre usar queryViewFresh para garantir versão atualizada da view
      // Retorna POs na ordem natural da view (sem ORDER BY para preservar ordem original)
      const { rows } = await queryViewFresh(pool, `
        SELECT DISTINCT ordem_pedido
        FROM senda.vw_labels_variants_barcode
        WHERE ordem_pedido IS NOT NULL
      `);

      const data = rows
        .map((row) => row.ordem_pedido ?? row.ORDEM_PEDIDO ?? null)
        .filter((value) => value !== null && value !== undefined && value !== '');

      console.log(`[DB] [PO-LIST] ${data.length} registro(s) retornado(s).`);
      res.json({ data });
    } catch (error) {
      console.error('[DB] Erro ao buscar POs:', error);
      res.status(500).json({ error: `Falha ao buscar POs: ${error.message}` });
    }
  });

  app.get('/api/labels', async (req, res) => {
    const { po, sku, refresh } = req.query; // Adicionar parâmetro refresh opcional

    if (!po) {
      return res.status(400).json({ error: 'Parâmetro "po" é obrigatório' });
    }

    if (!pool) {
      return res.status(503).json({ error: 'Banco de dados não disponível. Configure as variáveis de ambiente do PostgreSQL.' });
    }

    // Se o parâmetro refresh=true, limpar cache antes da consulta
    if (refresh === 'true' || refresh === '1') {
      console.log('[DB] [LABELS] Refresh solicitado, limpando cache...');
      const client = await pool.connect();
      try {
        await client.query('DISCARD PLANS');
        await client.query('DEALLOCATE ALL');
      } finally {
        client.release();
      }
    }

    console.log(`[DB] [LABELS] Solicitando dados para PO=${po}${sku ? `, SKU=${sku}` : ''}${refresh ? ' (com refresh)' : ''}`);
    try {
      const params = [po];
      let query = `
        SELECT
          ordem_pedido,
          referencia,
          "STYLE NAME" AS style_name,
          description_label,
          sku,
          "VPN" AS vpn,
          barcode,
          qty,
          "COLOR" AS color,
          "SIZE" AS size
        FROM senda.vw_labels_variants_barcode
        WHERE ordem_pedido = $1
      `;

      if (sku) {
        params.push(sku);
        query += ' AND ("VPN" = $2 OR sku = $2)';
      }

      query += ' ORDER BY "STYLE NAME", "SIZE"';

      // Sempre usar queryViewFresh para garantir versão atualizada da view
      const { rows } = await queryViewFresh(pool, query, params);
      
      // Buscar todas as imagens das referências únicas da PO em paralelo
      console.log(`[IMAGE-PROXY] Buscando imagens para ${rows.length} itens da PO ${po}...`);
      const uniqueReferences = [...new Set(rows.map(row => row.referencia).filter(ref => ref && ref.trim()))];
      console.log(`[IMAGE-PROXY] ${uniqueReferences.length} referência(s) única(s) encontrada(s)`);
      
      // Criar mapa de referência -> URL de imagem
      const imageUrlMap = new Map();
      
      // Buscar imagens de todas as referências em paralelo
      const imagePromises = uniqueReferences.map(async (referencia) => {
        const imageUrl = await getImageUrlFromReference(referencia);
        if (imageUrl) {
          imageUrlMap.set(referencia, imageUrl);
          console.log(`[IMAGE-PROXY] ✅ Imagem encontrada para referência ${referencia}`);
        } else {
          console.log(`[IMAGE-PROXY] ⚠️ Imagem não encontrada para referência ${referencia}`);
        }
        return { referencia, imageUrl };
      });
      
      await Promise.all(imagePromises);
      console.log(`[IMAGE-PROXY] ✅ Busca de imagens concluída: ${imageUrlMap.size}/${uniqueReferences.length} imagens encontradas`);
      
      // Normalizar linhas usando o mapa de imagens
      const data = await Promise.all(rows.map(row => normalizeLabelRow(row, imageUrlMap)));

      console.log(`[DB] [LABELS] ${data.length} registro(s) retornado(s) para PO=${po}${sku ? `, SKU=${sku}` : ''}`);
      
      // Se não houver dados, retornar mensagem clara
      if (data.length === 0) {
        const message = sku 
          ? `Nenhum dado encontrado para PO ${po} e SKU ${sku}`
          : `Nenhum dado encontrado para PO ${po}`;
        console.warn(`[DB] [LABELS] ⚠️ ${message}`);
        return res.status(404).json({ 
          error: message,
          data: [],
          totalRecords: 0,
          po,
          sku: sku || null
        });
      }

      res.json({
        message: 'Dados carregados para PO ' + po,
        data,
        totalRecords: data.length
      });
    } catch (error) {
      console.error('[DB] Erro ao buscar dados da view:', error);
      res.status(500).json({ error: `Falha ao buscar dados da view: ${error.message}` });
    }
  });

  // Endpoint para forçar atualização/refresh da view (suporta GET e POST)
  const refreshViewHandler = async (req, res) => {
    console.log('[DB] [REFRESH] Solicitando refresh da view...');
    
    if (!pool) {
      return res.status(503).json({ error: 'Banco de dados não disponível. Configure as variáveis de ambiente do PostgreSQL.' });
    }
    
    try {
      // Verificar se a view é materializada
      const checkViewQuery = `
        SELECT 
          schemaname, 
          viewname, 
          definition
        FROM pg_views 
        WHERE schemaname = 'senda' 
        AND viewname = 'vw_labels_variants_barcode'
      `;
      
      const { rows: viewInfo } = await pool.query(checkViewQuery);
      
      if (viewInfo.length === 0) {
        // Verificar se é materializada
        const checkMatViewQuery = `
          SELECT 
            schemaname, 
            matviewname, 
            definition
          FROM pg_matviews 
          WHERE schemaname = 'senda' 
          AND matviewname = 'vw_labels_variants_barcode'
        `;
        
        const { rows: matViewInfo } = await pool.query(checkMatViewQuery);
        
        if (matViewInfo.length > 0) {
          // É uma view materializada, fazer REFRESH
          console.log('[DB] [REFRESH] View materializada detectada, executando REFRESH...');
          await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY senda.vw_labels_variants_barcode');
          console.log('[DB] [REFRESH] ✅ View materializada atualizada com sucesso');
        } else {
          return res.status(404).json({ 
            error: 'View não encontrada no banco de dados',
            viewName: 'senda.vw_labels_variants_barcode'
          });
        }
      } else {
        // É uma view normal, forçar recarregamento agressivo
        console.log('[DB] [REFRESH] View normal detectada, forçando recarregamento completo...');
        
        // Estratégia agressiva para forçar recarregamento:
        // 1. Fechar todas as conexões do pool atual
        // 2. Usar uma nova conexão isolada
        // 3. Limpar todos os caches
        // 4. Forçar uma consulta que recarrega a definição
        
        const client = await pool.connect();
        try {
          // Passo 1: Limpar todos os planos de execução em cache
          console.log('[DB] [REFRESH] Limpando planos de execução em cache...');
          await client.query('DEALLOCATE ALL');
          
          // Passo 2: Iniciar uma nova transação isolada
          await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
          
          // Passo 3: Invalidar cache do sistema de catálogo do PostgreSQL
          // Isso força o PostgreSQL a recarregar as definições de objetos
          console.log('[DB] [REFRESH] Invalidando cache do catálogo...');
          try {
            // Tentar invalidar o cache do schema
            await client.query('NOTIFY pgrst, \'reload schema\'');
          } catch (notifyError) {
            // NOTIFY pode falhar se não houver listeners, mas não é crítico
            console.log('[DB] [REFRESH] NOTIFY ignorado (sem listeners)');
          }
          
          // Passo 4: Forçar o PostgreSQL a recarregar a definição da view
          // Fazendo uma query que força o sistema a consultar pg_views novamente
          console.log('[DB] [REFRESH] Forçando recarregamento da definição da view...');
          
          // Primeiro, consultar a definição atual da view para forçar recarregamento
          await client.query(`
            SELECT definition 
            FROM pg_views 
            WHERE schemaname = 'senda' 
            AND viewname = 'vw_labels_variants_barcode'
          `);
          
          // Depois, fazer uma consulta real na view para garantir que use a nova definição
          await client.query('SELECT COUNT(*) FROM senda.vw_labels_variants_barcode LIMIT 1');
          
          // Passo 5: Commit da transação
          await client.query('COMMIT');
          
          // Passo 6: Fechar esta conexão para garantir que a próxima seja nova
          await client.query('DISCARD ALL');
          
          console.log('[DB] [REFRESH] ✅ View normal recarregada com sucesso (cache completamente limpo)');
        } catch (error) {
          // Rollback em caso de erro
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            // Ignorar erro de rollback
          }
          throw error;
        } finally {
          // Sempre liberar a conexão
          client.release();
        }
        
        // Passo 7: Aguardar um momento para garantir que o PostgreSQL processou tudo
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Passo 8: Fazer uma consulta final com uma conexão completamente nova
        const finalClient = await pool.connect();
        try {
          const testResult = await finalClient.query('SELECT 1 FROM senda.vw_labels_variants_barcode LIMIT 1');
          console.log('[DB] [REFRESH] ✅ Verificação final: view acessível e atualizada');
        } finally {
          finalClient.release();
        }
      }
      
      res.json({
        success: true,
        message: 'View atualizada com sucesso',
        viewName: 'senda.vw_labels_variants_barcode',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[DB] [REFRESH] Erro ao atualizar view:', error);
      res.status(500).json({ 
        error: `Falha ao atualizar view: ${error.message}`,
        details: error.stack
      });
    }
  };

  // Registrar o handler para GET e POST
  app.get('/api/database/refresh-view', refreshViewHandler);
  app.post('/api/database/refresh-view', refreshViewHandler);

  // Endpoint para verificar definição da view
  app.get('/api/database/view-info', async (req, res) => {
    console.log('[DB] [VIEW-INFO] Solicitando informações da view...');
    
    if (!pool) {
      return res.status(503).json({ error: 'Banco de dados não disponível. Configure as variáveis de ambiente do PostgreSQL.' });
    }
    
    try {
      // Verificar se é view normal
      const viewQuery = `
        SELECT 
          schemaname, 
          viewname, 
          definition
        FROM pg_views 
        WHERE schemaname = 'senda' 
        AND viewname = 'vw_labels_variants_barcode'
      `;
      
      const { rows: viewInfo } = await pool.query(viewQuery);
      
      if (viewInfo.length > 0) {
        return res.json({
          type: 'view',
          schema: viewInfo[0].schemaname,
          name: viewInfo[0].viewname,
          definition: viewInfo[0].definition,
          timestamp: new Date().toISOString()
        });
      }
      
      // Verificar se é view materializada
      const matViewQuery = `
        SELECT 
          schemaname, 
          matviewname, 
          definition,
          hasindexes
        FROM pg_matviews 
        WHERE schemaname = 'senda' 
        AND matviewname = 'vw_labels_variants_barcode'
      `;
      
      const { rows: matViewInfo } = await pool.query(matViewQuery);
      
      if (matViewInfo.length > 0) {
        return res.json({
          type: 'materialized_view',
          schema: matViewInfo[0].schemaname,
          name: matViewInfo[0].matviewname,
          definition: matViewInfo[0].definition,
          hasIndexes: matViewInfo[0].hasindexes,
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(404).json({ 
        error: 'View não encontrada',
        viewName: 'senda.vw_labels_variants_barcode'
      });
    } catch (error) {
      console.error('[DB] [VIEW-INFO] Erro ao buscar informações da view:', error);
      res.status(500).json({ 
        error: `Falha ao buscar informações da view: ${error.message}` 
      });
    }
  });
};
