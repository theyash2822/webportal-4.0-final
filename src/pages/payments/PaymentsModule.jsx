import { useState, useEffect } from 'react';
import VoucherDetail from '../../components/VoucherDetail';
import { CreditCard, ArrowUpRight, ArrowDownLeft, Search, BookOpen, RefreshCw } from 'lucide-react';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Table from '../../components/Table';
import Drawer from '../../components/Drawer';
import { useAuth } from '../../contexts/AuthContext';
import api, { unwrapList } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';

const TABS = ['Payments', 'Receipts', 'Journal', 'Contra'];
const statusVariant = { Cleared: 'green', Pending: 'yellow', Reversed: 'red', Cancelled: 'red' };

const mapV = (v) => ({
  id: v.id,
  voucher: v.voucher_number || v.voucherNumber || v.id,
  party: v.party_name || v.partyName || '—',
  date: v.date || '—',
  amount: parseFloat(v.amount) || 0,
  mode: 'Bank',
  status: v.is_cancelled ? 'Cancelled' : 'Cleared',
  ref: v.reference || '',
  ledger: v.ledger_name || v.bank_ledger || '—',
  voucherType: v.voucher_type || v.voucherType || '',
});

const baseCols = (amountColor) => [
  { key: 'date', label: 'Date', render: v => <span className="text-[#787774]">{v}</span> },
  { key: 'voucher', label: 'Voucher', render: v => <span className="font-mono text-xs text-[#1A1A1A] font-semibold">{v}</span> },
  { key: 'party', label: 'Party / Narration' },
  { key: 'amount', label: 'Amount', render: v => <span className="font-semibold" style={{ color: amountColor }}>{v == null ? '—' : '₹' + Math.abs(Number(v)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
  { key: 'ref', label: 'Reference', render: v => v ? <span className="font-mono text-xs text-[#787774] truncate max-w-28 block">{v}</span> : <span className="text-[#AEACA8]">—</span> },
  { key: 'status', label: 'Status', render: v => <Badge label={v} variant={statusVariant[v] || 'gray'} /> },
];

export default function PaymentsModule() {
  const { formatAmount } = useSettings();
  const fmt = n => formatAmount(n || 0);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { selectedCompany, selectedFY, isPaired } = useAuth();
  const isDemo = !isPaired;

  const voucherType = ['Payment', 'Receipt', 'Journal', 'Contra'][tab];

  const loadData = () => {
    if (!selectedCompany?.guid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.fetchVouchers({
      companyGuid: selectedCompany.guid,
      voucherType,
      page: 1,
      pageSize: 200,
      fromDate: selectedFY?.startDate,
      toDate: selectedFY?.endDate,
    })
      .then(res => setRows(unwrapList(res).map(mapV)))
      .catch(err => {
        setError(err?.message || 'Failed to load vouchers');
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setRows([]); setPage(1); setSearch('');
    loadData();
  }, [selectedCompany?.guid, selectedFY?.uniqueId, tab]); // eslint-disable-line

  const filtered = rows.filter(p =>
    !search ||
    (p.party || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.voucher || '').toLowerCase().includes(search.toLowerCase())
  );

  const cols = baseCols(tab === 0 ? '#C0392B' : tab === 1 ? '#2D7D46' : '#1A1A1A');
  const emptyLabels = ['No payments found', 'No receipts found', 'No journal vouchers found', 'No contra vouchers found'];

  // Keep payment/receipt KPIs from current tab when on those; otherwise total of current list
  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <span className="flex-shrink-0">⚠️</span>
          <span><strong>Error:</strong> {error}</span>
          <button onClick={loadData} className="ml-auto underline font-medium">Retry</button>
        </div>
      )}
      {isDemo && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span className="text-base">🎭</span>
          <span><strong>Demo Mode</strong> — Pair Desktop App for real Tally data. <a href="/settings?tab=integrations&sub=Tally+ERP+Sync" className="underline font-medium">Pair Desktop App →</a></span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Payments & Vouchers</h1>
          <p className="text-sm text-[#787774] mt-0.5">{selectedFY?.name ? 'FY ' + selectedFY.name : 'Current FY'} · {loading ? 'Loading...' : `${rows.length} ${voucherType.toLowerCase()} vouchers`}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-[#1A1A1A] font-medium hover:text-[#787774]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Amount" value={loading ? '—' : fmt(rows.reduce((s, p) => s + (p.amount || 0), 0))} icon={tab <= 1 ? (tab === 0 ? ArrowUpRight : ArrowDownLeft) : BookOpen} accent="#1A1A1A" />
        <KPICard title="Vouchers" value={loading ? '—' : rows.length} icon={CreditCard} accent="#D97706" />
        <KPICard title="Cleared" value={loading ? '—' : rows.filter(r => r.status === 'Cleared').length} icon={ArrowDownLeft} accent="#2D7D46" />
        <KPICard title="Type" value={voucherType} icon={BookOpen} accent="#1A1A1A" />
      </div>

      <div className="bg-white border border-[#D4D3CE] rounded-2xl">
        <div className="flex border-b border-[#D4D3CE] px-1 pt-1 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-lg mr-1 ${tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF] font-semibold' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>{t}
            </button>
          ))}
        </div>
        <div className="p-5">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEACA8]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party or voucher..."
                className="notion-input pl-8 w-full text-sm" />
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-[#AEACA8]"><p className="text-sm">{emptyLabels[tab]}</p></div>
          ) : (
            <>
              <Table columns={cols} data={filtered.slice((page - 1) * 25, page * 25)} onRowClick={setDrawer} />
              {filtered.length > 25 && (
                <div className="flex items-center justify-between pt-3 border-t border-[#ECEEEF] mt-2">
                  <span className="text-xs text-[#AEACA8]">{filtered.length} total</span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">← Prev</button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= filtered.length} className="px-3 py-1.5 text-xs border border-[#D4D3CE] rounded-lg disabled:opacity-40 hover:bg-[#F5F4EF]">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.voucher || 'Details'}>
        {drawer?.id && selectedCompany?.guid ? (
          <VoucherDetail
            voucherId={drawer.id}
            companyGuid={selectedCompany.guid}
            companyName={selectedCompany?.name}
            onBack={() => setDrawer(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
