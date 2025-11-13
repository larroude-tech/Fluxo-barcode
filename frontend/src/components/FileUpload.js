import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Database, Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import './components.css';

const DataSelector = ({ onDataLoaded }) => {
  const [poList, setPoList] = useState([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState(null);

  const [selectedPo, setSelectedPo] = useState('');
  const [rawData, setRawData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [skuFilter, setSkuFilter] = useState('ALL');

  const skuOptions = useMemo(() => {
    const skus = new Set();
    rawData.forEach((item) => {
      if (item.VPN) {
        skus.add(item.VPN);
      }
    });
    return Array.from(skus).sort();
  }, [rawData]);

  const [poSearch, setPoSearch] = useState('');

  const filteredPoList = useMemo(() => {
    if (!poSearch.trim()) {
      return poList;
    }
    const search = poSearch.toLowerCase().trim();
    return poList.filter((po) => po && po.toString().toLowerCase().includes(search));
  }, [poList, poSearch]);

  useEffect(() => {
    // Atualiza seleção automaticamente quando o texto corresponde a uma PO existente
    const exactMatch = poList.find((po) => po && po.toString().toLowerCase() === poSearch.toLowerCase());
    if (exactMatch) {
      setSelectedPo(exactMatch);
    }
  }, [poSearch, poList]);

  useEffect(() => {
    const fetchPos = async () => {
      setPoLoading(true);
      setPoError(null);
      try {
        const { data } = await axios.get('/api/purchase-orders');
        setPoList(data?.data || []);
      } catch (error) {
        console.error(error);
        const message = error.response?.data?.error || error.message || 'Não foi possível carregar as POs';
        setPoError(message);
        toast.error(message);
      } finally {
        setPoLoading(false);
      }
    };

    fetchPos();
  }, []);

  useEffect(() => {
    if (!selectedPo) {
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        const { data } = await axios.get('/api/labels', {
          params: { po: selectedPo }
        });

        const rows = data?.data || [];
        setRawData(rows);
        setSkuFilter('ALL');
        onDataLoaded(rows, { po: selectedPo });
        toast.success(
          rows.length
            ? `${rows.length} itens carregados para PO ${selectedPo}`
            : `PO ${selectedPo} sem itens na view`
        );
      } catch (error) {
        console.error(error);
        const message = error.response?.data?.error || error.message || 'Erro ao carregar itens dessa PO';
        toast.error(message);
        setRawData([]);
        onDataLoaded([], { po: selectedPo, error: true });
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [selectedPo, onDataLoaded]);

  useEffect(() => {
    if (!rawData.length) {
      return;
    }

    if (skuFilter === 'ALL') {
      onDataLoaded(rawData, { po: selectedPo });
      return;
    }

    const filtered = rawData.filter((item) => item.VPN === skuFilter);
    onDataLoaded(filtered, { po: selectedPo, sku: skuFilter });
  }, [skuFilter, rawData, onDataLoaded, selectedPo]);

  const retryPoList = () => {
    setPoList([]);
    setSelectedPo('');
    setRawData([]);
    setSkuFilter('ALL');
    setPoError(null);
    onDataLoaded(null);
  };

  return (
    <div className="card">
      <div className="data-selector-header">
        <h3>
          <Database size={18} />
          Selecione a PO
        </h3>
        <button
          className="btn btn-icon"
          onClick={retryPoList}
          title="Recarregar lista de POs"
          disabled={poLoading}
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="po-select">Escolha a PO (ordem_pedido)</label>
        <input
          type="text"
          className="input"
          placeholder="Pesquisar PO..."
          value={poSearch}
          onChange={(event) => setPoSearch(event.target.value)}
          list="po-options"
        />
        <datalist id="po-options">
          {filteredPoList.map((po) => (
            <option key={po} value={po} />
          ))}
        </datalist>
        <div className="select-wrapper">
          {poLoading && <Loader2 className="spinner-inline" size={18} />}
          <select
            id="po-select"
            value={selectedPo}
            onChange={(event) => setSelectedPo(event.target.value)}
            disabled={poLoading || !filteredPoList.length}
          >
            <option value="">Selecione uma PO...</option>
            {filteredPoList.map((po) => (
              <option key={po} value={po}>
                {po}
              </option>
            ))}
          </select>
        </div>
        {poError && <p className="error">{poError}</p>}
      </div>

      {rawData.length > 0 && (
        <div className="form-group">
          <label htmlFor="sku-select">Filtrar por SKU (opcional)</label>
          <div className="select-wrapper">
            {dataLoading && <Loader2 className="spinner-inline" size={18} />}
            <select
              id="sku-select"
              value={skuFilter}
              onChange={(event) => setSkuFilter(event.target.value)}
              disabled={dataLoading}
            >
              <option value="ALL">Todos os itens ({rawData.length})</option>
              {skuOptions.map((sku) => (
                <option key={sku} value={sku}>
                  {sku}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {dataLoading && (
        <div className="info">
          <Loader2 className="spinner-inline" size={16} />
          Carregando itens da view...
        </div>
      )}
    </div>
  );
};

export default DataSelector;