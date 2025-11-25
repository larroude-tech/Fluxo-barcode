/**
 * Módulo para busca na view PostgreSQL
 * Conecta ao banco e busca informações do produto
 */

const { Pool } = require('pg');

class DatabaseQuery {
  constructor(config) {
    this.pool = null;
    this.config = config || {};
    this.connected = false;
  }

  /**
   * Conecta ao banco de dados PostgreSQL
   */
  async connect() {
    if (this.pool && this.connected) {
      return true;
    }

    try {
      // Configuração do banco via config.js ou variáveis de ambiente
      const dbConfig = {
        host: this.config.dbHost || process.env.DB_HOST || 'localhost',
        port: this.config.dbPort || process.env.DB_PORT || 5432,
        database: this.config.dbDatabase || process.env.DB_DATABASE,
        user: this.config.dbUser || process.env.DB_USER,
        password: this.config.dbPassword || process.env.DB_PASSWORD,
        ssl: this.config.dbSsl || process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 5, // Máximo de conexões no pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      };

      // Verificar se tem configurações mínimas
      if (!dbConfig.database || !dbConfig.user) {
        console.warn('[DB] Configurações de banco não fornecidas. Busca desabilitada.');
        return false;
      }

      this.pool = new Pool(dbConfig);

      // Testar conexão
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.connected = true;
      console.log('[DB] ✅ Conectado ao PostgreSQL');
      return true;
    } catch (error) {
      console.error('[DB] ❌ Erro ao conectar ao PostgreSQL:', error.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Desconecta do banco de dados
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
      console.log('[DB] Desconectado do PostgreSQL');
    }
  }

  /**
   * Busca informações do produto na view usando barcode e PO
   */
  async lookupByBarcodeAndPO(barcode, poNumber) {
    if (!this.connected || !this.pool) {
      await this.connect();
    }

    if (!this.connected || !this.pool) {
      return null;
    }

    try {
      // Buscar na view senda.vw_labels_variants_barcode
      const query = `
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
        WHERE barcode = $1
          AND ordem_pedido = $2
        LIMIT 1
      `;

      const result = await this.pool.query(query, [barcode, poNumber]);

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          sku: row.vpn || row.sku || null,
          vpm: row.vpn || row.sku || null,
          styleName: row.style_name || null,
          color: row.color || row.description_label || null,
          size: row.size || null,
          variant: row.size && row.color ? `${row.color} - ${row.size}` : null,
          barcode: row.barcode || barcode,
          poNumber: row.ordem_pedido || poNumber,
          referencia: row.referencia || null,
          qty: row.qty || 1
        };
      }

      return null;
    } catch (error) {
      console.error('[DB] ❌ Erro ao buscar na view:', error.message);
      return null;
    }
  }

  /**
   * Busca informações do produto apenas por barcode (tenta encontrar qualquer PO)
   */
  async lookupByBarcode(barcode) {
    if (!this.connected || !this.pool) {
      await this.connect();
    }

    if (!this.connected || !this.pool) {
      return null;
    }

    try {
      const query = `
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
        WHERE barcode = $1
        ORDER BY ordem_pedido DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [barcode]);

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          sku: row.vpn || row.sku || null,
          vpm: row.vpn || row.sku || null,
          styleName: row.style_name || null,
          color: row.color || row.description_label || null,
          size: row.size || null,
          variant: row.size && row.color ? `${row.color} - ${row.size}` : null,
          barcode: row.barcode || barcode,
          poNumber: row.ordem_pedido || null,
          referencia: row.referencia || null,
          qty: row.qty || 1
        };
      }

      return null;
    } catch (error) {
      console.error('[DB] ❌ Erro ao buscar por barcode:', error.message);
      return null;
    }
  }

  /**
   * Verifica se está conectado
   */
  isConnected() {
    return this.connected && this.pool !== null;
  }
}

module.exports = DatabaseQuery;

