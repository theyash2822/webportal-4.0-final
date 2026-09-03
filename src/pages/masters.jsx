import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Page, StatGrid, Button, Panel, DataTable, Pill, Tabs, Status, ModuleView,
  Empty, Skeleton, useDrawerParam, useLabelT,
} from '../components/kit';
import { useFmt, RecordDrawer, LedgerPanel, VoucherDrawer } from './shared';
import { useAuth } from '../contexts/AuthContext';
import { useOpenCreate } from '../components/create/CreateDrawer';
import { emptyLine } from '../components/create/common';
import api, { unwrapList, mapHomeMetricsToTab } from '../services/api';

const number = value => Number(value) || 0;
function useLiveCompanyMeta() {
  const { selectedCompany, selectedFY } = useAuth();
  const lt = useLabelT();
  const fy = selectedFY?.name || '';
  return { subtitle: selectedCompany ? <>{selectedCompany.name}{fy ? <> · {lt('FY')} {fy}</> : ''}</> : 'Select a company to view live data' };
}
const fyBody = (selectedCompany, selectedFY) => ({
  companyGuid: selectedCompany?.guid,
  pageSize: 500,
  ...api.fyDateParams(selectedFY),
});

function useLiveList(load, deps) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const genRef = useRef(0);
  const refresh = useCallback(async () => {
    const gen = ++genRef.current; // stale-response guard: only the latest request may commit
    setLoading(true);
    setError('');
    try {
      const response = await load();
      if (gen !== genRef.current) return;
      setRows(unwrapList(response));
    } catch (err) {
      if (gen !== genRef.current) return;
      setRows([]);
      setError(err?.message || 'Unable to load data');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [refresh]);
  return { rows, loading, error, refresh, setRows };
}

function Result({ loading, error, rows, retry, empty, children }) {
  const lt = useLabelT();
  if (loading) return <Panel><Skeleton rows={6} /></Panel>;
  if (error) {
    return (
      <Panel>
        <Empty message="Could not load data" hint={error} />
        <div className="-mt-8 flex justify-center pb-6"><Button onClick={retry}>{lt('Retry')}</Button></div>
      </Panel>
    );
  }
  if (!rows.length) return <Panel><Empty message={empty} hint="No records were returned for the selected company and financial year." /></Panel>;
  return children;
}

/* ── Parties ──────────────────────────────────────────────────────────────── */
export function Parties() {
  const { money, mc } = useFmt();
  const { selectedCompany, selectedFY } = useAuth();
  const [tab, setTab] = useState('All');
  const [active, setActive] = useState(null);
  const { subtitle } = useLiveCompanyMeta();
  const live = useLiveList(
    () => selectedCompany?.guid ? api.fetchParties(fyBody(selectedCompany, selectedFY)) : Promise.resolve([]),
    [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, selectedFY?.finYear, selectedFY?.uniqueId]
  );
  const parties = useMemo(() => live.rows.map((p, index) => {
    const group = p.type || p.parent || p.group || '';
    const partyType = p.party_type || (/creditor|supplier/i.test(group) ? 'supplier' : 'customer');
    return {
      ...p, id: p.id || p.guid || p.name || index, name: p.name || p.party_name || '—',
      type: group, party_type: partyType, outstanding: number(p.outstanding ?? p.closing_balance),
      balance: number(p.balance ?? p.closing_balance), gstin: p.gstin || '—',
      city: p.city || p.state || '—', phone: p.phone || p.mobile || '—',
    };
  }), [live.rows]);
  const rows = tab === 'All' ? parties : parties.filter(p => p.party_type === (tab === 'Customers' ? 'customer' : 'supplier'));
  const receivable = parties.filter(p => p.party_type === 'customer').reduce((s, p) => s + Math.abs(p.outstanding), 0);
  const payable = parties.filter(p => p.party_type === 'supplier').reduce((s, p) => s + Math.abs(p.outstanding), 0);

  return (
    <Page testid="parties-page" title="Parties" subtitle={subtitle}>
      <StatGrid items={[
        { label: 'Total parties', value: parties.length, sub: 'Debtors + creditors', tone: '#181818' },
        { label: 'Receivable', value: mc(receivable), sub: 'From customers', tone: '#BB7836' },
        { label: 'Payable', value: mc(payable), sub: 'To suppliers', tone: '#B14435' },
        { label: 'Active this FY', value: parties.length, sub: 'Synced parties', tone: '#447B4B' },
      ]} />
      <Tabs tabs={['All', 'Customers', 'Suppliers']} value={tab} onChange={setTab} testid="parties-tabs" />
      <Result {...live} rows={rows} retry={live.refresh} empty="No parties found">
        <DataTable testid="parties-table" rows={rows} onRowClick={setActive} columns={[
          { key: 'name', label: 'Party', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'type', label: 'Group' }, { key: 'gstin', label: 'GSTIN' },
          { key: 'city', label: 'City' }, { key: 'phone', label: 'Phone' },
          { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => money(r.outstanding) },
          { key: 'balance', label: 'Balance', align: 'right', render: r => <span className={r.balance < 0 ? 'text-neg' : 'text-pos'}>{money(r.balance)}</span> },
        ]} />
      </Result>
      {active && <RecordDrawer record={active} onClose={() => setActive(null)} title={active.name} sub={active.type || 'Party'} fields={[
        ['GSTIN', active.gstin], ['City', active.city], ['Phone', active.phone],
        ['Outstanding', money(active.outstanding), true], ['Balance', money(active.balance), true],
      ]} />}
    </Page>
  );
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */
export function Expenses() {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [tab, setTab] = useState('All expenses');
  const [typeFilter, setTypeFilter] = useState('All');
  const [active, setActive] = useState(null);
  const { subtitle } = useLiveCompanyMeta();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [counts, setCounts] = useState(null);
  const [homeMetrics, setHomeMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const genRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!selectedCompany?.guid) {
      setRows([]);
      setCategories([]);
      setSummary(null);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.fetchExpenses({
        ...fyBody(selectedCompany, selectedFY),
        ...(typeFilter !== 'All' ? { types: typeFilter } : {}),
      });
      const countsRes = await api.fetchExpenseCounts(selectedCompany.guid, {
        from: selectedFY?.startDate, to: selectedFY?.endDate,
      }).catch(() => null);
      const metricsRes = await api.fetchExpensesHomeMetrics(selectedCompany.guid, selectedFY?.startDate, selectedFY?.endDate).catch(() => null);
      if (gen !== genRef.current) return;
      const list = (res.expenses || []).map((e, i) => ({
        ...e,
        id: e.guid || e.id || i,
        voucher_number: e.voucher_number || e.ref || '—',
        party_name: e.expense_ledger || e.party_name || e.vendor || '—',
        category: e.expense_group || e.category || e.voucher_type || 'Other',
        expense_type: e.expense_type || '',
        amount: number(e.expense_amount ?? e.amount),
      }));
      setRows(list);
      setCategories((res.categories || []).map((c, i) => ({
        id: c.id || c.name || i,
        name: c.name || 'Expense',
        amount: number(c.amount_raw ?? c.amount),
        count: list.filter(e => e.category === c.name).length,
      })).sort((a, b) => b.amount - a.amount));
      setSummary(res.summary || null);
      setCounts(countsRes?.data || countsRes || null);
      setHomeMetrics(mapHomeMetricsToTab(metricsRes?.data || metricsRes));
    } catch (err) {
      if (gen !== genRef.current) return;
      setRows([]);
      setCategories([]);
      setSummary(null);
      setError(err?.message || 'Unable to load data');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, typeFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const total = number(summary?.total) || rows.reduce((s, e) => s + e.amount, 0);
  const cats = categories.length
    ? categories
    : Object.values(rows.reduce((out, e) => {
      const current = out[e.category] || { id: e.category, name: e.category, amount: 0, count: 0 };
      return { ...out, [e.category]: { ...current, amount: current.amount + e.amount, count: current.count + 1 } };
    }, {})).sort((a, b) => b.amount - a.amount);
  const shown = tab === 'By category' ? cats : rows;
  const live = { loading, error, rows: shown, refresh };

  const metricKpis = homeMetrics?.kpis || [];
  const statItems = metricKpis.length >= 3
    ? metricKpis.slice(0, 4).map((k, i) => ({
      label: k.label,
      value: k.format === 'currency' ? mc(Number(k.value) || 0) : String(k.value ?? '—'),
      sub: i === 0 ? `${counts?.total ?? summary?.count ?? rows.length} ${lt('entries')}` : lt('From /expenses/home-metrics'),
      tone: ['#B14435', '#181818', '#BB7836', '#3963E4'][i],
    }))
    : [
      { label: 'Total expenses', value: summary?.display || mc(total), sub: `${counts?.total ?? summary?.count ?? rows.length} ${lt('entries')}`, tone: '#B14435' },
      { label: 'Direct', value: String(counts?.direct ?? counts?.Direct ?? '—'), sub: lt('From /expenses/counts'), tone: '#181818' },
      { label: 'Indirect', value: String(counts?.indirect ?? counts?.Indirect ?? '—'), sub: lt('From /expenses/counts'), tone: '#BB7836' },
      { label: 'Categories', value: cats.length, sub: cats[0] ? mc(cats[0].amount) : '—', tone: '#3963E4' },
    ];

  return (
    <Page testid="expenses-page" title="Expenses" subtitle={subtitle}>
      <StatGrid items={statItems} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={['All expenses', 'By category']} value={tab} onChange={setTab} testid="expenses-tabs" />
        <div className="flex flex-wrap gap-2" data-testid="expenses-type-filter">
          {['All', 'Direct', 'Indirect'].map(opt => (
            <Button key={opt} variant={typeFilter === opt ? 'primary' : 'ghost'} onClick={() => setTypeFilter(opt)}>
              {lt(opt)}
            </Button>
          ))}
        </div>
      </div>
      <Result {...live} retry={refresh} empty="No expenses found">
        {tab === 'By category' ? (
          <Panel title="Expense register" sub="Grouped by expense head">
            <DataTable testid="expense-register-table" rows={cats} columns={[
              { key: 'name', label: 'Category', render: r => <span className="font-medium">{r.name}</span> },
              { key: 'count', label: 'Entries', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
              { key: 'share', label: 'Share', align: 'right', render: r => `${total ? Math.round((r.amount / total) * 100) : 0}%` },
            ]} footer={f => `${lt('Total')} ${money(f.reduce((s, r) => s + r.amount, 0))}`} />
          </Panel>
        ) : (
          <DataTable testid="expenses-table" rows={rows} onRowClick={setActive} columns={[
            { key: 'date', label: 'Date', render: r => date(r.date) },
            { key: 'voucher_number', label: 'Ref' }, { key: 'party_name', label: 'Ledger' },
            { key: 'category', label: 'Category', render: r => <Pill>{r.category}</Pill> },
            { key: 'expense_type', label: 'Type', render: r => r.expense_type ? <Pill tone="note">{r.expense_type}</Pill> : '—' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
          ]} footer={f => `${lt('Total')} ${money(f.reduce((s, r) => s + r.amount, 0))}`} />
        )}
      </Result>
      {active && <RecordDrawer record={active} onClose={() => setActive(null)} title={active.voucher_number} sub={`${lt('Expense')} · ${date(active.date)}`} fields={[
        ['Ledger', active.party_name], ['Category', active.category], ['Type', active.expense_type || '—'],
        ['Date', date(active.date), true], ['Amount', money(active.amount), true], ['Narration', active.narration || '—'],
      ]} />}
    </Page>
  );
}

export function PaymentsReceipts() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [tab, setTab] = useState('Receipts');
  const { subtitle } = useLiveCompanyMeta();
  const loadType = useCallback(type => api.fetchVouchers({ ...fyBody(selectedCompany, selectedFY), voucherType: type }), [selectedCompany, selectedFY]);
  const receipts = useLiveList(() => selectedCompany?.guid ? loadType('Receipt') : Promise.resolve([]), [loadType, selectedCompany?.guid]);
  const payments = useLiveList(() => selectedCompany?.guid ? loadType('Payment') : Promise.resolve([]), [loadType, selectedCompany?.guid]);
  const current = tab === 'Receipts' ? receipts : payments;
  const rows = current.rows.map(r => ({ ...r, amount: number(r.amount), status: r.status || (r.is_cancelled ? 'cancelled' : 'synced') }));
  const received = receipts.rows.reduce((s, r) => s + number(r.amount), 0);
  const paid = payments.rows.reduce((s, r) => s + number(r.amount), 0);
  return (
    <Page testid="payments-page" title="Payments & Receipts" subtitle={subtitle}>
      <StatGrid items={[
        { label: 'Received', value: mc(received), sub: `${receipts.rows.length} ${lt('receipts')}`, tone: '#447B4B' },
        { label: 'Paid', value: mc(paid), sub: `${payments.rows.length} ${lt('payments')}`, tone: '#B14435' },
        { label: 'Net movement', value: mc(received - paid), sub: 'This FY', tone: '#181818' },
        { label: 'Voucher types', value: 2, sub: 'Receipt and payment', tone: '#3963E4' },
      ]} />
      <Tabs tabs={['Receipts', 'Payments']} value={tab} onChange={setTab} testid="payments-tabs" />
      <Result {...current} rows={rows} retry={current.refresh} empty={tab === 'Receipts' ? 'No receipts found' : 'No payments found'}>
        <VoucherTable rows={rows} testid="payments-table" partyLabel={tab === 'Receipts' ? 'Received from' : 'Paid to'} />
      </Result>
    </Page>
  );
}

function VoucherTable({ rows, testid, partyLabel = 'Party' }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useState(null);
  return (
    <>
      <DataTable testid={testid} rows={rows} onRowClick={setActive} columns={[
        { key: 'date', label: 'Date', render: r => date(r.date) },
        { key: 'voucher_number', label: 'Voucher No.' }, { key: 'party_name', label: partyLabel },
        { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
        { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
      ]} footer={f => `${lt('Total')} ${money(f.reduce((s, r) => s + number(r.amount), 0))}`} />
      {active && <RecordDrawer record={active} onClose={() => setActive(null)} title={active.voucher_number || 'Voucher'} sub={`${active.voucher_type || ''} · ${date(active.date)}`} fields={[
        [partyLabel, active.party_name || '—'], ['Amount', money(active.amount), true], ['Status', active.status],
        ['Narration', active.narration || '—'],
      ]} />}
    </>
  );
}

/* ── Ledgers ──────────────────────────────────────────────────────────────── */
export function Ledgers() {
  const { money, mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  // Query-param drawer (?ledger=<guid>) so Quick Search and deep links can open a ledger directly.
  const [activeId, setActiveId] = useDrawerParam('ledger');
  const { subtitle } = useLiveCompanyMeta();
  const live = useLiveList(
    () => selectedCompany?.guid ? api.fetchLedgers(fyBody(selectedCompany, selectedFY)) : Promise.resolve([]),
    [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, selectedFY?.finYear, selectedFY?.uniqueId]
  );
  const rows = useMemo(() => live.rows.map((l, i) => {
    const raw = number(l.closing_balance ?? l.balance ?? l.fy_closing_abs);
    const type = l.type || l.balance_type || l.fy_closing_type || (raw < 0 ? 'Cr' : 'Dr');
    return { ...l, id: l.id || l.guid || l.name || i, group: l.group || l.parent || '—', type, balance: Math.abs(raw) };
  }), [live.rows]);
  const groups = [...new Set(rows.map(l => l.group))];
  return (
    <Page testid="ledgers-page" title="Ledgers" subtitle={subtitle}>
      <StatGrid items={[
        { label: 'Ledgers', value: rows.length, sub: `${groups.length} ${lt('groups')}`, tone: '#181818' },
        { label: 'Debit total', value: mc(rows.filter(l => l.type === 'Dr').reduce((s, l) => s + l.balance, 0)), sub: 'Dr balances', tone: '#447B4B' },
        { label: 'Credit total', value: mc(rows.filter(l => l.type === 'Cr').reduce((s, l) => s + l.balance, 0)), sub: 'Cr balances', tone: '#B14435' },
        { label: 'Bank & cash', value: mc(rows.filter(l => /bank|cash/i.test(l.group)).reduce((s, l) => s + l.balance, 0)), sub: 'Liquid', tone: '#3963E4' },
      ]} />
      <Result {...live} rows={rows} retry={live.refresh} empty="No ledgers found">
        <DataTable testid="ledgers-table" rows={rows} onRowClick={r => setActiveId(r.guid || r.name)} columns={[
          { key: 'name', label: 'Ledger', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'group', label: 'Under group' },
          { key: 'type', label: 'Dr/Cr', render: r => <Pill tone={r.type === 'Dr' ? 'pos' : 'warn'}>{r.type}</Pill> },
          { key: 'balance', label: 'Closing balance', align: 'right', render: r => money(r.balance) },
        ]} />
      </Result>
      {activeId && <LedgerPanel id={activeId} onClose={() => setActiveId(null)} />}
    </Page>
  );
}

/* ── AI Insights ──────────────────────────────────────────────────────────── */
const AGING_COLORS = ['#447B4B', '#BB7836', '#B14435'];
const SEV_TONE = { critical: 'neg', warning: 'warn', success: 'pos', info: 'note' };

function fmtInsightDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function AIInsights() {
  const { selectedCompany, selectedFY, syncVersion } = useAuth();
  const { mc, money } = useFmt();
  const lt = useLabelT();
  const { subtitle } = useLiveCompanyMeta();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const genRef = useRef(0);

  const fyParam = selectedFY?.startDate
    ? `${selectedFY.startDate.slice(0, 4)}-${Number(selectedFY.startDate.slice(0, 4)) + 1}`
    : api.fyParamFromFY(selectedFY);
  const isCurrentFY = useMemo(() => {
    if (!selectedFY?.endDate) return true;
    return new Date().toISOString().slice(0, 10) <= selectedFY.endDate;
  }, [selectedFY?.endDate]);

  const refresh = useCallback(async () => {
    if (!selectedCompany?.guid) {
      setData(null);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError('');
    try {
      const res = isCurrentFY
        ? await api.fetchAIInsights(selectedCompany.guid, {
          fy: fyParam,
          from: selectedFY?.startDate,
          to: selectedFY?.endDate,
        })
        : await api.fetchAIInsightsHistory(selectedCompany.guid, fyParam);
      if (gen !== genRef.current) return;
      setData(res?.data ?? res ?? null);
    } catch (err) {
      if (gen !== genRef.current) return;
      setData(null);
      setError(err?.message || 'Unable to load AI insights');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, fyParam, isCurrentFY]);

  useEffect(() => { refresh(); }, [refresh, syncVersion]);

  const summary = data?.summary || {};
  const recommendations = data?.recommendations || [];
  const revenueForecast = (data?.revenueForecast || []).map(r => ({
    month: r.month,
    actual: r.actual != null ? number(r.actual) / 100000 : null,
    forecast: r.forecast != null ? number(r.forecast) / 100000 : null,
  }));
  const expenseData = (data?.expenseData || []).map(r => ({
    month: r.month,
    amount: number(r.amount) / 100000,
    isSpike: !!r.isSpike,
  }));
  const receivablesAging = data?.receivablesAging || [];
  const topCustomers = data?.topCustomers || [];
  const topSuppliers = data?.topSuppliers || [];
  const stockout = data?.stockout || [];
  const criticalStock = stockout.filter(s => s.critical).length;
  const netPosition = number(summary.totalRevenue) - number(summary.totalExpenses);

  const revenueKPI = useMemo(() => {
    const actuals = (data?.revenueForecast || []).filter(d => d.actual != null);
    if (actuals.length < 2) return null;
    const last = number(actuals[actuals.length - 1].actual);
    const prev = number(actuals[actuals.length - 2].actual);
    if (prev <= 50000) return null;
    return Math.round(((last - prev) / prev) * 100);
  }, [data?.revenueForecast]);

  return (
    <Page
      testid="ai-insights-page"
      title={isCurrentFY ? 'AI Insights' : 'FY Summary'}
      subtitle={subtitle}
      actions={<Button onClick={refresh} disabled={loading}>{lt('Refresh')}</Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={isCurrentFY ? 'note' : 'warn'}>{isCurrentFY ? lt('Powered by AI') : lt('Historical Analysis')}</Pill>
        {data?._cacheGeneratedAt && isCurrentFY && (
          <p className="text-[12px] text-ink-soft">
            {lt('Generated on')} {fmtInsightDate(data._cacheGeneratedAt)}
            {data._cacheValidUntil ? ` · ${lt('Next refresh')} ${fmtInsightDate(data._cacheValidUntil)}` : ''}
          </p>
        )}
      </div>

      <StatGrid items={[
        { label: 'Total revenue', value: mc(number(summary.totalRevenue)), sub: isCurrentFY ? 'Selected FY' : fyParam, tone: '#447B4B', delta: revenueKPI },
        { label: 'Total expenses', value: mc(number(summary.totalExpenses)), sub: 'Purchase & ops spend', tone: '#B14435' },
        { label: 'Net position', value: mc(netPosition), sub: 'Revenue less expenses', tone: netPosition >= 0 ? '#181818' : '#B14435' },
        { label: 'Receivables', value: mc(number(summary.totalReceivables)), sub: `${criticalStock} critical stock`, tone: '#3963E4' },
      ]} />

      {loading && !data ? <Panel><Skeleton rows={8} /></Panel> : null}
      {error ? (
        <Panel>
          <Empty message="Could not load AI insights" hint={error} />
          <div className="-mt-8 flex justify-center pb-6"><Button onClick={refresh}>{lt('Retry')}</Button></div>
        </Panel>
      ) : null}

      {!loading && !error && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={isCurrentFY ? 'Revenue forecast' : 'Revenue trend'} sub={revenueKPI != null ? `${revenueKPI > 0 ? '+' : ''}${revenueKPI}% vs prior month` : undefined}>
              {revenueForecast.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenueForecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `₹${v}L`} width={52} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => money(Number(v) * 100000)} />
                    <Legend />
                    <Line type="monotone" dataKey="actual" name={lt('Actual')} stroke="#BB7836" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                    {isCurrentFY && <Line type="monotone" dataKey="forecast" name={lt('Forecast')} stroke="#181818" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              ) : <Empty message="No revenue data for this period" />}
            </Panel>

            <Panel title="Expense spike alert" sub={expenseData.some(d => d.isSpike) ? `${expenseData.filter(d => d.isSpike).length} spike(s) detected` : 'Monthly purchase spend'}>
              {expenseData.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={expenseData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `₹${v}L`} width={52} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => money(Number(v) * 100000)} />
                    <Bar dataKey="amount" name={lt('Expenses')} fill="#B14435" maxBarSize={28}
                      shape={props => {
                        const { x, y, width, height, payload } = props;
                        return <rect x={x} y={y} width={width} height={height} fill={payload.isSpike ? '#B14435' : '#BB7836'} rx={4} />;
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty message="No expense data for this period" />}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Cash flow summary">
              {summary.totalRevenue != null ? (
                <div className="divide-y divide-line-subtle">
                  {[
                    ['Revenue (inflows)', number(summary.totalRevenue), 'pos'],
                    ['Expenses (outflows)', number(summary.totalExpenses), 'neg'],
                    ['Net', netPosition, netPosition >= 0 ? 'pos' : 'neg'],
                  ].map(([label, val, tone]) => (
                    <div key={label} className="flex items-center justify-between py-2.5">
                      <span className="text-[13px] text-ink-soft">{lt(label)}</span>
                      <span className={`text-[13px] font-semibold tabular ${tone === 'neg' ? 'text-neg' : tone === 'pos' ? 'text-pos' : ''}`}>{money(val)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty message="No cash flow summary" />}
            </Panel>

            <Panel title="Receivables risk" sub={summary.totalReceivables ? mc(number(summary.totalReceivables)) : undefined}>
              {receivablesAging.length ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={receivablesAging.filter(s => number(s.pct) > 0)} dataKey="pct" nameKey="label" innerRadius={42} outerRadius={68} paddingAngle={2}>
                        {receivablesAging.map((_, i) => <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(_, __, p) => [`${p.payload.pct}% · ${money(number(p.payload.amount))}`, p.payload.label]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {receivablesAging.map((s, i) => (
                      <div key={s.label} className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-2 text-ink-soft"><span className="h-2 w-2 rounded-full" style={{ background: AGING_COLORS[i % AGING_COLORS.length] }} />{s.label}</span>
                        <span className="font-medium tabular">{money(number(s.amount))}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <Empty message="No outstanding receivables" />}
            </Panel>

            <Panel title="Stock-out risk" sub={`${criticalStock} critical`}>
              {stockout.length ? (
                <div className="divide-y divide-line-subtle">
                  {stockout.map(s => (
                    <div key={s.item} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{s.item}</p>
                        <p className="text-[11px] text-ink-soft">{s.qty} {s.unit} · reorder {s.reorder}</p>
                      </div>
                      <Pill tone={s.critical ? 'neg' : 'warn'}>{s.critical ? lt('Critical') : lt('Low')}</Pill>
                    </div>
                  ))}
                </div>
              ) : <Empty message="No low-stock items detected" />}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Top customers">
              {topCustomers.length ? (
                <DataTable testid="ai-top-customers" rows={topCustomers.map((c, i) => ({ id: c.name || i, ...c }))} columns={[
                  { key: 'name', label: 'Customer', render: r => <span className="font-medium">{r.name}</span> },
                  { key: 'pct', label: 'Share', align: 'right', render: r => `${r.pct}%` },
                  { key: 'revenue', label: 'Revenue', align: 'right', render: r => money(number(r.revenue)) },
                ]} />
              ) : <Empty message="No sales data for this period" />}
            </Panel>
            <Panel title="Top suppliers">
              {topSuppliers.length ? (
                <DataTable testid="ai-top-suppliers" rows={topSuppliers.map((s, i) => ({ id: s.name || i, ...s }))} columns={[
                  { key: 'name', label: 'Supplier', render: r => <span className="font-medium">{r.name}</span> },
                  { key: 'pct', label: 'Share', align: 'right', render: r => `${r.pct}%` },
                  { key: 'spend', label: 'Spend', align: 'right', render: r => money(number(r.spend)) },
                ]} />
              ) : <Empty message="No purchase data for this period" />}
            </Panel>
          </div>

          <Panel title={isCurrentFY ? 'AI recommendations' : 'Business highlights'} sub={data.aiNarrated ? lt('Narrated by AI from your live books') : lt('Rules-based analysis from synced Tally data')}>
            {recommendations.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {recommendations.map((rec, i) => {
                  const sev = rec.severity || 'info';
                  const text = rec.text || rec.body || rec.message || rec.recommendation || '';
                  return (
                    <div key={rec.id || i} className="rounded-xl border border-line bg-surface p-4" data-testid={`insight-${i}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Pill tone={SEV_TONE[sev] || 'note'}>{lt(sev)}</Pill>
                        {rec.icon ? <span className="text-[11px] text-ink-faint">{rec.icon.replace(/-outline$/, '')}</span> : null}
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink-soft">{text}</p>
                    </div>
                  );
                })}
              </div>
            ) : <Empty message={isCurrentFY ? 'No recommendations available yet' : 'No highlights for this financial year'} hint="Sync Tally data and try again after the next monthly refresh." />}
          </Panel>
        </div>
      )}
    </Page>
  );
}

/* ── Day Book (Audit Trail workspace) ─────────────────────────────────────── */
export function DayBook() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [type, setType] = useState('All');
  // Query-param drawer (?voucher=<guid>) so Quick Search can open a voucher directly.
  const [activeId, setActiveId] = useDrawerParam('voucher');
  const [fetched, setFetched] = useState(null);
  const live = useLiveList(
    () => selectedCompany?.guid
      ? api.fetchDaybook(selectedCompany.guid, { ...api.fyDateParams(selectedFY), pageSize: 500 })
      : Promise.resolve([]),
    [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, selectedFY?.finYear, selectedFY?.uniqueId]
  );
  const all = live.rows.map((r, i) => {
    const amount = number(r.amount);
    const debit = number(r.debit) || (/payment|purchase|debit/i.test(r.voucher_type || '') ? amount : 0);
    const credit = number(r.credit) || (debit ? 0 : amount);
    return { ...r, id: r.id || r.guid || i, debit, credit, entered_by: r.entered_by || r.created_by || '—' };
  });
  const types = ['All', ...new Set(all.map(d => d.voucher_type).filter(Boolean))];
  const rows = type === 'All' ? all : all.filter(d => d.voucher_type === type);
  // Deep-linked voucher (?voucher=<guid>) may be outside the loaded FY list — fetch it on demand.
  const inList = !!(activeId && live.rows.some(r => String(r.guid || r.id) === String(activeId)));
  useEffect(() => {
    setFetched(null);
    if (!activeId || inList || live.loading || !selectedCompany?.guid) return;
    let alive = true;
    api.fetchVoucherFull(selectedCompany.guid, activeId)
      .then(res => {
        const v = res?.data?.voucher || res?.data;
        if (!alive || !v) return;
        const amount = number(v.amount);
        setFetched({
          ...v,
          debit: number(v.debit) || (/payment|purchase|debit/i.test(v.voucher_type || '') ? amount : 0),
          credit: number(v.credit) || amount,
          entered_by: v.entered_by || v.created_by || '—',
        });
      })
      .catch(() => { if (alive) setActiveId(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, inList, live.loading, selectedCompany?.guid]);
  return (
    <ModuleView title="Day Book" sub="Every entry passed in the selected period" testid="daybook-view">
      <StatGrid items={[
        { label: 'Entries', value: rows.length, sub: 'Selected view', tone: '#181818' },
        { label: 'Total debit', value: money(rows.reduce((s, r) => s + r.debit, 0)), sub: 'Dr', tone: '#447B4B' },
        { label: 'Total credit', value: money(rows.reduce((s, r) => s + r.credit, 0)), sub: 'Cr', tone: '#B14435' },
        { label: 'Voucher types', value: types.length - 1, sub: 'In this period', tone: '#3963E4' },
      ]} />
      <Tabs tabs={types} value={type} onChange={setType} testid="daybook-tabs" />
      <Result {...live} rows={rows} retry={live.refresh} empty="No day book entries found">
        <DataTable testid="daybook-table" rows={rows} pageSize={15} onRowClick={r => setActiveId(r.guid || r.id)} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) },
          { key: 'voucher_type', label: 'Type', render: r => <Pill>{r.voucher_type}</Pill> },
          { key: 'voucher_number', label: 'Voucher No.' }, { key: 'party_name', label: 'Particulars' },
          { key: 'entered_by', label: 'Entered by' },
          { key: 'debit', label: 'Debit', align: 'right', render: r => (r.debit ? money(r.debit) : '—') },
          { key: 'credit', label: 'Credit', align: 'right', render: r => (r.credit ? money(r.credit) : '—') },
        ]} footer={f => `${lt('Net')} ${money(f.reduce((s, r) => s + r.credit - r.debit, 0))}`} />
      </Result>
      {(() => {
        if (!activeId) return null;
        const active = all.find(r => String(r.guid || r.id) === String(activeId)) || fetched;
        if (!active) return null;
        return (
          <VoucherDrawer
            voucher={active}
            onClose={() => setActiveId(null)}
            onVoucherChanged={() => live.refresh()}
          />
        );
      })()}
    </ModuleView>
  );
}

/* ── My entries ───────────────────────────────────────────────────────────── */
export function MyEntries() {
  const { selectedCompany, selectedFY } = useAuth();
  const lt = useLabelT();
  const retryFailed = lt('Retry failed');
  const live = useLiveList(() => selectedCompany?.guid ? api.fetchMyEntries(selectedCompany.guid, {
    from: selectedFY?.startDate, to: selectedFY?.endDate, limit: 200,
  }) : Promise.resolve([]), [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  const retry = async row => {
    try {
      await api.retryMyEntry(row._queue_id || row.id);
      await live.refresh();
    } catch (err) {
      window.alert(err?.message || retryFailed);
    }
  };
  return (
    <ModuleView title="My Entries" sub="Vouchers created from this portal" testid="my-entries-view">
      <Result {...live} retry={live.refresh} empty="No entries found">
        <MyEntriesTable rows={live.rows} retry={retry} />
      </Result>
    </ModuleView>
  );
}

function MyEntriesTable({ rows, retry }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  return <DataTable testid="my-entries-table" rows={rows} columns={[
    { key: 'date', label: 'Date', render: r => date(r.date || r.created_at) },
    { key: 'voucher_type', label: 'Voucher type', render: r => r.voucher_type || r.entry_type },
    { key: 'voucher_number', label: 'Voucher No.', render: r => r.voucher_number || r.tally_voucher_number || '—' },
    { key: 'party_name', label: 'Party', render: r => r.party_name || r.entry_label || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
    { key: 'status', label: 'Status', render: r => <Status value={r._queue_status || r.status} /> },
    { key: 'action', label: '', sortable: false, render: r => /failed|offline/i.test(r._queue_status || r.status) ? <Button onClick={e => { e.stopPropagation(); retry(r); }}>{lt('Retry')}</Button> : null },
  ]} />;
}

/* ── Audit trail ──────────────────────────────────────────────────────────── */

// Mobile-parity type labels for write_queue entry_type / app_vouchers voucher_type codes.
const AT_TYPE_LABELS = {
  sales: 'Sales', sales_invoice: 'Sales', proforma: 'Proforma Invoice', proforma_invoice: 'Proforma Invoice',
  sales_order: 'Sales Order', purchase: 'Purchase', purchase_invoice: 'Purchase', purchase_order: 'Purchase Order',
  payment: 'Payment', receipt: 'Receipt', journal: 'Journal', contra: 'Contra',
  debit_note: 'Debit Note', credit_note: 'Credit Note', delivery_note: 'Delivery Note',
  stock_transfer: 'Stock Transfer', stock_adjustment: 'Adjustment', alter_stock_item: 'Stock Edit',
  item: 'New Item', party: 'New Ledger', bank: 'New Ledger', warehouse: 'New Warehouse',
};
const AT_MASTER_TYPES = ['party', 'bank', 'warehouse', 'item', 'alter_stock_item'];
const atParse = p => { try { return typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch { return {}; } };
// Mobile: everything except these e-invoice/EWB states counts as "pending".
const atDocPending = s => !['not_applicable', 'not_required', 'generated', 'cancelled'].includes(s || 'not_applicable');

function normalizeAuditRow(r) {
  const rawType = r.app_voucher_type || r.voucher_type || r.entry_type || '';
  const isMaster = r._is_master || AT_MASTER_TYPES.includes(rawType);
  const converted = r.conversion_status === 'converted'
    || (r.original_entry_type === 'optional' && r.current_entry_type === 'regular');
  let type = AT_TYPE_LABELS[rawType] || rawType || '—';
  if (/proforma/i.test(rawType) && converted) type = 'Sales'; // mobile shows converted proforma as Sales
  const qs = r._queue_status;
  const sync = qs === 'posted' || qs === 'success' ? 'synced'
    : qs === 'failed' ? 'failed'
    : qs === 'processing' ? 'processing' : 'pending';
  return {
    ...r,
    _type: type, _rawType: rawType, _isMaster: isMaster, _converted: converted, _sync: sync,
    party_name: r.party_name || r.entry_label || '—',
    _ref: r.voucher_number || r.av_tally_voucher_no || r.tdk_reference_no || '—',
    _irnPending: atDocPending(r.e_invoice_status),
    _ewbPending: atDocPending(r.e_way_bill_status),
  };
}

const AT_LIFECYCLE = [
  ['all', 'All'], ['pending_sync', 'Pending Sync'], ['regular', 'Regular'], ['optional', 'Optional'],
  ['originally_optional', 'Orig. Optional'], ['failed', 'Failed'], ['irn_pending', 'IRN Pending'], ['ewb_pending', 'EWB Pending'],
];
// Mirrors the backend/mobile lifecycleFilter logic (kept client-side so chips are instant).
function atMatchesLifecycle(r, f) {
  const entryType = r.current_entry_type || r.original_entry_type;
  switch (f) {
    case 'pending_sync': return r._sync === 'pending' || r._sync === 'processing'
      || (r._isMaster && r.books_impact_status === 'not_posted' && r._queue_status === 'success');
    case 'regular': return r._isMaster || entryType === 'regular' || (!entryType && r._queue_status === 'posted');
    case 'optional': return !r._isMaster && entryType === 'optional';
    case 'originally_optional': return !r._isMaster && r.original_entry_type === 'optional' && entryType === 'regular';
    case 'failed': return r._sync === 'failed';
    case 'irn_pending': return r._irnPending;
    case 'ewb_pending': return r._ewbPending;
    default: return true;
  }
}

function AuditLifecycleBadges({ r }) {
  const lt = useLabelT();
  return (
    <span className="flex flex-wrap gap-1">
      {r._sync === 'failed' ? <Pill tone="neg">{lt('Failed')}</Pill>
        : r._sync !== 'synced' ? <Pill tone="warn">{lt('Pending Sync')}</Pill>
        : r._isMaster && r.books_impact_status === 'not_posted' ? <Pill tone="warn">{lt('Awaiting Sync')}</Pill>
        : <Pill tone="pos">{lt('Posted')}</Pill>}
      {!r._isMaster && (r.current_entry_type === 'optional'
        ? <Pill tone="warn">{lt('Optional')}</Pill>
        : r._converted ? <Pill tone="info">{lt('From Proforma')}</Pill>
        : r.current_entry_type === 'regular' ? <Pill tone="pos">{lt('Regular')}</Pill> : null)}
      {r.e_invoice_status === 'generated' && <Pill tone="info">{lt('IRN ✓')}</Pill>}
      {r._irnPending && <Pill tone="info">{r.e_invoice_status === 'failed' ? lt('IRN Failed') : lt('IRN Pending')}</Pill>}
      {r._ewbPending && <Pill tone="info">{lt('EWB Pending')}</Pill>}
    </span>
  );
}

export function AuditTrail() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const retryFailed = lt('Retry failed');
  const { selectedCompany, selectedFY } = useAuth();
  const openCreate = useOpenCreate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [lifecycle, setLifecycle] = useState('all');
  const [preview, setPreview] = useState(null);
  const [masterPreview, setMasterPreview] = useState('');
  const [masterBusy, setMasterBusy] = useState(false);
  const live = useLiveList(async () => {
    if (!selectedCompany?.guid) return [];
    const from = selectedFY?.startDate, to = selectedFY?.endDate;
    const res = await api.fetchMyEntries(selectedCompany.guid, { from, to, limit: 200 });
    // my-entries returns { data: posted, pending: queued/failed } — audit trail shows both.
    // De-dupe like mobile: posted rows can fan out on the vouchers⋈app_vouchers join, and a
    // queue row must not repeat once its posted counterpart exists. Also clamp pending rows
    // to the FY range (the backend pending query has no date predicate).
    const seen = new Set();
    const posted = (res?.data || []).filter(r => {
      const key = r.tdk_reference_no || r.guid || `${r.voucher_number}|${r.date}|${r.voucher_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const postedRefs = new Set(posted.map(r => r.tdk_reference_no).filter(Boolean));
    const pending = (res?.pending || []).filter(r =>
      !(r.tdk_reference_no && postedRefs.has(r.tdk_reference_no))
      && (!from || !r.date || r.date >= from) && (!to || !r.date || r.date <= to));
    return [
      ...pending.map(r => ({ ...normalizeAuditRow(r), id: `q-${r._queue_id ?? r.id}` })),
      ...posted.map(r => ({ ...normalizeAuditRow(r), id: `p-${r.av_id ?? r.tdk_reference_no ?? r.guid ?? r.id}` })),
    ];
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);

  // Company/FY switches must not leak a stale drawer or an impossible type filter.
  useEffect(() => {
    setPreview(null);
    setTypeFilter('all');
    setLifecycle('all');
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);

  const typeOptions = useMemo(
    () => ['all', ...new Set(live.rows.map(r => r._type).filter(t => t && t !== '—'))],
    [live.rows]
  );
  const rows = useMemo(
    () => live.rows.filter(r => (typeFilter === 'all' || r._type === typeFilter) && atMatchesLifecycle(r, lifecycle)),
    [live.rows, typeFilter, lifecycle]
  );

  const retry = async row => {
    try {
      await api.retryMyEntry(row._queue_id || row.id);
      await live.refresh();
    } catch (err) {
      window.alert(err?.message || retryFailed);
    }
  };

  // Convert eligibility — identical to mobile audit-trail: Proforma type, still optional,
  // not converted, has TDK ref, and has a Tally voucher number or synced status.
  const canConvert = r => /proforma/i.test(r._rawType)
    && r.current_entry_type === 'optional'
    && r.conversion_status !== 'converted'
    && !!r.tdk_reference_no
    && (!!(r.av_tally_voucher_no || r.voucher_number) || r._sync === 'synced');

  const convert = r => {
    const p = atParse(r._payload);
    openCreate('sales-invoice', {
      convertTdkRef: r.tdk_reference_no,
      party: p.partyLedger || r.party_name || '',
      ledger: p.salesLedger || '',
      reference: p.reference || r.tdk_reference_no || '',
      narration: p.narration || '',
      date: p.date || r.date || '',
      taxes: (p.taxes || []).map(t => ({ ledgerName: t.ledgerName, taxRate: t.taxRate ?? '', taxAmount: t.taxAmount ?? '' })),
      lines: (p.items || []).map(it => ({
        ...emptyLine(),
        name: it.name || it.item_name || '', qty: Math.abs(parseFloat(it.qty)) || 1,
        rate: Math.abs(parseFloat(it.rate)) || '', unit: it.unit || '', godown: it.godown || '',
        discount: it.discount ?? 0,
      })),
    });
    setPreview(null);
  };

  const loadMasterPreview = async () => {
    const queueId = preview?._queue_id;
    if (!queueId || !selectedCompany?.guid) return;
    setMasterBusy(true);
    setMasterPreview('');
    try {
      const res = await api.fetchMasterPreview(queueId, selectedCompany.guid);
      setMasterPreview(JSON.stringify(res?.data || res, null, 2));
    } catch (e) {
      setMasterPreview(e?.message || lt('Master preview failed'));
    } finally {
      setMasterBusy(false);
    }
  };

  const previewPayload = preview ? atParse(preview._payload) : null;

  return (
    <ModuleView title="My Entries" sub="Vouchers created from this portal and synced to Tally" testid="my-entries-view">
      <StatGrid items={[
        { label: 'Entries', value: live.rows.length, sub: 'Written via portal', tone: '#181818' },
        { label: 'Synced', value: live.rows.filter(a => a._sync === 'synced').length, sub: 'Confirmed in Tally', tone: '#447B4B' },
        { label: 'Pending', value: live.rows.filter(a => a._sync === 'pending' || a._sync === 'processing').length, sub: 'Awaiting agent', tone: '#BB7836' },
        { label: 'Failed', value: live.rows.filter(a => a._sync === 'failed').length, sub: 'Needs retry', tone: '#B14435' },
      ]} />
      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2" data-testid="audit-filters">
          <select
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)} data-testid="audit-type-filter"
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-line-strong"
          >
            {typeOptions.map(t => <option key={t} value={t}>{t === 'all' ? lt('All voucher types') : lt(t)}</option>)}
          </select>
          <span className="mx-1 h-5 w-px bg-line" />
          {AT_LIFECYCLE.map(([val, label]) => (
            <button
              key={val} type="button" data-testid={`audit-chip-${val}`}
              onClick={() => setLifecycle(val)}
              className={`h-[26px] rounded-full border px-3 text-[11.5px] font-medium transition-colors ${
                lifecycle === val ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-soft hover:border-line-strong'
              }`}
            >
              {lt(label)}
            </button>
          ))}
        </div>
      </Panel>
      <Result {...live} rows={rows} retry={live.refresh}
        empty={live.rows.length ? 'No entries match the selected filters' : 'No audit entries found'}>
        <DataTable testid="audit-trail-table" rows={rows} onRowClick={setPreview} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date || r.created_at) },
          { key: '_type', label: 'Voucher type', render: r => lt(r._type) },
          { key: '_ref', label: 'Ref / No.', render: r => <span className="font-mono text-[12px]">{r._ref}</span> },
          { key: 'party_name', label: 'Party' },
          { key: 'amount', label: 'Amount', align: 'right', render: r => (r.amount != null && r.amount !== '' ? money(r.amount) : '—') },
          { key: 'lifecycle', label: 'Lifecycle', sortable: false, render: r => <AuditLifecycleBadges r={r} /> },
          { key: 'action', label: '', sortable: false, align: 'right', render: r => (
            <span className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
              {canConvert(r) && (
                <Button data-testid={`audit-convert-${r._queue_id || r.id}`} onClick={() => convert(r)}>{lt('Convert')}</Button>
              )}
              {/failed|offline/i.test(r._queue_status || '') && (
                <Button data-testid={`retry-${r._queue_id || r.id}`} onClick={() => retry(r)}>{lt('Retry')}</Button>
              )}
            </span>
          ) },
        ]} />
      </Result>
      {preview && (
        <RecordDrawer
          record={preview}
          onClose={() => { setPreview(null); setMasterPreview(''); }}
          title={preview._ref !== '—' ? preview._ref : lt(preview._type)}
          sub={`${lt(preview._type)} · ${date(preview.date || preview.created_at)}`}
          actions={preview._isMaster && preview._queue_id ? (
            <Button data-testid="audit-master-preview" disabled={masterBusy} onClick={loadMasterPreview}>
              {masterBusy ? lt('Loading…') : lt('Master preview')}
            </Button>
          ) : null}
          fields={[
            ['Party', preview.party_name],
            ['Voucher type', preview._type],
            ['Date', date(preview.date || preview.created_at), true],
            ['Amount', preview.amount != null && preview.amount !== '' ? money(preview.amount) : '—', true],
            ['TDK reference', preview.tdk_reference_no || '—', true],
            ['Tally voucher no.', preview.av_tally_voucher_no || preview.voucher_number || '—', true],
            ['Sync status', preview._sync],
            ['Entry state', preview._isMaster ? lt('Master') : lt(preview.current_entry_type || '—')],
            ['Conversion', preview.conversion_status || '—'],
            ['E-invoice (IRN)', preview.e_invoice_status || 'not_applicable'],
            ['E-way bill', preview.e_way_bill_status || 'not_applicable'],
            ...(preview._queue_error ? [['Last error', preview._queue_error]] : []),
            ...((previewPayload?.items || []).length
              ? [['Items', previewPayload.items.map(it => `${it.name || it.item_name} × ${it.qty} @ ${it.rate}`).join('; ')]]
              : []),
            ...(previewPayload?.narration ? [['Narration', previewPayload.narration]] : []),
            ...(masterPreview ? [['Master preview', masterPreview]] : []),
          ]}
        />
      )}
    </ModuleView>
  );
}