import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config';
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

  // Removido: atualização automática - agora é feito no onChange do input

  useEffect(() => {
    const fetchPos = async () => {
      setPoLoading(true);
      setPoError(null);
      try {
        const { data } = await axios.get(`${API_BASE_URL}/purchase-orders`);
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
        const { data } = await axios.get(`${API_BASE_URL}/labels`, {
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


  return (
    <div className="card">
      <div className="form-group">
        <div style={{ position: 'relative' }}>
          {(poLoading || dataLoading) && (
            <Loader2 
              className="spinner-inline" 
              size={18} 
              style={{ 
                position: 'absolute', 
                right: '12px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                pointerEvents: 'none'
              }} 
            />
          )}
          <input
            id="po-search"
            type="text"
            className="input"
            placeholder="Digite ou selecione a PO..."
            value={poSearch}
            onChange={(event) => {
              // Não permitir edição se estiver carregando dados
              if (dataLoading) {
                return;
              }
              const value = event.target.value;
              setPoSearch(value);
              // Atualizar selectedPo quando o texto mudar e corresponder a uma PO
              const trimmedValue = value.trim();
              if (trimmedValue) {
                const exactMatch = poList.find((po) => po && po.toString().toLowerCase() === trimmedValue.toLowerCase());
                if (exactMatch) {
                  setSelectedPo(exactMatch);
                } else {
                  // Se não houver correspondência exata, limpar selectedPo
                  setSelectedPo('');
                }
              } else {
                setSelectedPo('');
              }
            }}
            onInput={(event) => {
              // Não permitir edição se estiver carregando dados
              if (dataLoading) {
                return;
              }
              // Quando uma opção do datalist é selecionada
              const value = event.target.value.trim();
              if (value) {
                const exactMatch = poList.find((po) => po && po.toString().toLowerCase() === value.toLowerCase());
                if (exactMatch) {
                  setSelectedPo(exactMatch);
                }
              }
            }}
            onKeyDown={(event) => {
              if (dataLoading) {
                event.preventDefault();
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                const value = poSearch.trim();
                if (value) {
                  // Tentar encontrar correspondência exata ou usar o valor digitado
                  const exactMatch = poList.find((po) => po && po.toString().toLowerCase() === value.toLowerCase());
                  if (exactMatch) {
                    setSelectedPo(exactMatch);
                    setPoSearch(exactMatch);
                  } else if (poList.length > 0) {
                    // Se não houver correspondência exata, usar o valor digitado mesmo assim
                    setSelectedPo(value);
                  }
                }
              }
            }}
            onBlur={() => {
              // Quando sair do campo, verificar se há correspondência exata
              if (dataLoading) {
                return;
              }
              const value = poSearch.trim();
              if (value) {
                const exactMatch = poList.find((po) => po && po.toString().toLowerCase() === value.toLowerCase());
                if (exactMatch) {
                  setSelectedPo(exactMatch);
                  setPoSearch(exactMatch);
                }
              }
            }}
            list="po-options"
            disabled={poLoading || dataLoading}
            style={{ 
              opacity: (poLoading || dataLoading) ? 0.6 : 1,
              cursor: (poLoading || dataLoading) ? 'not-allowed' : 'text'
            }}
          />
          <datalist id="po-options">
            {filteredPoList.map((po) => (
              <option key={po} value={po} />
            ))}
          </datalist>
        </div>
        {poError && <p className="error">{poError}</p>}
        {dataLoading && (
          <p className="info" style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
            <Loader2 className="spinner-inline" size={14} />
            Carregando itens da PO...
          </p>
        )}
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