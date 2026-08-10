import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, FileText, ShoppingBag, FileCheck, Search, Download, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Table from '../../components/Table';
import Drawer from '../../components/Drawer';
import InvoicePDF from '../../components/InvoicePDF';
import { useAuth } from '../../contexts/AuthContext';
import api, { unwrapList } from '../../services/api';
import wsService from '../../services/websocket';
import { useSettings } from '../../contexts/SettingsContext';

const TABS = ['Sales Register', 'Order Register', 'Credit Notes', 'Delivery Notes'];

const isSalesInvoice = (type) => {
  const t = (type || '').toLowerCase();
  if (!t) return false;
  if (/order|quotation|credit|debit|delivery|receipt note/.test(t)) return false;
  return /sales|invoice|retail/.test(t);
};

const statusVariant = { Paid: 'green', Unpaid: 'red', Partial: 'yellow', Open: 'blue', Converted: 'green', Expired: 'gray', Lost: 'red', 'Fully Invoiced': 'green', 'Partially Invoiced': 'yellow', Closed: 'gray', Cancelled: 'red' };

const mapRow = (v) => ({
  id: v.id,
  ref: v.voucher_number || v.voucherNumber || v.guid?.slice(-8) || 'N/A',
  customer: v.party_name || v.partyName || '—',
  date: v.date || '—',
  amount: parseFloat(v.amount) || 0,
  voucherType: v.voucher_type || v.voucherType || 'Sales',
  status: v.is_cancelled ? 'Cancelled' : parseFloat(v.amount) > 0 ? 'Paid' : 'Unpaid',
  rawData: v,
});

export default function SalesModule() {
  const { formatAmount } = useSettings();
  const fmt = n => formatAmount(n || 0);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [drawer, setDrawer] = useState(null);
  const [pdfInvoice, setPdfInvoice] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { selectedCompany, selectedFY, isPaired } = useAuth();
  const isDemo = !isPaired;
  const companyGuid = selectedCompany?.guid;

  const monthlyChart = useMemo(() => {
    const map = {};
    rows.forEach(v => {
      const d = v.date || '';
      if (!d || d === '—') return;
      const mon = new Date(d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d).toLocaleString('en', { month: 'short' });
      if (!map[mon]) map[mon] = { month: mon, sales: 0 };
      map[mon].sales += (parseFloat(v.amount) || 0) / 1000;
    });
    return Object.values(map).slice(-6);
  }, [rows]);

  const loadData = useCallback(async (searchText = '') => {
    if (!companyGuid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const fyParams = {
      fromDate: selectedFY?.startDate,
      toDate: selectedFY?.endDate,
      search: searchText || undefined,
      page: 1,
      pageSize: 200,
    };
    try {
      let mapped = [];
      if (tab === 0) {
        const res = await api.fetchVouchers({
          companyGuid,
          page: 1,
          pageSize: 200,
          searchText,
          fromDate: selectedFY?.startDate,
          toDate: selectedFY?.endDate,
        });
        const all = unwrapList(res);
        mapped = all.filter(v => isSalesInvoice(v.voucher_type || v.voucherType)).map(mapRow);
      } else if (tab === 1) {
        const res = await api.fetchSalesOrders(companyGuid, fyParams);
        mapped = unwrapList(res).map(mapRow);
      } else if (tab === 2) {
        const res = await api.fetchCreditNotes(companyGuid, fyParams);
        mapped = unwrapList(res).map(mapRow);
      } else if (tab === 3) {
        const res = await api.fetchDeliveryNotes(companyGuid, fyParams);
        mapped = unwrapList(res).map(mapRow);
      }
      setRows(mapped);
      setPage(1);
    } catch (e) {
      setError(e?.message || 'Failed to load sales data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyGuid, selectedFY?.startDate, selectedFY?.endDate, tab]);

  useEffect(() => {
    setRows([]);
    setSearch('');
    setError(null);
    if (companyGuid) loadData('');
  }, [companyGuid, selectedFY?.uniqueId, tab]); // eslint-disable-line

  useEffect(() => {
    const unsub = wsService.on('synced', () => { if (companyGuid) loadData(search); });
    return unsub;
  }, [companyGuid, tab]); // eslint-disable-line

  useEffect(() => {
    if (!companyGuid) return;
    const t = setTimeout(() => loadData(search), 400);
    return () => clearTimeout(t);
  }, [search, companyGuid]); // eslint-disable-line

  const filtered = rows.filter(r =>
    (!search || (r.customer || r.ref || '').toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'All' || r.status === statusFilter)
  );

  const invoiceCols = [
    { key: 'ref', label: tab === 1 ? 'Order No' : tab === 3 ? 'Note No' : 'Doc No', render: v => <span className="font-mono text-xs text-[#1A1A1A] font-semibold">{v}</span> },
    { key: 'customer', label: 'Party' },
    { key: 'voucherType', label: 'Type', render: v => <span className="text-xs text-[#787774]">{v}</span> },
    { key: 'date', label: 'Date', render: v => <span className="text-[#787774]">{v}</span> },
    { key: 'amount', label: 'Amount', render: v => <span className="font-semibold">{fmt(v)}</span> },
    { key: 'status', label: 'Status', render: v => <Badge label={v} variant={statusVariant[v] || 'gray'} /> },
  ];

  const totalSales = rows.reduce((s, i) => s + (i.amount || 0), 0);
  const paid = rows.filter(i => i.status === 'Paid').length;
  const unpaid = rows.filter(i => i.status === 'Unpaid').length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const emptyLabel = ['No sales records found', 'No sales orders found', 'No credit notes found', 'No delivery notes found'][tab];

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <span className="flex-shrink-0">⚠️</span>
          <span><strong>Error:</strong> {error}</span>
          <button onClick={() => { setError(null); loadData(search); }} className="ml-auto underline font-medium">Retry</button>
        </div>
      )}
      {!error && isDemo && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span className="text-base">🎭</span>
          <span><strong>Demo Mode</strong> — Pair Desktop App for real Tally data. <a href="/settings?tab=integrations&sub=Tally+ERP+Sync" className="underline font-medium">Settings →</a></span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-subtitle">
            {selectedCompany?.name || 'No company'} · {loading ? 'Loading...' : `${rows.length} records`}
          </p>
        </div>
        <button onClick={() => loadData(search)} className="flex items-center gap-1.5 text-xs text-[#1A1A1A] font-medium hover:text-[#787774]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Amount" value={fmt(totalSales)} icon={TrendingUp} accent="#1A1A1A" />
        <KPICard title="Records" value={rows.length} icon={FileCheck} accent="#1A1A1A" />
        <KPICard title="Paid" value={paid} icon={FileText} accent="#2D7D46" />
        <KPICard title="Unpaid" value={unpaid} icon={ShoppingBag} accent="#C0392B" />
      </div>

      {tab === 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-white border border-[#D4D3CE] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Sales Trend</p>
            <p className="text-xs text-[#AEACA8] mb-4">Monthly · {selectedFY?.name ? `FY ${selectedFY.name}` : 'Current FY'}</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={monthlyChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A1A1A" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#ECEEEF" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#AEACA8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#AEACA8' }} axisLine={false} tickLine={false} tickFormatter={v => v / 100 + 'L'} />
                <Tooltip formatter={v => ['₹' + (v / 100).toFixed(1) + 'L', 'Sales']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #D4D3CE' }} />
                <Area type="monotone" dataKey="sales" stroke="#1A1A1A" strokeWidth={2.5} fill="url(#sg)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
            <p className="text-sm font-semibold text-[#1A1A1A] mb-4">Status Summary</p>
            <div className="space-y-3">
              {[['Paid', paid, '#2D7D46'], ['Unpaid', unpaid, '#C0392B']].map(([l, v, c]) => (
                <div key={l} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                    <span className="text-sm text-[#787774]">{l}</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1A1A1A]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#D4D3CE] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#ECEEEF] px-1 pt-1 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-lg mr-1 ${tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF] font-semibold' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-5">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEACA8]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party or document..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-[#F5F4EF] border border-[#ECEEEF] rounded-lg outline-none focus:border-[#1A1A1A] focus:bg-white transition-all placeholder:text-[#AEACA8]" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="py-2 px-3 text-sm bg-white border border-[#D4D3CE] rounded-lg outline-none text-[#1A1A1A]">
              {['All', 'Paid', 'Unpaid'].map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-[#D4D3CE] rounded-lg text-xs text-[#787774] hover:bg-[#F5F4EF]">
              <Download size={12} /> Export
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <TrendingUp size={28} className="mx-auto mb-2 text-[#D4D3CE]" />
              <p className="text-sm text-[#AEACA8]">{emptyLabel}</p>
            </div>
          ) : (
            <Table columns={invoiceCols} data={paged} onRowClick={row => setDrawer(row)} />
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#ECEEEF]">
              <p className="text-xs text-[#AEACA8]">{filtered.length} records</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">← Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <InvoicePDF open={!!pdfInvoice} onClose={() => setPdfInvoice(null)} invoice={pdfInvoice} />

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.ref || 'Details'}>
        {drawer && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-[#1A1A1A] text-base">{drawer.customer}</p>
                <p className="font-mono text-xs text-[#AEACA8] mt-0.5">{drawer.ref} · {drawer.voucherType}</p>
              </div>
              <Badge label={drawer.status} variant={statusVariant[drawer.status] || 'gray'} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Date', drawer.date], ['Amount', fmt(drawer.amount)], ['Type', drawer.voucherType], ['Status', drawer.status]].map(([l, v]) => (
                <div key={l} className="p-3 bg-[#F5F4EF] rounded-xl border border-[#D4D3CE]">
                  <p className="text-xs text-[#AEACA8] mb-1">{l}</p>
                  <p className="font-medium text-[#1A1A1A] text-sm">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPdfInvoice(drawer)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1A1A1A] hover:bg-[#333] transition-colors">View PDF</button>
              <button className="px-4 py-2.5 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF] transition-colors">Share</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
