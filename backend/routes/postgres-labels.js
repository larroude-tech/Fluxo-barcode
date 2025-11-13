const normalizeLabelRow = (row = {}) => {
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
  const po = (row.ordem_pedido || row.po || '').toString().trim();
  const local = referencia ? `Local.${referencia}` : '';

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
    IMAGE_URL: row.image_url || ''
  };
};

module.exports = (app, pool) => {
  app.get('/api/purchase-orders', async (req, res) => {
    console.log('[DB] [PO-LIST] Solicitando lista de POs...');
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT ordem_pedido
        FROM senda.vw_labels_variants_barcode
        WHERE ordem_pedido IS NOT NULL
        ORDER BY ordem_pedido
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
    const { po, sku } = req.query;

    if (!po) {
      return res.status(400).json({ error: 'Parâmetro "po" é obrigatório' });
    }

    console.log(`[DB] [LABELS] Solicitando dados para PO=${po}${sku ? `, SKU=${sku}` : ''}`);
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

      const { rows } = await pool.query(query, params);
      const data = rows.map(normalizeLabelRow);

      console.log(`[DB] [LABELS] ${data.length} registro(s) retornado(s) para PO=${po}${sku ? `, SKU=${sku}` : ''}`);
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
};
