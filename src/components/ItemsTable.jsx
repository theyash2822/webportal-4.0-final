import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchStocks, fetchWarehouses, unwrapList } from '../services/api';
import LiveSearch from './LiveSearch';
import { useSettings } from '../contexts/SettingsContext';

const TAX_RATES = ['0%', '5%', '12%', '18%', '28%'];
const UNITS = ['Pcs', 'Kg', 'Ltr', 'Box', 'Mtr', 'Set', 'Nos'];

const emptyItem = () => ({ id: Date.now(), name: '', hsn: '', qty: 1, unit: 'Pcs', rate: '', tax: '18%', amount: 0 });

export default function ItemsTable({ warehouse, onWarehouseChange, onItemsChange }) {
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const [items, setItems] = useState([emptyItem()]);
  const [warehouses, setWarehouses] = useState([]);
  const [whLoading, setWhLoading] = useState(false);
  const { selectedCompany } = useAuth();

  useEffect(() => {
    if (!selectedCompany?.guid) return;
    setWhLoading(true);
    fetchWarehouses(selectedCompany.guid)
      .then(res => {
        const list = unwrapList(res);
        setWarehouses(list.map(w => w.name).filter(Boolean));
      })
      .catch(() => setWarehouses([]))
      .finally(() => setWhLoading(false));
  }, [selectedCompany?.guid]);

  const [stockMap, setStockMap] = useState({});

  const fetchProducts = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchStocks({ companyGuid: selectedCompany.guid, searchText: q, pageSize: 20 });
    const stocks = res?.data?.stocks || [];
    const map = {};
    stocks.forEach(s => { map[s.name] = s; });
    setStockMap(prev => ({ ...prev, ...map }));
    return stocks.map(s => ({
      label: s.name, value: s.name,
      sub: s.unit ? `Unit: ${s.unit}${s.closing_qty ? ` · Stock: ${parseFloat(s.closing_qty).toFixed(0)}` : ''}` : '',
      badge: s.hsn || '',
    }));
  }, [selectedCompany?.guid]);

  const update = (id, field, val) => {
    const updated = items.map(i => {
      if (i.id !== id) return i;
      const item = { ...i, [field]: val };
      item.amount = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
      return item;
    });
    setItems(updated);
    onItemsChange?.(updated);
  };

  const handleProductSelect = (id, name) => {
    const stock = stockMap[name];
    const updated = items.map(i => {
      if (i.id !== id) return i;
      return {
        ...i,
        name,
        unit: stock?.unit || i.unit,
        hsn: stock?.hsn || i.hsn,
        amount: (parseFloat(i.qty) || 1) * (parseFloat(i.rate) || 0),
      };
    });
    setItems(updated);
    onItemsChange?.(updated);
  };

  const remove = (id) => {
    if (items.length === 1) return;
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    onItemsChange?.(updated);
  };

  const add = () => {
    const updated = [...items, emptyItem()];
    setItems(updated);
    onItemsChange?.(updated);
  };

  return (
    <div>
      {/* Warehouse selector */}
      <div className="flex items-center gap-3 mb-4">
        <Package size={14} className="text-[#787774] flex-shrink-0" />
        <select
          value={warehouse}
          onChange={e => onWarehouseChange?.(e.target.value)}
          className="notion-input text-sm flex-1 max-w-xs"
        >
          <option value="">
            {whLoading ? 'Loading warehouses…' : warehouses.length ? 'Select Warehouse' : 'No warehouses found'}
          </option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      {/* Item cards */}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={item.id} className="border border-[#E8E7E3] rounded-xl p-3 bg-[#FAFAFA] hover:border-[#C7C5C0] transition-colors">

            {/* Row 1: index + product name + HSN badge + delete */}
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

            {/* Row 2: Qty · Unit · Rate · Tax · Amount */}
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
                    ₹{(item.amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

          </div>
        ))}
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
