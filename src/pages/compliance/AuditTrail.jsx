import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Plus, Edit, Trash2, Search, RefreshCw, WifiOff, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Table from '../../components/Table';
import Drawer from '../../components/Drawer';
import { useAuth } from '../../contexts/AuthContext';
import api, { unwrapList } from '../../services/api';
import wsService from '../../services/websocket';
import { useSettings } from '../../contexts/SettingsContext';

const actionVariant = { Created: 'green', Modified: 'yellow', Deleted: 'red' };
const TABS = ['Day Book', 'My Entries'];

// Map Tally voucher types to display labels
const getVoucherTypeLabel = (type) => {
  const map = {
    'Sales': 'Sales Invoice',
    'Purchase': 'Purchase Invoice',
    'Payment': 'Payment Voucher',
    'Receipt': 'Receipt Voucher',
    'Journal': 'Journal Voucher',
    'Contra': 'Contra Voucher',
    'Credit Note': 'Credit Note',
    'Debit Note': 'Debit Note',
    'Sales Order': 'Sales Order',
    'Purchase Order': 'Purchase Order',
  };
  return map[type] || type || 'Voucher';
};

export default function AuditTrail() {
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const fmt = n => formatAmount(n || 0);
  const [tab, setTab] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const { selectedCompany, token, selectedFY } = useAuth();
  const [fromDate, setFromDate] = useState(selectedFY?.startDate || '');
  const [toDate, setToDate] = useState(selectedFY?.endDate || '');
  const [myEntries, setMyEntries] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState(null);
  const [myFilter, setMyFilter] = useState('all');
  const [retrying, setRetrying] = useState({});

  useEffect(() => {
    if (selectedFY?.startDate) setFromDate(selectedFY.startDate);
    if (selectedFY?.endDate) setToDate(selectedFY.endDate);
  }, [selectedFY?.uniqueId, selectedFY?.startDate, selectedFY?.endDate]);

  const loadData = async () => {
    if (!token || !selectedCompany?.guid) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.fetchVouchers({
        companyGuid: selectedCompany.guid,
        page: 1,
        pageSize: 500,
        searchText: search,
        fromDate: fromDate || selectedFY?.startDate || undefined,
        toDate: toDate || selectedFY?.endDate || undefined,
      });
      const list = unwrapList(res);
      setVouchers(list);
    } catch (err) {
      console.warn('Vouchers fetch error:', err.message);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedCompany?.guid, token, fromDate, toDate, selectedFY?.uniqueId]);
  useEffect(() => {
    const unsub = wsService.on('synced', () => loadData());
    return unsub;
  }, [selectedCompany?.guid]);

  // Get unique voucher types for filter
  const voucherTypes = ['All', ...Array.from(new Set(vouchers.map(v => v.voucher_type).filter(Boolean)))];

  const filtered = vouchers.filter(v => {
    const s = !search || (v.party_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.voucher_number || '').toLowerCase().includes(search.toLowerCase());
    const t = typeFilter === 'All' || v.voucher_type === typeFilter;
    const d1 = !fromDate || !v.date || v.date >= fromDate.replace(/-/g, '');
    const d2 = !toDate || !v.date || v.date <= toDate.replace(/-/g, '');
    return s && t && d1 && d2;
  });

  const mapMyEntry = (e) => {
    let status = e.status || e._queue_status || 'pending';
    if (status === 'posted' || status === 'success') status = 'success';
    if (status === 'processing') status = 'pending';
    return {
      id: e._queue_id || e.id,
      entry_type: e.entry_type || e.voucher_type || e.current_entry_type,
      entry_label: e.entry_label || e.party_name || e.voucher_number || '—',
      status,
      amount: e.amount,
      tally_voucher_number: e.tally_voucher_number || e.av_tally_voucher_no || e.voucher_number,
      created_at: e.created_at || e.av_created_at,
      source: e.source || 'web',
      error_message: e.error_message || e._queue_error,
    };
  };

  const loadMyEntries = useCallback(() => {
    if (!selectedCompany?.guid) return;
    setMyLoading(true);
    setMyError(null);
    const params = {
      limit: 100,
      ...(selectedFY ? { from: selectedFY.startDate, to: selectedFY.endDate } : {}),
    };
    api.fetchMyEntries(selectedCompany.guid, params)
      .then(res => {
        // Mobile contract: posted in data[], queue rows in pending[]
        const posted = Array.isArray(res?.data) ? res.data : unwrapList(res);
        const pending = Array.isArray(res?.pending) ? res.pending : [];
        let mapped = [...pending, ...posted].map(mapMyEntry);
        if (myFilter !== 'all') mapped = mapped.filter(e => e.status === myFilter);
        setMyEntries(mapped);
        setMyStats(res?.stats || null);
      })
      .catch(() =>
        api.fetchAuditTrail({
          companyGuid: selectedCompany.guid,
          status: myFilter === 'all' ? undefined : myFilter,
          limit: 100,
        })
          .then(res => {
            const entries = (res?.data?.entries || unwrapList(res)).map(mapMyEntry);
            setMyEntries(myFilter === 'all' ? entries : entries.filter(e => e.status === myFilter));
            setMyStats(res?.data?.stats);
          })
          .catch(e => setMyError(e?.message || 'Failed to load'))
      )
      .finally(() => setMyLoading(false));
  }, [selectedCompany?.guid, myFilter, selectedFY?.startDate, selectedFY?.endDate]);

  useEffect(() => { if (tab === 1) loadMyEntries(); }, [tab, loadMyEntries]);

  const retryEntry = async (id) => {
    setRetrying(r => ({ ...r, [id]: true }));
    try {
      try {
        await api.retryMyEntry(id);
      } catch {
        await api.retryAuditEntry(id);
      }
      loadMyEntries();
    } catch (e) {
      setMyError(e?.message);
    } finally {
      setRetrying(r => ({ ...r, [id]: false }));
    }
  };

  const STATUS_CFG = {
    success:         { label: 'In Tally',    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    desktop_offline: { label: 'Offline',     cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    pending:         { label: 'Pending',     cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    failed:          { label: 'Failed',      cls: 'text-red-700 bg-red-50 border-red-200' },
  };
  const TYPE_LBL = { sales:'Sales Invoice', purchase:'Purchase Invoice', payment:'Payment', receipt:'Receipt', journal:'Journal', contra:'Contra', credit_note:'Credit Note', debit_note:'Debit Note', sales_order:'Sales Order', purchase_order:'Purchase Order', delivery_note:'Delivery Note', party:'Party/Ledger', item:'Stock Item' };

  // Activity per day chart
  const activityByDay = (() => {
    const map = {};
    vouchers.forEach(v => {
      if (!v.date) return;
      const day = v.date.slice(-2) || '?';
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).slice(0, 12).map(([day, count]) => ({ day, count }));
  })();

  const summary = {
    total: vouchers.length,
    sales: vouchers.filter(v => v.voucher_type?.includes('Sales')).length,
    purchase: vouchers.filter(v => v.voucher_type?.includes('Purchase')).length,
    payment: vouchers.filter(v => v.voucher_type?.includes('Payment') || v.voucher_type?.includes('Receipt')).length,
  };

  const cols = [
    { key: 'date', label: 'Date', render: v => <span className="text-[#787774]">{v || '—'}</span> },
    { key: 'voucher_number', label: 'Voucher No', render: v => <span className="font-mono text-xs text-[#1A1A1A] font-semibold">{v || '—'}</span> },
    { key: 'voucher_type', label: 'Type', render: v => <span className="text-sm text-[#1A1A1A]">{getVoucherTypeLabel(v)}</span> },
    { key: 'party_name', label: 'Party', render: v => <span className="text-[#787774] truncate max-w-32 block">{v || '—'}</span> },
    { key: 'amount', label: 'Amount', render: v => <span className="font-semibold text-[#1A1A1A]">{v ? fmt(v) : '—'}</span> },
    { key: 'narration', label: 'Narration', render: v => <span className="text-xs text-[#AEACA8] truncate max-w-32 block">{v || '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Day Book</h1>
          <p className="text-sm text-[#787774] mt-0.5">
            {selectedCompany?.name || 'No company'} · {loading ? 'Loading...' : `${vouchers.length} vouchers`}
          </p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-[#787774] font-medium hover:text-[#1A1A1A]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Vouchers" value={summary.total} icon={ClipboardList} accent="#1A1A1A" />
        <KPICard title="Sales" value={summary.sales} icon={Plus} accent="#2D7D46" />
        <KPICard title="Purchase" value={summary.purchase} icon={Edit} accent="#F59E0B" />
        <KPICard title="Payments/Receipts" value={summary.payment} icon={Trash2} accent="#C0392B" />
      </div>

      {/* Chart + Latest */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-[#D4D3CE] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Vouchers per Day</p>
          <p className="text-xs text-[#787774] mb-4">Activity trend</p>
          {activityByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={activityByDay} barSize={16}>
                <CartesianGrid strokeDasharray="2 4" stroke="#F5F4EF" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #D4D3CE', borderRadius: 8 }} />
                <Bar dataKey="count" name="Vouchers" fill="#1A1A1A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-36 text-[#AEACA8] text-sm">
              No data yet — sync from Tally to see activity
            </div>
          )}
        </div>
        <div className="bg-white border border-[#D4D3CE] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-3">Latest Entries</p>
          {vouchers.length === 0 ? (
            <p className="text-xs text-[#AEACA8] text-center py-6">No vouchers yet — sync from Desktop</p>
          ) : (
            <div className="space-y-2.5">
              {vouchers.slice(0, 5).map((v, i) => (
                <div key={i} className="flex items-start gap-2.5 cursor-pointer hover:bg-[#F5F4EF] p-1.5 rounded-lg" onClick={() => setDrawer(v)}>
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-[#1A1A1A]" />
                  <div>
                    <p className="text-xs font-medium text-[#1A1A1A]">{v.voucher_number} – {getVoucherTypeLabel(v.voucher_type)}</p>
                    <p className="text-xs text-[#787774]">{v.party_name || '—'} · {v.date || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Day Book Table */}
      <div className="bg-white border border-[#D4D3CE] rounded-2xl">
        <div className="flex border-b border-[#D4D3CE] px-1 pt-1">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg mr-1 ${tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF]' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>{t}
            </button>
          ))}
        </div>
        <div className="p-5">
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEACA8]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search party or voucher no..."
                className="notion-input pl-8 w-full text-sm" />
            </div>
            {/* Voucher type */}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="notion-input text-sm text-[#787774]">
              {voucherTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            {/* Date range */}
            <div className="flex items-center gap-2 bg-white border border-[#D4D3CE] rounded-lg px-3 py-1.5">
              <span className="text-xs text-[#AEACA8] flex-shrink-0">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="text-xs text-[#1A1A1A] outline-none bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-[#D4D3CE] rounded-lg px-3 py-1.5">
              <span className="text-xs text-[#AEACA8] flex-shrink-0">To</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="text-xs text-[#1A1A1A] outline-none bg-transparent"
              />
            </div>
            {/* Clear dates */}
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-xs text-[#C0392B] hover:text-[#C0392B] font-medium px-2 py-1.5 hover:bg-[#FEF2F2] rounded-lg transition-colors"
              >
                Clear dates
              </button>
            )}
          </div>

          {tab === 0 ? (
            loading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-[#AEACA8]">
                <ClipboardList size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No vouchers found</p>
                <p className="text-xs mt-1">Sync from TallyDekho Desktop to see Day Book data</p>
              </div>
            ) : (
              <Table columns={cols} data={filtered} onRowClick={setDrawer} />
            )
          ) : (
            /* My Entries — write_queue */
            <div>
              {myError && <div className="mb-3 px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">{myError}</div>}
              <div className="flex gap-2 mb-4 flex-wrap items-center justify-between">
                <div className="flex gap-1.5">
                  {['all','success','desktop_offline','failed'].map(k => (
                    <button key={k} onClick={() => setMyFilter(k)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      myFilter === k ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-[#787774] border-[#D4D3CE] hover:border-[#1A1A1A]'
                    }`}>{k === 'all' ? 'All' : k === 'success' ? '✓ In Tally' : k === 'desktop_offline' ? '⏳ Offline' : '✗ Failed'}</button>
                  ))}
                </div>
                <button onClick={loadMyEntries} disabled={myLoading} className="flex items-center gap-1 text-xs text-[#787774] hover:text-[#1A1A1A] disabled:opacity-40">
                  <RefreshCw size={12} className={myLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
              {myLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#F5F4EF] rounded-xl animate-pulse" />)}</div>
              ) : myEntries.length === 0 ? (
                <div className="py-10 text-center text-[#AEACA8]">
                  <CheckCircle2 size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No entries yet — create an invoice to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myEntries.map(e => {
                    const cfg = STATUS_CFG[e.status] || STATUS_CFG.pending;
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 bg-white border border-[#E8E7E3] rounded-xl hover:border-[#B0B8C1] transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'success' ? 'bg-emerald-500' : e.status === 'desktop_offline' ? 'bg-amber-400 animate-pulse' : e.status === 'failed' ? 'bg-red-500' : 'bg-blue-400 animate-pulse'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-[#1A1A1A]">{TYPE_LBL[e.entry_type] || e.entry_type}</span>
                            <span className="text-xs text-[#787774] truncate max-w-[180px]">{e.entry_label}</span>
                            {e.amount && parseFloat(e.amount) > 0 && <span className="text-xs font-bold text-[#1A1A1A]">₹{parseFloat(e.amount).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>}
                            {e.tally_voucher_number && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">#{e.tally_voucher_number}</span>}
                          </div>
                          <p className="text-[10px] text-[#AEACA8] mt-0.5">{new Date(e.created_at*1000).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})} · {e.source === 'mobile' ? '📱' : '🌐'}
                            {e.error_message && <span className="text-red-500 ml-2">{e.error_message.slice(0,60)}</span>}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.cls}`}>{cfg.label}</span>
                        {e.status !== 'success' && (
                          <button onClick={() => retryEntry(e.id)} disabled={retrying[e.id]}
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-50 transition-colors">
                            <RotateCcw size={10} className={retrying[e.id] ? 'animate-spin' : ''} />
                            {retrying[e.id] ? '…' : 'Push'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Voucher detail drawer */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.voucher_number || 'Voucher Details'}>
        {drawer && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-[#1A1A1A]">{drawer.party_name || 'No party'}</p>
                <p className="font-mono text-xs text-[#787774] mt-0.5">{drawer.voucher_number || '—'}</p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#ECEEEF] text-[#1A1A1A] border border-[#C5CBD0]">
                {getVoucherTypeLabel(drawer.voucher_type)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Date', drawer.date || '—'],
                ['Voucher No', drawer.voucher_number || '—'],
                ['Type', getVoucherTypeLabel(drawer.voucher_type)],
                ['Amount', drawer.amount ? fmt(drawer.amount) : '—'],
                ['Reference', drawer.reference || '—'],
                ['Narration', drawer.narration || '—'],
              ].map(([l, v]) => (
                <div key={l} className="p-3 bg-[#F9F9F9] rounded-xl border border-[#D4D3CE]">
                  <p className="text-xs text-[#787774] mb-1">{l}</p>
                  <p className="font-medium text-[#1A1A1A] text-sm break-all">{v}</p>
                </div>
              ))}
            </div>
            <button className="w-full py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: '#1A1A1A' }}>
              View Full Voucher
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
