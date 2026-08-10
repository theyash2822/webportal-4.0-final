import { useState, useEffect, useCallback } from 'react';
import { Users, Search, RefreshCw } from 'lucide-react';
import Table from '../components/Table';
import Drawer from '../components/Drawer';
import { useAuth } from '../contexts/AuthContext';
import api, { unwrapList } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';

const TYPE_TABS = ['All', 'Customer', 'Vendor'];

export default function Parties() {
  const { formatAmount } = useSettings();
  const fmt = n => formatAmount(n || 0);
  const { selectedCompany, isPaired } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState(0);
  const [drawer, setDrawer] = useState(null);

  const loadData = useCallback(async () => {
    if (!selectedCompany?.guid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const typeParam = typeTab === 1 ? 'customer' : typeTab === 2 ? 'vendor' : undefined;
    try {
      let list = [];
      try {
        const res = await api.fetchPartiesList(selectedCompany.guid, {
          type: typeParam,
          search: search || undefined,
        });
        list = unwrapList(res);
      } catch {
        // Fallback: sundry debtors/creditors via ledgers
        const groups = typeTab === 1
          ? ['Sundry Debtors']
          : typeTab === 2
            ? ['Sundry Creditors']
            : ['Sundry Debtors', 'Sundry Creditors'];
        const results = await Promise.all(
          groups.map(g => api.fetchLedgers({
            companyGuid: selectedCompany.guid,
            group: g,
            searchText: search,
            pageSize: 200,
          }).catch(() => null))
        );
        list = results.flatMap(r => unwrapList(r)).map(l => ({
          ...l,
          party_type: (l.parent || '').toLowerCase().includes('creditor') ? 'Vendor' : 'Customer',
        }));
      }
      setRows(list.map(p => ({
        id: p.id || p.guid,
        name: p.name || p.party_name || '—',
        gstin: p.gstin || p.GSTIN || '—',
        type: p.party_type || p.type || (typeParam === 'vendor' ? 'Vendor' : typeParam === 'customer' ? 'Customer' : (p.parent || '—')),
        closing: parseFloat(p.closing_balance ?? p.closingBalance ?? p.balance ?? 0) || 0,
        parent: p.parent || p.group_name || '',
        raw: p,
      })));
    } catch (e) {
      setError(e?.message || 'Failed to load parties');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.guid, typeTab, search]);

  useEffect(() => {
    const t = setTimeout(() => loadData(), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const filtered = rows.filter(r =>
    !search ||
    (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.gstin || '').toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { key: 'name', label: 'Name', render: v => <span className="font-medium text-[#1A1A1A]">{v}</span> },
    { key: 'gstin', label: 'GSTIN', render: v => <span className="font-mono text-xs text-[#787774]">{v}</span> },
    { key: 'type', label: 'Type', render: v => <span className="text-xs text-[#787774]">{v}</span> },
    { key: 'closing', label: 'Closing Balance', render: v => <span className="font-semibold">{fmt(v)}</span> },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <span>⚠️</span>
          <span><strong>Error:</strong> {error}</span>
          <button onClick={loadData} className="ml-auto underline font-medium">Retry</button>
        </div>
      )}
      {!isPaired && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span>🎭</span>
          <span><strong>Demo Mode</strong> — Pair Desktop App for real party data.</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Parties</h1>
          <p className="text-sm text-[#787774] mt-0.5">{selectedCompany?.name || 'No company'} · {loading ? 'Loading...' : `${filtered.length} parties`}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-[#1A1A1A] font-medium hover:text-[#787774]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-[#D4D3CE] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#ECEEEF] px-1 pt-1">
          {TYPE_TABS.map((t, i) => (
            <button key={t} onClick={() => setTypeTab(i)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg mr-1 ${typeTab === i ? 'text-[#1A1A1A] bg-[#ECEEEF] font-semibold' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-5">
          <div className="relative mb-4">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEACA8]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or GSTIN..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-[#F5F4EF] border border-[#ECEEEF] rounded-lg outline-none focus:border-[#1A1A1A] focus:bg-white" />
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-[#F5F4EF] rounded-lg animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={28} className="mx-auto mb-2 text-[#D4D3CE]" />
              <p className="text-sm text-[#AEACA8]">No parties found</p>
            </div>
          ) : (
            <Table columns={cols} data={filtered} onRowClick={setDrawer} />
          )}
        </div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.name || 'Party'}>
        {drawer && (
          <div className="space-y-3">
            {[['Name', drawer.name], ['GSTIN', drawer.gstin], ['Type', drawer.type], ['Closing', fmt(drawer.closing)], ['Group', drawer.parent || '—']].map(([l, v]) => (
              <div key={l} className="p-3 bg-[#F5F4EF] rounded-xl border border-[#D4D3CE]">
                <p className="text-xs text-[#AEACA8] mb-1">{l}</p>
                <p className="font-medium text-[#1A1A1A] text-sm">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
