import { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, Warehouse, Search, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Table from '../../components/Table';
import Drawer from '../../components/Drawer';
import { useAuth } from '../../contexts/AuthContext';
import api, { unwrapList } from '../../services/api';
import wsService from '../../services/websocket';
import { useSettings } from '../../contexts/SettingsContext';

const fmt = n => n == null ? '—' : '₹' + Math.abs(Number(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TABS = ['Items List', 'Stock Alerts', 'Warehouses'];

const statusVariant = { Normal: 'green', 'Low Stock': 'yellow', 'Out of Stock': 'red' };

const itemCols = [
  { key: 'name',      label: 'Item Name',  render: v => <span className="font-medium text-[#1A1A1A]">{v}</span> },
  { key: 'category',  label: 'Category',   render: v => <span className="text-xs text-[#787774]">{v}</span> },
  { key: 'qty',       label: 'Stock Qty',  render: (v, r) => <span className={`font-semibold ${v > 0 ? 'text-[#1A1A1A]' : 'text-[#C0392B]'}`}>{v} {r.unit}</span> },
  { key: 'rate',      label: 'Rate',       render: v => fmt(v) },
  { key: 'value',     label: 'Value',      render: v => <span className="font-semibold">{fmt(v)}</span> },
  { key: 'status',    label: 'Status',     render: v => <Badge label={v} variant={statusVariant[v] || 'gray'} /> },
];

export default function InventoryModule() {
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [drawer, setDrawer] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState(['All']);
  const [warehouses, setWarehouses] = useState([]);
  const [whLoading, setWhLoading] = useState(false);
  const pageSize = 50;
  const { selectedCompany, selectedFY } = useAuth();

  const loadWarehouses = useCallback(async () => {
    if (!selectedCompany?.guid) return;
    setWhLoading(true);
    try {
      const res = await api.fetchWarehouses(selectedCompany.guid);
      const list = unwrapList(res);
      setWarehouses(list.map(w => ({
        id: w.id || w.guid || w.name,
        name: w.name || '—',
        parent: w.parent || w.parent_name || '—',
        address: w.address || w.godown_address || [w.address1, w.address2, w.city].filter(Boolean).join(', ') || '—',
      })));
    } catch {
      setWarehouses([]);
    } finally {
      setWhLoading(false);
    }
  }, [selectedCompany?.guid]);

  const loadStocks = useCallback(async (pg = 1, searchText = '', cat = categoryFilter) => {
    if (!selectedCompany?.guid) return;
    setLoading(true);
    try {
      // Load filters on first page
      if (pg === 1) {
        api.fetchStockFilters(selectedCompany.guid)
          .then(r => setCategories(['All', ...(r?.data?.categories || []), ...(r?.data?.groups || [])].filter(Boolean)))
          .catch(() => {}); // categories failure is non-fatal
      }

      const res = await api.fetchStocks({
        companyGuid: selectedCompany.guid,
        page: pg,
        pageSize,
        searchText,
        category: cat !== 'All' ? cat : undefined,
      });

      const list = res?.data?.stocks || [];
      if (list.length > 0) {
        setStockItems(list.map(s => ({
          id: s.id,
          name: s.name || 'Unknown',
          sku: s.guid?.slice(-8) || '',
          category: s.category || s.group_name || 'General',
          qty: parseFloat(s.closing_qty) || 0,
          unit: s.unit || 'Pcs',
          rate: parseFloat(s.closing_rate) || 0,
          value: parseFloat(s.closing_value) || 0,
          reorderLevel: parseFloat(s.reorder_level) || 0,
          status: !s.closing_qty || s.closing_qty <= 0
            ? 'Out of Stock'
            : parseFloat(s.closing_qty) <= parseFloat(s.reorder_level || 0) && s.reorder_level > 0
            ? 'Low Stock'
            : 'Normal',
        })));
        setTotal(res?.data?.totalStocks || list.length);
      } else {
        setStockItems([]);
        setTotal(0);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.guid, categoryFilter]);

  // Reload whenever company changes
  useEffect(() => {
    setStockItems([]);
    setTotal(0);
    setPage(1);
    setSearch('');
    setCategoryFilter('All');
    setWarehouses([]);
    if (selectedCompany?.guid) {
      loadStocks(1, '', 'All');
      loadWarehouses();
    }
  }, [selectedCompany?.guid, selectedFY?.uniqueId]); // eslint-disable-line

  useEffect(() => {
    if (tab === 2 && selectedCompany?.guid) loadWarehouses();
  }, [tab, selectedCompany?.guid]); // eslint-disable-line

  useEffect(() => {
    const unsub = wsService.on('synced', () => { if (selectedCompany?.guid) loadStocks(1, search, categoryFilter); });
    return unsub;
  }, [selectedCompany?.guid]);

  // Debounced search + filter
  useEffect(() => {
    if (!selectedCompany?.guid) return;
    const t = setTimeout(() => { loadStocks(1, search, categoryFilter); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search, categoryFilter, selectedCompany?.guid]); // eslint-disable-line

  const totalPages = Math.ceil(total / pageSize);
  const alerts = stockItems.filter(s => s.status !== 'Normal').slice(0, 5);
  const lowStock = stockItems.filter(s => s.status === 'Low Stock').length;
  const outOfStock = stockItems.filter(s => s.status === 'Out of Stock').length;
  const totalValue = stockItems.reduce((s, i) => s + (i.value || 0), 0);

  // Chart: top 5 categories by value
  const categoryValues = Object.entries(
    stockItems.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + s.value;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name: name.split(' ').slice(0, 2).join(' '), value: Math.round(value / 1000) }));

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <span className="flex-shrink-0">⚠️</span>
          <span><strong>Error:</strong> {error}</span>
          <button onClick={() => window.location.reload()} className="ml-auto underline font-medium">Retry</button>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">{selectedCompany?.name || 'No company'} · {loading ? 'Loading...' : `${total} items`}</p>
        </div>
        <button onClick={() => loadStocks(page, search, categoryFilter)} className="flex items-center gap-1.5 text-xs text-[#1A1A1A] font-medium hover:text-[#787774]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPIs from real data */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Items"       value={total}           icon={Package}       accent="#1A1A1A" />
        <KPICard title="Total Value"       value={fmt(totalValue)} icon={Package}       accent="#1A1A1A" />
        <KPICard title="Low Stock"         value={lowStock}        icon={AlertTriangle} accent="#D97706" />
        <KPICard title="Out of Stock"      value={outOfStock}      icon={AlertTriangle} accent="#C0392B" />
      </div>

      {/* Chart + Alerts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Value by Category</p>
          <p className="text-xs text-[#AEACA8] mb-4">₹K — top categories</p>
          {categoryValues.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={categoryValues} barSize={28} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#ECEEEF" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#AEACA8' }} axisLine={false} tickLine={false} tickFormatter={v => v + 'K'} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#787774' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={v => ['₹' + v + 'K']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #D4D3CE' }} />
                <Bar dataKey="value" fill="#1A1A1A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-[#AEACA8] text-sm">Sync to see stock data</div>
          )}
        </div>

        {/* Top 5 Stock Alerts */}
        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-4">Stock Alerts <span className="text-xs font-normal text-[#AEACA8]">top 5</span></p>
          {alerts.length === 0 ? (
            <div className="py-6 text-center">
              <Package size={24} className="mx-auto mb-2 text-[#D4D3CE]" />
              <p className="text-xs text-[#AEACA8]">All items in stock</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(s => (
                <div key={s.id} className={`px-3 py-2.5 rounded-xl text-xs font-medium border cursor-pointer hover:opacity-80 ${
                  s.status === 'Out of Stock'
                    ? 'bg-[#FDECEA] border-[#EDBBB8] text-[#C0392B]'
                    : 'bg-[#FEF6E4] border-[#F0D49A] text-[#D97706]'
                }`} onClick={() => setDrawer(s)}>
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="opacity-75 mt-0.5">{s.status} · {s.qty} {s.unit}</p>
                </div>
              ))}
              {stockItems.filter(s => s.status !== 'Normal').length > 5 && (
                <p className="text-xs text-[#AEACA8] text-center pt-1" onClick={() => setTab(1)} style={{ cursor: 'pointer' }}>
                  +{stockItems.filter(s => s.status !== 'Normal').length - 5} more → View All Alerts
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#D4D3CE] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#ECEEEF] px-1 pt-1">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-lg mr-1 ${
                tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF] font-semibold' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'
              }`}>{t}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 0 && (
            <>
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEACA8]" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item name..."
                    className="w-full pl-8 pr-3 py-2 text-sm bg-[#F5F4EF] border border-[#ECEEEF] rounded-lg outline-none focus:border-[#1A1A1A] focus:bg-white transition-all placeholder:text-[#AEACA8]" />
                </div>
                <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); }}
                  className="py-2 px-3 text-sm bg-white border border-[#D4D3CE] rounded-lg outline-none focus:border-[#1A1A1A] text-[#1A1A1A]">
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
              ) : (
                <Table columns={itemCols} data={stockItems} onRowClick={setDrawer} />
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#ECEEEF]">
                  <p className="text-xs text-[#AEACA8]">Showing {((page-1)*pageSize)+1}–{Math.min(page*pageSize, total)} of {total}</p>
                  <div className="flex gap-1">
                    <button onClick={() => { const pg = page-1; setPage(pg); loadStocks(pg, search, categoryFilter); }} disabled={page === 1}
                      className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">← Prev</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pg = Math.max(1, Math.min(page-2, totalPages-4)) + i;
                      return <button key={pg} onClick={() => { setPage(pg); loadStocks(pg, search, categoryFilter); }}
                        className={`w-8 h-8 text-xs rounded-lg ${pg === page ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]'}`}>{pg}</button>;
                    })}
                    <button onClick={() => { const pg = page+1; setPage(pg); loadStocks(pg, search, categoryFilter); }} disabled={page >= totalPages}
                      className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 1 && (
            <div className="space-y-2">
              <p className="text-xs text-[#AEACA8] mb-3">{stockItems.filter(s => s.status !== 'Normal').length} items need attention</p>
              {stockItems.filter(s => s.status !== 'Normal').length === 0 ? (
                <div className="py-12 text-center">
                  <Package size={28} className="mx-auto mb-2 text-[#D4D3CE]" />
                  <p className="text-sm text-[#AEACA8]">All items in stock</p>
                </div>
              ) : (
                stockItems.filter(s => s.status !== 'Normal').map(s => (
                  <div key={s.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer ${
                    s.status === 'Out of Stock'
                      ? 'bg-[#FDECEA] border-[#EDBBB8]'
                      : 'bg-[#FEF6E4] border-[#F0D49A]'
                  }`} onClick={() => setDrawer(s)}>
                    <div>
                      <p className={`text-sm font-semibold ${s.status === 'Out of Stock' ? 'text-[#C0392B]' : 'text-[#D97706]'}`}>{s.name}</p>
                      <p className="text-xs opacity-70 mt-0.5">{s.category} · {s.qty} {s.unit}</p>
                    </div>
                    <Badge label={s.status} variant={statusVariant[s.status]} />
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 2 && (
            <>
              {whLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
              ) : warehouses.length === 0 ? (
                <div className="py-12 text-center">
                  <Warehouse size={28} className="mx-auto mb-2 text-[#D4D3CE]" />
                  <p className="text-sm text-[#AEACA8]">No warehouses found</p>
                </div>
              ) : (
                <Table
                  columns={[
                    { key: 'name', label: 'Name', render: v => <span className="font-medium text-[#1A1A1A]">{v}</span> },
                    { key: 'parent', label: 'Parent', render: v => <span className="text-xs text-[#787774]">{v}</span> },
                    { key: 'address', label: 'Address', render: v => <span className="text-xs text-[#787774]">{v}</span> },
                  ]}
                  data={warehouses}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.name || 'Item Details'}>
        {drawer && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-[#1A1A1A]">{drawer.name}</p>
                <p className="text-xs text-[#AEACA8] mt-0.5">{drawer.category} · SKU: {drawer.sku}</p>
              </div>
              <Badge label={drawer.status} variant={statusVariant[drawer.status] || 'gray'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Stock Qty',     `${drawer.qty} ${drawer.unit}`],
                ['Rate',          fmt(drawer.rate)],
                ['Stock Value',   fmt(drawer.value)],
                ['Reorder Level', `${drawer.reorderLevel} ${drawer.unit}`],
                ['Category',      drawer.category],
                ['SKU',           drawer.sku],
              ].map(([l, v]) => (
                <div key={l} className="p-3 bg-[#F5F4EF] rounded-xl border border-[#D4D3CE]">
                  <p className="text-xs text-[#AEACA8] mb-1">{l}</p>
                  <p className="font-medium text-[#1A1A1A] text-sm">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1A1A1A] hover:bg-[#333] transition-colors">Stock Transfer</button>
              <button className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF] transition-colors">Adjust Stock</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
