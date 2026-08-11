import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchStocks, fetchWarehouses, fetchStockGodowns, unwrapList } from '../services/api';
import LiveSearch from './LiveSearch';
import { useSettings } from '../contexts/SettingsContext';

const TAX_RATES = ['0%', '5%', '12%', '18%', '28%'];
const UNITS = ['Pcs', 'Kg', 'Ltr', 'Box', 'Mtr', 'Set', 'Nos'];

const emptyItem = () => ({
  id: Date.now() + Math.random(),
  name: '',
  guid: '',
  hsn: '',
  qty: 1,
  unit: 'Pcs',
  rate: '',
  tax: '18%',
  amount: 0,
  warehouse: '',
  closingQty: null,
});

export default function ItemsTable({ warehouse, onWarehouseChange, onItemsChange }) {
  const { formatAmount } = useSettings();
  const [items, setItems] = useState([emptyItem()]);
  const [companyWarehouses, setCompanyWarehouses] = useState([]); // [{name}]
  const [itemGodowns, setItemGodowns] = useState({}); // itemId -> [{name, qty}]
  const [whLoading, setWhLoading] = useState(false);
  const { selectedCompany } = useAuth();
  const [stockMap, setStockMap] = useState({});

  const pushItems = (next) => {
    setItems(next);
    onItemsChange?.(next);
  };

  useEffect(() => {
    if (!selectedCompany?.guid) return;
    setWhLoading(true);
    fetchWarehouses(selectedCompany.guid)
      .then(res => {
        const list = unwrapList(res);
        setCompanyWarehouses(list.map(w => ({
          name: w.name,
          qty: w.qty != null ? parseFloat(w.qty) : null,
        })).filter(w => w.name));
      })
      .catch(() => setCompanyWarehouses([]))
      .finally(() => setWhLoading(false));
  }, [selectedCompany?.guid]);

  const fetchProducts = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchStocks({
      companyGuid: selectedCompany.guid,
      searchText: q || '',
      pageSize: 50,
    });
    const stocks = res?.data?.stocks || [];
    const map = {};
    stocks.forEach(s => { map[s.name] = s; });
    setStockMap(prev => ({ ...prev, ...map }));
    return stocks.map(s => ({
      label: s.name,
      value: s.name,
      sub: s.unit
        ? `Unit: ${s.unit}${s.closing_qty != null ? ` · Stock: ${parseFloat(s.closing_qty).toFixed(0)}` : ''}`
        : '',
      badge: s.hsn || '',
    }));
  }, [selectedCompany?.guid]);

  const loadGodownsForItem = async (itemId, stock) => {
    if (!selectedCompany?.guid || !stock) return;
    const id = stock.guid || stock.name;
    try {
      const res = await fetchStockGodowns(selectedCompany.guid, id);
      const list = res?.data?.warehouses || unwrapList(res) || [];
      const godowns = (Array.isArray(list) ? list : []).map(g => ({
        name: g.name,
        qty: parseFloat(g.qty) || 0,
      }));
      const finalGodowns = godowns.length > 0
        ? godowns
        : [{ name: 'Main Location', qty: parseFloat(stock.closing_qty) || 0 }];
      setItemGodowns(prev => ({ ...prev, [itemId]: finalGodowns }));
      return finalGodowns;
    } catch {
      const fallback = companyWarehouses.length
        ? companyWarehouses.map(w => ({ name: w.name, qty: w.qty }))
        : [{ name: 'Main Location', qty: parseFloat(stock.closing_qty) || 0 }];
      setItemGodowns(prev => ({ ...prev, [itemId]: fallback }));
      return fallback;
    }
  };

  const update = (id, field, val) => {
    const updated = items.map(i => {
      if (i.id !== id) return i;
      const item = { ...i, [field]: val };
      item.amount = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
      return item;
    });
    pushItems(updated);
    if (field === 'warehouse' && onWarehouseChange) onWarehouseChange(val);
  };

  const handleProductSelect = async (id, name) => {
    const stock = stockMap[name];
    let next = items.map(i => {
      if (i.id !== id) return i;
      return {
        ...i,
        name,
        guid: stock?.guid || '',
        unit: stock?.unit || i.unit,
        hsn: stock?.hsn || i.hsn,
        rate: stock?.closing_rate != null && stock.closing_rate !== '' ? stock.closing_rate : i.rate,
        closingQty: stock?.closing_qty != null ? parseFloat(stock.closing_qty) : null,
        warehouse: '',
        amount: (parseFloat(i.qty) || 1) * (parseFloat(stock?.closing_rate ?? i.rate) || 0),
      };
    });
    pushItems(next);

    if (stock) {
      const godowns = await loadGodownsForItem(id, stock);
      if (godowns?.length === 1) {
        next = next.map(i => (i.id === id ? { ...i, warehouse: godowns[0].name } : i));
        pushItems(next);
        onWarehouseChange?.(godowns[0].name);
      }
    }
  };

  const remove = (id) => {
    if (items.length === 1) return;
    const updated = items.filter(i => i.id !== id);
    pushItems(updated);
    setItemGodowns(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const add = () => {
    pushItems([...items, emptyItem()]);
  };

  const optionsForItem = (item) => {
    const perItem = itemGodowns[item.id];
    if (perItem?.length) return perItem;
    if (companyWarehouses.length) {
      return companyWarehouses.map(w => ({ name: w.name, qty: w.qty }));
    }
    return [];
  };

  const formatWhLabel = (w, unit) => {
    if (w.qty == null || Number.isNaN(w.qty)) return w.name;
    return `${w.name} (${Math.round(w.qty)} ${unit || 'units'})`;
  };

  return (
    <div>
      {/* Shared default warehouse (used when item has no per-line godown yet) */}
      <div className="flex items-center gap-3 mb-4">
        <Package size={14} className="text-[#787774] flex-shrink-0" />
        <select
          value={warehouse || ''}
          onChange={e => onWarehouseChange?.(e.target.value)}
          className="notion-input text-sm flex-1 max-w-xs"
        >
          <option value="">
            {whLoading ? 'Loading warehouses…' : companyWarehouses.length ? 'Default warehouse (optional)' : 'No warehouses found'}
          </option>
          {companyWarehouses.map(w => (
            <option key={w.name} value={w.name}>
              {formatWhLabel(w, 'units')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const whOpts = optionsForItem(item);
          return (
            <div key={item.id} className="border border-[#E8E7E3] rounded-xl p-3 bg-[#FAFAFA] hover:border-[#C7C5C0] transition-colors">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-5 h-5 rounded-full bg-[#E8E7E3] text-[10px] font-bold text-[#787774] flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <LiveSearch
                    value={item.name}
                    onChange={name => handleProductSelect(item.id, name)}
                    placeholder="Search product / service..."
                    fetchFn={fetchProducts}
                  />
                </div>
                {item.hsn ? (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#2563EB] text-[9px] font-semibold tracking-wide">
                    HSN {item.hsn}
                  </span>
                ) : null}
                <button
                  onClick={() => remove(item.id)}
                  disabled={items.length === 1}
                  className="w-6 h-6 flex items-center justify-center rounded text-[#AEACA8] hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Per-item warehouse with qty (mobile parity) */}
              <div className="mb-2.5">
                <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Warehouse</p>
                <select
                  value={item.warehouse || ''}
                  onChange={e => update(item.id, 'warehouse', e.target.value)}
                  className="notion-input text-xs w-full"
                  disabled={!item.name && whOpts.length === 0}
                >
                  <option value="">
                    {!item.name
                      ? 'Select product first'
                      : whOpts.length
                        ? 'Select warehouse'
                        : 'No godown qty found'}
                  </option>
                  {whOpts.map(w => (
                    <option key={w.name} value={w.name}>
                      {formatWhLabel(w, item.unit)}
                    </option>
                  ))}
                </select>
                {item.closingQty != null && (
                  <p className="text-[10px] text-[#AEACA8] mt-1">
                    Total stock: {Math.round(item.closingQty)} {item.unit || 'units'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-1">
                  <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Qty</p>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={item.qty}
                    onChange={e => update(item.id, 'qty', e.target.value)}
                    className="notion-input text-xs w-full"
                  />
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Unit</p>
                  <select
                    value={item.unit}
                    onChange={e => update(item.id, 'unit', e.target.value)}
                    className="notion-input text-xs w-full"
                  >
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Rate (₹)</p>
                  <input
                    type="number" placeholder="0.00" min="0" step="0.01"
                    value={item.rate}
                    onChange={e => update(item.id, 'rate', e.target.value)}
                    className="notion-input text-xs w-full"
                  />
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Tax</p>
                  <select
                    value={item.tax}
                    onChange={e => update(item.id, 'tax', e.target.value)}
                    className="notion-input text-xs w-full"
                  >
                    {TAX_RATES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex flex-col justify-end">
                  <p className="text-[9px] text-[#AEACA8] font-semibold uppercase tracking-wide mb-1">Amount</p>
                  <div className="h-[30px] flex items-center justify-end">
                    <span className="text-sm font-bold text-[#1A1A1A]">
                      {formatAmount ? formatAmount(item.amount || 0) : `₹${(item.amount || 0).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={add}
        className="flex items-center gap-1.5 mt-3 text-xs text-[#1A1A1A] hover:text-[#787774] font-medium transition-colors"
      >
        <Plus size={13} /> Add Item
      </button>
    </div>
  );
}
