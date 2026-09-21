import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { StatGrid, Panel, DataTable, Pill, Tabs, ModuleView, useDrawerParam, Empty, Skeleton, Button, useLabelT } from '../components/kit';
import { resolvePeriodDates } from '../utils/periodDates';
import { useFmt, VoucherDrawer, PartyPanel } from './shared';

const number = value => Number(value || 0);
const dataOf = res => res?.data ?? res?.result ?? res ?? {};

function useCompanyRequest(request) {
  const { selectedCompany, selectedFY, syncVersion } = useAuth();
  const companyGuid = selectedCompany?.guid || selectedCompany?.id;
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const requestSeq = useRef(0);
  const load = useCallback(() => {
    const stamp = api.workspaceStamp();
    if (!companyGuid) {
      setState({ data: null, loading: false, error: 'Select a company to view this report.' });
      return;
    }
    const seq = ++requestSeq.current;
    setState({ data: null, loading: true, error: '' });
    Promise.resolve(request(companyGuid, selectedFY))
      .then(res => {
        if (seq !== requestSeq.current || !api.isWorkspaceCurrent(stamp)) return;
        setState({ data: dataOf(res), loading: false, error: '' });
      })
      .catch(err => {
        if (seq !== requestSeq.current || !api.isWorkspaceCurrent(stamp)) return;
        setState({ data: null, loading: false, error: err.message || 'Unable to load report.' });
      });
  }, [companyGuid, selectedFY?.uniqueId, request]);
  useEffect(load, [load, syncVersion]);
  return { ...state, retry: load };
}

function dates(fy) {
  return {
    from: fy?.startDate || fy?.begin_date,
    to: fy?.endDate || fy?.end_date,
  };
}

function body(companyGuid, fy) {
  return { companyGuid, ...api.companyFYParams(fy) };
}

function LoadError({ message, retry }) {
  const lt = useLabelT();
  return <Panel><Empty message="Could not load data" hint={message} /><div className="pb-5 text-center"><Button onClick={retry}>{lt('Retry')}</Button></div></Panel>;
}

export function CashBank() {
  const { money, mc, date } = useFmt();
  const [tab, setTab] = useState('Accounts');
  const [voucher, setVoucher] = useState(null);
  const request = useCallback((guid, fy) => api.fetchCashBank(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const accounts = (data?.bankAccounts || []).map((r, i) => ({ id: r.guid || i, ...r, balance: number(r.balance ?? r.closing_balance) }));
  const txns = (data?.transactions || []).map((r, i) => ({
    id: r.guid || i, ...r, voucher_number: r.voucher_number || r.ref,
    party_name: r.party_name || r.description, amount: number(r.amount),
  }));
  const summary = data?.summary || {};
  if (error) return <ModuleView title="Cash & Bank" sub="Balances and movement across accounts" testid="cash-bank-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Cash & Bank" sub="Balances and movement across accounts" testid="cash-bank-view">
      <StatGrid items={[
        { label: 'Bank balance', value: mc(number(summary.bankBalance)), sub: `${accounts.length} accounts`, tone: '#3963E4' },
        { label: 'Receipts', value: mc(number(summary.totalReceipts)), sub: 'Selected FY', tone: '#447B4B' },
        { label: 'Payments', value: mc(number(summary.totalPayments)), sub: 'Selected FY', tone: '#B14435' },
        { label: 'Net movement', value: mc(number(summary.netCash)), sub: 'Receipts less payments', tone: '#181818' },
      ]} />
      <Tabs tabs={['Accounts', 'Transactions']} value={tab} onChange={setTab} testid="cash-bank-tabs" />
      {tab === 'Accounts' ? (
        <DataTable testid="bank-accounts-table" rows={accounts} loading={loading} emptyMessage="No bank accounts found" columns={[
          { key: 'name', label: 'Account', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'type', label: 'Balance type' },
          { key: 'balance', label: 'Balance', align: 'right', render: r => <span className={r.balance < 0 ? 'text-neg font-medium' : 'font-medium'}>{money(r.balance)}</span> },
        ]} />
      ) : (
        <DataTable testid="bank-transactions-table" rows={txns} loading={loading} pageSize={14} onRowClick={setVoucher} emptyMessage="No cash or bank transactions found" columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) },
          { key: 'voucher_number', label: 'Voucher' },
          { key: 'voucher_type', label: 'Type', render: r => <Pill tone={r.voucher_type === 'Receipt' ? 'pos' : r.voucher_type === 'Payment' ? 'neg' : 'note'}>{r.voucher_type}</Pill> },
          { key: 'party_name', label: 'Particulars' },
          { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
        ]} />
      )}
      <VoucherDrawer voucher={voucher} onClose={() => setVoucher(null)} />
    </ModuleView>
  );
}

export function ReceivablesPayables() {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const [tab, setTab] = useState('Receivables');
  const [party, setParty] = useDrawerParam('party');
  const request = useCallback((guid, fy) => api.fetchReceivablesPayables(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const isRec = tab === 'Receivables';
  // Aging buckets + trend from the KPI endpoint (mobile parity)
  const kpiRequest = useCallback((guid, fy) => api.fetchKpiDetail(isRec ? 'receivables' : 'payables', { companyGuid: guid, ...dates(fy) }), [isRec]);
  const kpi = useCompanyRequest(kpiRequest);
  const aging = kpi.data?.aging || [];
  const trendPct = kpi.data?.trend_pct;
  const rows = (isRec ? (data?.receivables || []) : (data?.payables || [])).map((r, i) => ({
    id: r.guid || r.id || `party-${i}`,
    drawer_id: r.guid || r.name || r.id,
    ...r,
    outstanding: number(r.outstanding ?? r.total_amount),
    invoice_count: number(r.invoice_count),
  }));
  if (error) return <ModuleView title="Receivables & Payables" sub="Customer and supplier balances" testid="receivables-payables-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Receivables & Payables" sub="Customer and supplier balances" testid="receivables-payables-view">
      <Tabs tabs={['Receivables', 'Payables']} value={tab} onChange={setTab} testid="rp-tabs" />
      <StatGrid cols={3} items={[
        { label: `Total ${tab.toLowerCase()}`, value: mc(rows.reduce((s, r) => s + r.outstanding, 0)), sub: `${rows.length} parties`, tone: isRec ? '#447B4B' : '#B14435', delta: trendPct == null ? null : Math.round(trendPct * 10) / 10, deltaInvert: !isRec },
        { label: 'Invoices', value: rows.reduce((s, r) => s + r.invoice_count, 0), sub: 'In selected FY', tone: '#3963E4' },
        { label: 'Net receivable', value: mc(number(data?.summary?.net)), sub: 'Receivables less payables', tone: '#181818' },
      ]} />
      {aging.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="rp-aging-strip">
          {aging.map(b => (
            <div key={b.bucket} className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] text-ink-soft">{lt(b.label)}</p>
              <p className="mt-1 text-[15px] font-semibold tabular text-ink">{money(number(b.amount))}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
                {b.count} {lt('bills')}
                {b.trend != null && <span className={`font-semibold ${b.trend > 0 ? 'text-neg' : 'text-pos'}`}>{b.trend > 0 ? '▲' : '▼'} {Math.abs(Math.round(b.trend))}%</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      <DataTable testid="rp-table" rows={rows} loading={loading} emptyMessage={`No ${tab.toLowerCase()} found`} onRowClick={r => r.drawer_id && setParty(r.drawer_id)} columns={[
        { key: 'name', label: isRec ? 'Customer' : 'Supplier', render: r => <span className="font-medium">{r.name}</span> },
        { key: 'invoice_count', label: 'Invoices', align: 'right' },
        { key: 'last_date', label: 'Last invoice', render: r => r.last_date ? date(r.last_date) : '—' },
        { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => <span className="font-semibold">{money(r.outstanding)}</span> },
      ]} footer={f => `${lt('Total')} ${money(f.reduce((s, r) => s + r.outstanding, 0))}`} />
      {party && <PartyPanel id={party} onClose={() => setParty(null)} />}
    </ModuleView>
  );
}

const loadLoansODs = companyGuid => api.fetchKpiDetail('loans-ods', { companyGuid });

export function LoansODs() {
  const { money, mc } = useFmt();
  const lt = useLabelT();
  const { data, loading, error, retry } = useCompanyRequest(loadLoansODs);
  const d = dataOf(data);
  const facilities = (d.all || d.facilities || d.loans || []).map((l, i) => ({
    id: l.guid || l.name || i,
    ...l,
    balance: number(l.balance ?? l.outstanding?.value ?? l.outstanding ?? l.amount),
  }));
  const isOd = r => /od|overdraft|cash credit/i.test(`${r.kind || ''} ${r.parent || ''} ${r.name || ''}`);
  const trend = v => (v == null ? null : Math.round(v * 10) / 10);
  if (loading) return <ModuleView title="Loans & ODs" sub="Borrowing facilities and outstanding balances" testid="loans-view"><Panel><Skeleton rows={5} /></Panel></ModuleView>;
  if (error) return (
    <ModuleView title="Loans & ODs" sub="Borrowing facilities and outstanding balances" testid="loans-view">
      <Panel><Empty message="Could not load loan facilities" hint={error} /><div className="-mt-8 mb-8 flex justify-center"><Button onClick={retry}>{lt('Retry')}</Button></div></Panel>
    </ModuleView>
  );
  return (
    <ModuleView title="Loans & ODs" sub="Borrowing facilities and outstanding balances" testid="loans-view">
      <StatGrid items={[
        { label: 'Total borrowings', value: mc(number(d.total)), sub: 'vs previous period', tone: '#B14435', delta: trend(d.trend_pct), deltaInvert: true },
        { label: 'Term loans', value: mc(number(d.loan_total)), sub: 'vs previous period', tone: '#BB7836', delta: trend(d.loan_trend_pct), deltaInvert: true },
        { label: 'Overdrafts', value: mc(number(d.od_total)), sub: 'vs previous period', tone: '#3963E4', delta: trend(d.od_trend_pct), deltaInvert: true },
        { label: 'Facilities', value: String(facilities.length), sub: 'Loan & OD ledgers', tone: '#181818' },
      ]} />
      {facilities.length ? (
        <Panel title="Facilities" sub="Loan and overdraft ledgers from Tally">
          <DataTable testid="loans-table" rows={facilities} columns={[
            { key: 'name', label: 'Ledger' },
            { key: 'parent', label: 'Group', render: r => r.parent || '—' },
            { key: 'kind', label: 'Type', render: r => <Pill tone={isOd(r) ? 'note' : 'warn'}>{lt(isOd(r) ? 'Overdraft' : 'Loan')}</Pill> },
            { key: 'balance', label: 'Outstanding', align: 'right', render: r => money(number(r.balance)) },
          ]} />
        </Panel>
      ) : (
        <Panel><Empty message="No loan or OD ledgers" hint="No ledgers under Loans, Secured/Unsecured Loans, Bank OD or Overdraft groups were found in this company." /></Panel>
      )}
    </ModuleView>
  );
}

function PlMetricCard({ label, amount, money }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-3 shadow-none">
      <p className="text-[11px] font-medium text-ink-soft">{label}</p>
      <p className="mt-1.5 text-[15px] font-bold leading-tight tabular text-ink">{money(number(amount))}</p>
    </div>
  );
}

/** Mobile reports tab — GET /api/reports/financial */
export function FinancialOverview() {
  const { money, mc } = useFmt();
  const lt = useLabelT();
  const request = useCallback(async (guid, fy) => {
    const range = dates(fy);
    return api.fetchReportsFinancial(guid, { from: range.from, to: range.to });
  }, []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const summary = data?.summary || data || {};
  const cards = [
    { label: 'Revenue', value: summary.revenue ?? summary.sales ?? summary.totalSales },
    { label: 'Expenses', value: summary.expenses ?? summary.totalExpenses },
    { label: 'Gross profit', value: summary.grossProfit ?? summary.gross_profit },
    { label: 'Net profit', value: summary.netProfit ?? summary.net_profit },
    { label: 'Receivables', value: summary.receivables ?? summary.totalReceivables },
    { label: 'Payables', value: summary.payables ?? summary.totalPayables },
  ];
  if (error) return <ModuleView title="Financial overview" sub="Mobile /api/reports/financial" testid="financial-overview-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Financial overview" sub="Same report as the mobile Reports tab" testid="financial-overview-view">
      {loading ? <Panel><Skeleton rows={6} /></Panel> : (
        <StatGrid cols={3} items={cards.map(c => ({
          label: c.label,
          value: mc(number(c.value)),
          sub: lt('Selected FY'),
          tone: '#181818',
        }))} />
      )}
      {!loading && data && (
        <Panel title={lt('Raw report fields')} sub="Useful when backend adds extra KPI keys">
          <DataTable
            testid="financial-overview-table"
            rows={Object.entries(summary).filter(([, v]) => typeof v === 'number' || typeof v === 'string').map(([k, v], i) => ({ id: i, key: k, value: v }))}
            columns={[
              { key: 'key', label: 'Field' },
              { key: 'value', label: 'Value', align: 'right', render: r => (typeof r.value === 'number' ? money(r.value) : String(r.value)) },
            ]}
            emptyMessage="No numeric fields returned"
          />
        </Panel>
      )}
    </ModuleView>
  );
}

export function ProfitLoss() {
  const { money } = useFmt();
  const request = useCallback((guid, fy) => api.fetchReportsPL(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const pl = data?.pl || data?.summary || {};
  const rows = [
    { left: 'Opening Stock', leftAmt: pl.openingStock, right: 'Closing Stock', rightAmt: pl.closingStock },
    { left: 'Purchase', leftAmt: pl.purchase, right: 'Sales', rightAmt: pl.sales },
    { left: 'Direct Expense', leftAmt: pl.directExpenses, right: 'Indirect Expense', rightAmt: pl.indirectExpenses },
    { left: 'Indirect Income', leftAmt: pl.indirectIncome, right: 'Direct Income', rightAmt: pl.directIncome },
    { left: 'Gross Profit', leftAmt: pl.grossProfit, right: 'Gross Loss', rightAmt: pl.grossLoss },
    { left: 'Net Profit', leftAmt: pl.netProfit, right: 'Net Loss', rightAmt: pl.netLoss },
  ];
  if (error) return <ModuleView title="Profit & Loss" sub="Trading and P&amp;L account for the selected financial year" testid="profit-loss-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Profit & Loss" sub="Trading and P&amp;L account for the selected financial year" testid="profit-loss-view">
      {loading ? <Panel><Skeleton rows={8} /></Panel> : !data ? (
        <Panel><Empty message="No P&amp;L data" hint="Sync Tally data for the selected financial year." /></Panel>
      ) : (
        <div className="space-y-2" data-testid="pl-card-grid">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PlMetricCard label={row.left} amount={row.leftAmt} money={money} />
              <PlMetricCard label={row.right} amount={row.rightAmt} money={money} />
            </div>
          ))}
        </div>
      )}
    </ModuleView>
  );
}

export function BalanceSheet() {
  const { money } = useFmt();
  const lt = useLabelT();
  const [tab, setTab] = useState('Liability');
  const request = useCallback((guid, fy) => api.fetchReportsBS(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const liabilities = (data?.liabilities || []).map(r => ({
    name: r.name,
    opening: Math.abs(number(r.opening)),
    current: Math.abs(number(r.amount)),
  }));
  const assets = (data?.assets || []).map(r => ({
    name: r.name,
    amount: Math.abs(number(r.amount)),
  }));
  const totalLiab = Math.abs(number(data?.summary?.totalLiabilities));
  const totalAssets = Math.abs(number(data?.summary?.totalAssets));
  if (error) return <ModuleView title="Balance Sheet" sub="Assets and liabilities for the selected financial year" testid="balance-sheet-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Balance Sheet" sub="Assets and liabilities for the selected financial year" testid="balance-sheet-view">
      <Tabs tabs={['Liability', 'Assets']} value={tab} onChange={setTab} testid="bs-tabs" />
      <Panel>
        {loading ? <Skeleton rows={8} /> : tab === 'Liability' ? (
          <DataTable testid="bs-liabilities-table" rows={liabilities} emptyMessage="No liability balances" columns={[
            { key: 'name', label: 'Particular' },
            { key: 'opening', label: 'Opening', align: 'right', render: r => r.opening ? money(r.opening) : '—' },
            { key: 'current', label: 'Current', align: 'right', render: r => money(r.current) },
          ]} footer={() => `${lt('Total Liabilities')} ${money(totalLiab)}`} />
        ) : (
          <DataTable testid="bs-assets-table" rows={assets} emptyMessage="No asset balances" columns={[
            { key: 'name', label: 'Asset' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
          ]} footer={() => `${lt('Total Assets')} ${money(totalAssets)}`} />
        )}
      </Panel>
    </ModuleView>
  );
}

export function TrialBalance() {
  const { money } = useFmt();
  const lt = useLabelT();
  const request = useCallback((guid, fy) => api.fetchReportsTB(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const raw = Array.isArray(data) ? data : data?.rows || data?.ledgers || [];
  const rows = raw.map((r, i) => ({
    id: r.name || i,
    name: r.name,
    debit: number(r.debit),
    credit: number(r.credit),
  }));
  const totalDebit = number(data?.totalDebit) || rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = number(data?.totalCredit) || rows.reduce((s, r) => s + r.credit, 0);
  const amt = (v, tag) => (v > 0.01 ? <span className="tabular">{money(v)} <span className={tag === 'Dr' ? 'text-pos' : 'text-neg'}>{tag}</span></span> : null);
  if (error) return <ModuleView title="Trial Balance" sub="Group-wise debit and credit totals" testid="trial-balance-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Trial Balance" sub="Group-wise debit and credit totals" testid="trial-balance-view">
      <Panel>
        {loading ? <Skeleton rows={8} /> : !rows.length ? (
          <Empty message="No trial balance rows found" hint="Sync Tally data for the selected financial year." />
        ) : (
          <div className="divide-y divide-line-subtle rounded-lg border border-line overflow-hidden" data-testid="trial-balance-table">
            {rows.map((r, i) => (
              <div key={r.id || i} className={`flex items-start justify-between gap-4 px-4 py-3 ${i % 2 ? 'bg-cream/30' : 'bg-surface'}`}>
                <span className="text-[13px] font-medium text-ink">{r.name}</span>
                <div className="flex flex-col items-end gap-0.5 text-[13px]">
                  {amt(r.debit, 'Dr')}
                  {amt(r.credit, 'Cr')}
                  {r.debit <= 0.01 && r.credit <= 0.01 && <span className="text-ink-faint">—</span>}
                </div>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4 bg-cream px-4 py-3 font-bold">
              <span className="text-[13px] text-ink">{lt('Grand Total')}</span>
              <div className="flex flex-col items-end gap-0.5 text-[13px] tabular text-ink">
                {amt(totalDebit, 'Dr')}
                {amt(totalCredit, 'Cr')}
              </div>
            </div>
            {Math.abs(totalDebit - totalCredit) >= 1 && (
              <div className="bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
                {lt('Difference')}: {money(Math.abs(totalDebit - totalCredit))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </ModuleView>
  );
}

export function CashRegister() {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | inflow | outflow
  const [voucher, setVoucher] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  const mapRow = (r) => {
    const vt = String(r.voucher_type || '').toLowerCase();
    const positive = vt.includes('receipt');
    const type = vt.includes('payment') ? 'payment' : vt.includes('receipt') ? 'receipt' : 'contra';
    return {
      id: r.guid || r.id,
      guid: r.guid,
      voucher_number: r.voucher_number || '',
      party_name: r.narration || r.party_name || '',
      date: r.date || '',
      amount: Math.abs(Number(r.amount) || 0),
      positive,
      type,
      voucher_type: r.voucher_type || '',
    };
  };

  const isCashType = (r) => ['Payment', 'Receipt', 'Contra'].some(t =>
    String(r.voucher_type || '').toLowerCase().includes(t.toLowerCase())
  );

  const load = useCallback(() => {
    const guid = selectedCompany?.guid;
    if (!guid) {
      setRows([]);
      setLoading(false);
      setError('Select a company to view cash register.');
      return;
    }
    setLoading(true);
    setError('');
    setPage(1);
    api.fetchVouchers({
      companyGuid: guid,
      from: selectedFY?.startDate,
      to: selectedFY?.endDate,
      fromDate: selectedFY?.startDate,
      toDate: selectedFY?.endDate,
      page: 1,
      limit: PAGE_SIZE,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        const list = api.unwrapList(res).filter(isCashType).map(mapRow);
        setRows(list);
        setHasMore(api.unwrapList(res).length === PAGE_SIZE);
      })
      .catch((e) => {
        setRows([]);
        setError(e?.message || 'Failed to load cash register');
      })
      .finally(() => setLoading(false));
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);

  useEffect(() => { load(); }, [load]);

  const loadMore = () => {
    const guid = selectedCompany?.guid;
    if (!guid || loadingMore || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    api.fetchVouchers({
      companyGuid: guid,
      from: selectedFY?.startDate,
      to: selectedFY?.endDate,
      fromDate: selectedFY?.startDate,
      toDate: selectedFY?.endDate,
      page: next,
      limit: PAGE_SIZE,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        const raw = api.unwrapList(res);
        const list = raw.filter(isCashType).map(mapRow);
        setRows((prev) => [...prev, ...list]);
        setHasMore(raw.length === PAGE_SIZE);
        setPage(next);
      })
      .finally(() => setLoadingMore(false));
  };

  const filtered = rows.filter((r) => {
    const matchType = typeFilter === 'all' ? true : typeFilter === 'inflow' ? r.positive : !r.positive;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || r.party_name.toLowerCase().includes(q)
      || r.voucher_number.toLowerCase().includes(q)
      || r.voucher_type.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const inflowTotal = filtered.filter(r => r.positive).reduce((s, r) => s + r.amount, 0);
  const outflowTotal = filtered.filter(r => !r.positive).reduce((s, r) => s + r.amount, 0);

  // Group by month like mobile
  const monthMap = {};
  filtered.forEach((item) => {
    const d = item.date;
    let key = 'other';
    let label = 'Other';
    if (d && d.includes('-') && d.length >= 7) {
      const [y, m] = d.split('-');
      key = `${y}-${m}`;
      label = new Date(+y, +m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    }
    if (!monthMap[key]) monthMap[key] = { id: key, label, items: [] };
    monthMap[key].items.push(item);
  });
  const groups = Object.values(monthMap).sort((a, b) => b.id.localeCompare(a.id));

  if (error && !rows.length) {
    return (
      <ModuleView title="Cash Register" sub="Payment, receipt and contra vouchers" testid="cash-register-view">
        <LoadError message={error} retry={load} />
      </ModuleView>
    );
  }

  return (
    <ModuleView title="Cash Register" sub="Payment, receipt and contra vouchers — same as mobile cash register" testid="cash-register-view">
      <StatGrid items={[
        { label: 'Inflow', value: mc(inflowTotal), sub: 'Receipts', tone: '#447B4B' },
        { label: 'Outflow', value: mc(outflowTotal), sub: 'Payments', tone: '#B14435' },
        { label: 'Net', value: mc(inflowTotal - outflowTotal), sub: 'Movement', tone: '#181818' },
        { label: 'Entries', value: String(filtered.length), sub: selectedFY?.name || 'Selected FY', tone: '#3963E4' },
      ]} />

      <div className="flex flex-wrap items-center gap-2" data-testid="cash-register-filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lt('Search transactions…')}
          data-testid="cash-register-search"
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-ink"
        />
        {['all', 'inflow', 'outflow'].map((f) => (
          <Button
            key={f}
            variant={typeFilter === f ? 'primary' : 'ghost'}
            data-testid={`cash-register-filter-${f}`}
            onClick={() => setTypeFilter(f)}
          >
            {lt(f === 'all' ? 'All' : f === 'inflow' ? 'Inflow' : 'Outflow')}
          </Button>
        ))}
      </div>

      {loading ? <Skeleton rows={6} /> : groups.length === 0 ? (
        <Empty message="No cash register vouchers" hint="Payment, receipt and contra entries for this FY will appear here." />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Panel key={g.id} title={g.label} testid={`cash-register-month-${g.id}`}>
              <DataTable
                testid={`cash-register-table-${g.id}`}
                rows={g.items}
                pageSize={40}
                onRowClick={(r) => setVoucher(r)}
                columns={[
                  { key: 'date', label: 'Date', render: (r) => date(r.date) },
                  { key: 'voucher_number', label: 'Voucher' },
                  { key: 'voucher_type', label: 'Type', render: (r) => (
                    <Pill tone={r.positive ? 'pos' : r.type === 'payment' ? 'neg' : 'note'}>{lt(r.voucher_type)}</Pill>
                  ) },
                  { key: 'party_name', label: 'Particulars' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => (
                    <span className={r.positive ? 'text-pos font-medium' : 'text-neg font-medium'}>
                      {r.positive ? '+' : '-'}{money(r.amount)}
                    </span>
                  ) },
                ]}
              />
            </Panel>
          ))}
          {hasMore && (
            <div className="text-center">
              <Button onClick={loadMore} disabled={loadingMore} data-testid="cash-register-load-more">
                {loadingMore ? lt('Loading…') : lt('Load more')}
              </Button>
            </div>
          )}
        </div>
      )}
      <VoucherDrawer voucher={voucher} onClose={() => setVoucher(null)} />
    </ModuleView>
  );
}

export function CashFlow() {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const { selectedFY } = useAuth();
  const [period, setPeriod] = useState('1M'); // '7D' | '1M' | '3M' | 'FY' | 'custom'
  const [range, setRange] = useState(() => resolvePeriodDates('1M', null));
  useEffect(() => {
    if (period === 'custom') return;
    if (period === 'FY') {
      const fyRange = dates(selectedFY);
      setRange(r => ({ from: fyRange.from || r.from, to: fyRange.to || r.to }));
      return;
    }
    setRange(resolvePeriodDates(period === '7D' ? '7D' : period === '1M' ? '1M' : '3M', {
      from: selectedFY?.startDate || selectedFY?.begin_date,
      to: selectedFY?.endDate || selectedFY?.end_date,
    }));
  }, [period, selectedFY]);
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= '1900-01-01';
  const from = validDate(range.from) ? range.from : '';
  const to = validDate(range.to) ? range.to : '';
  const request = useCallback((guid) => {
    const code = period === 'custom' || period === 'FY' ? '1M' : period;
    return api.fetchCashflow(guid, code, from, to);
  }, [from, to, period]);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const income = number(data?.totalIncome);
  const expense = number(data?.totalExpense);
  const netCash = number(data?.netCash);
  const interval = data?.interval || 'day';
  const weekly = interval === 'week';
  const monthly = interval === 'month';
  const seriesRows = (data?.series || []).map((r, i) => ({
    id: r.date || i, date: r.date, inflow: number(r.inflow), outflow: number(r.outflow), net: number(r.net),
  }));
  const rows = seriesRows.length
    ? seriesRows
    : (income || expense)
      ? [{ id: 'period', date: from, inflow: income, outflow: expense, net: income - expense }]
      : [];
  const setCustom = patch => { setPeriod('custom'); setRange(r => ({ ...r, ...patch })); };
  const controls = (
    <div className="flex flex-wrap items-center gap-2" data-testid="cashflow-range">
      {['7D', '1M', '3M', 'FY'].map(p => (
        <Button key={p} variant={period === p ? 'primary' : 'ghost'} onClick={() => setPeriod(p)} data-testid={`cashflow-period-${p}`}>{lt(p)}</Button>
      ))}
      <label className="flex items-center gap-1 text-sm text-muted">{lt('From')}
        <input type="date" className="rounded border border-line bg-transparent px-2 py-1 text-sm" value={range.from || ''} max={range.to || undefined} onChange={e => setCustom({ from: e.target.value })} data-testid="cashflow-from" />
      </label>
      <label className="flex items-center gap-1 text-sm text-muted">{lt('To')}
        <input type="date" className="rounded border border-line bg-transparent px-2 py-1 text-sm" value={range.to || ''} min={range.from || undefined} onChange={e => setCustom({ to: e.target.value })} data-testid="cashflow-to" />
      </label>
    </div>
  );
  if (error) return <ModuleView title="Cash Flow" sub="Inflow and outflow trends over time" testid="cashflow-view"><LoadError message={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Cash Flow" sub="Inflow and outflow trends over time" testid="cashflow-view">
      {controls}
      <StatGrid items={[
        { label: 'Cash & Bank Balance', value: mc(netCash), sub: 'Cash + bank balances', tone: '#181818' },
        { label: 'Income', value: mc(income), sub: 'Receipts this period', tone: '#447B4B' },
        { label: 'Expense', value: mc(expense), sub: 'Payments this period', tone: '#B14435' },
        { label: 'Net movement', value: mc(income - expense), sub: 'Receipts less payments', tone: '#3963E4' },
      ]} />
      <StatGrid items={[
        { label: 'Sales', value: mc(number(data?.sales)), sub: 'This period', tone: '#181818' },
        { label: 'Gross profit', value: mc(number(data?.grossProfit)), sub: 'Sales less purchases & direct costs', tone: '#447B4B' },
        { label: 'Net profit', value: mc(number(data?.netProfit)), sub: 'After indirect income & expenses', tone: '#3963E4' },
        { label: 'Gross profit vs sales', value: `${number(data?.grossProfitVsSalesPct)}%`, sub: 'Margin', tone: '#BB7836' },
      ]} />
      <Panel title={`Cash flow trend (${monthly ? 'monthly' : weekly ? 'weekly' : 'daily'})`}>
        {loading ? <Skeleton rows={5} /> : rows.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={v => date(v)} minTickGap={24} />
              <YAxis tickFormatter={v => mc(v)} width={62} />
              <Tooltip labelFormatter={v => (weekly ? `${lt('Week of')} ` : monthly ? `${lt('Month of')} ` : '') + date(v)} formatter={v => money(v)} />
              <Bar dataKey="inflow" name={lt('Inflow')} fill="#447B4B" maxBarSize={16} />
              <Bar dataKey="outflow" name={lt('Outflow')} fill="#B14435" maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty message="No cash flow activity in this range" />}
      </Panel>
      <DataTable testid="cashflow-table" rows={rows} loading={loading} pageSize={14} emptyMessage="No cash flow activity in this range" columns={[
        { key: 'date', label: monthly ? 'Month' : weekly ? 'Week starting' : 'Date', render: r => date(r.date) },
        { key: 'inflow', label: 'Inflow', align: 'right', render: r => money(r.inflow) },
        { key: 'outflow', label: 'Outflow', align: 'right', render: r => money(r.outflow) },
        { key: 'net', label: 'Net', align: 'right', render: r => <span className={r.net < 0 ? 'text-neg' : 'text-pos'}>{money(r.net)}</span> },
      ]} footer={f => `${lt('Net')} ${money(f.reduce((s, r) => s + r.net, 0))}`} />
    </ModuleView>
  );
}

export function FinancialsKpis() {
  const { mc } = useFmt();
  const request = useCallback((guid, fy) => api.fetchReportsPL(body(guid, fy)), []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  if (loading) return <Skeleton rows={3} />;
  if (error) return <LoadError message={error} retry={retry} />;
  const summary = data?.summary || data?.pl || {};
  const turnover = number(summary.totalIncome ?? summary.sales);
  const grossResult = number(summary.grossProfit) || -number(summary.grossLoss);
  const netResult = number(summary.netProfit) || -number(summary.netLoss);
  const expenses = number(summary.totalExpenses) || number(summary.directExpenses) + number(summary.indirectExpenses) + number(summary.purchase);
  return (
    <StatGrid items={[
      { label: 'Turnover', value: mc(turnover), sub: 'This FY', tone: '#447B4B' },
      { label: 'Gross profit', value: mc(grossResult), sub: 'Trading result', tone: '#3963E4' },
      { label: 'Total expenses', value: mc(expenses), sub: 'All heads', tone: '#B14435' },
      { label: 'Net profit', value: mc(netResult), sub: 'Bottom line', tone: '#181818' },
    ]} />
  );
}

export function SalesPurchaseChart() {
  const { money, mc } = useFmt();
  const lt = useLabelT();
  const request = useCallback((guid, fy) => {
    const range = dates(fy);
    return api.fetchDashboardChart(guid, 'FY', range.from, range.to);
  }, []);
  const { data, loading, error, retry } = useCompanyRequest(request);
  const rows = (data?.series || []).map(r => ({
    month: r.label || r.date,
    sales: number(r.sales),
    purchase: number(r.purchase),
  }));
  return (
    <Panel title="Monthly sales vs purchase">
      {loading ? <Skeleton rows={6} /> : error ? <><Empty message="Could not load chart" hint={error} /><div className="pb-4 text-center"><Button onClick={retry}>{lt('Retry')}</Button></div></> : !rows.length ? <Empty message="No monthly sales or purchase data" /> : (
        <ResponsiveContainer width="100%" height={240}><BarChart data={rows} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={v => mc(v)} width={62} /><Tooltip formatter={v => money(v)} /><Bar dataKey="sales" name={lt('Sales')} fill="#181818" maxBarSize={16} /><Bar dataKey="purchase" name={lt('Purchase')} fill="#BB7836" maxBarSize={16} /></BarChart></ResponsiveContainer>
      )}
    </Panel>
  );
}