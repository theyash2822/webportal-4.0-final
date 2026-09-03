// KPI drill-downs render as panels over the current page (never a route change).
// Mirrors the mobile KPI detail screens: /api/kpi/* trend payloads, balance charts,
// aging buckets and transaction drill-downs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Drawer, Button, StatGrid, DataTable, Pill, Tabs, Panel, Empty, Toggle, STATUS_TONE, useLabelT } from '../components/kit';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { useFmt, useCompanyMeta, VoucherDrawer } from './shared';

const num = v => Number(v || 0);
const sum = (arr, key = 'amount') => arr.reduce((total, row) => total + num(row[key]), 0);

export const KPI_KEYS = [
  'cash-register', 'receipts', 'payments', 'receivables', 'payables', 'bank-balance', 'cash-in-hand', 'loans-ods',
];

const CONFIG = {
  'cash-register': { title: 'Cash Register', sub: 'Cash inflow and outflow, voucher by voucher' },
  receipts: { title: 'Receipts', sub: 'Money received from customers' },
  payments: { title: 'Payments', sub: 'Money paid to suppliers and expense heads' },
  receivables: { title: 'Receivables', sub: 'Outstanding from customers with ageing' },
  payables: { title: 'Payables', sub: 'Outstanding to suppliers with ageing' },
  'bank-balance': { title: 'Bank Balance', sub: 'Account-wise bank position' },
  'cash-in-hand': { title: 'Cash in Hand', sub: 'Cash ledger movement' },
  'loans-ods': { title: 'Loans & ODs', sub: 'Borrowing facilities and repayment' },
};

// kpi_cards → StatGrid items; trend_pct feeds the Stat delta arrow (same as mobile badges).
const cardStats = (cards, tones = {}) => (cards || []).map(c => ({
  label: c.label, value: typeof c.amount === 'number' && c.id !== 'count' ? undefined : c.amount,
  raw: c, delta: c.trend_pct == null ? null : Math.round(c.trend_pct * 10) / 10, tone: tones[c.id] || '#181818',
}));

function SeriesChart({ rows, xKey, bars, area, height = 220, fmtMoney, fmtDate, lt }) {
  if (!rows?.length) return <Empty message="No activity in this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {area ? (
        <AreaChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={v => fmtDate(v)} minTickGap={28} />
          <YAxis tickFormatter={v => fmtMoney.mc(v)} width={62} />
          <Tooltip labelFormatter={v => fmtDate(v)} formatter={v => fmtMoney.money(v)} />
          <Area type="monotone" dataKey={area.key} name={lt(area.name)} stroke={area.color} fill={`${area.color}22`} strokeWidth={2} />
        </AreaChart>
      ) : (
        <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={v => fmtDate(v)} minTickGap={28} />
          <YAxis tickFormatter={v => fmtMoney.mc(v)} width={62} />
          <Tooltip labelFormatter={v => fmtDate(v)} formatter={v => fmtMoney.money(v)} />
          {bars.map(b => <Bar key={b.key} dataKey={b.key} name={lt(b.name)} fill={b.color} maxBarSize={14} />)}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function AgingStrip({ aging, money, lt }) {
  if (!aging?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="kpi-aging-strip">
      {aging.map(b => (
        <div key={b.bucket} className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] text-ink-soft">{lt(b.label)}</p>
          <p className="mt-1 text-[15px] font-semibold tabular text-ink">{money(num(b.amount))}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
            {b.count} {lt('bills')}
            {b.trend != null && <span className={`font-semibold ${b.trend > 0 ? 'text-neg' : 'text-pos'}`}>{b.trend > 0 ? '▲' : '▼'} {Math.abs(Math.round(b.trend))}%</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

function mapCash(data) {
  let balance = 0;
  return (data?.transactions || []).map((row, index) => {
    const inflow = num(row.dr);
    const outflow = num(row.cr);
    balance += inflow - outflow;
    return {
      ...row, id: row.id || `${row.ref}-${index}`, voucher_number: row.voucher_number || row.ref,
      particulars: row.particulars || row.description, mode: /contra/i.test(row.voucher_type || '') ? 'Bank' : 'Cash',
      inflow, outflow, balance,
    };
  });
}

export default function KpiPanel({ metric, onClose }) {
  const lt = useLabelT();
  const { money, mc, date } = useFmt();
  const { subtitle } = useCompanyMeta();
  const { selectedCompany, selectedFY } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('FY'); // payments/receipts: '7D' | '30D' | 'FY'
  const [mode, setMode] = useState('All'); // payments/receipts: 'All' | 'Cash' | 'Bank'
  const [overdueOnly, setOverdueOnly] = useState(false); // AR/AP
  const [tab, setTab] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [openBank, setOpenBank] = useState(null);
  const conf = metric ? CONFIG[metric] : null;
  const fmtMoney = { money, mc };

  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    if (!metric || !selectedCompany?.guid) return;
    const seq = ++requestSeq.current; // only the latest request may commit state
    const commit = fn => { if (seq === requestSeq.current) fn(); };
    setLoading(true); setError('');
    const guid = selectedCompany.guid;
    const fyFrom = selectedFY?.startDate || selectedFY?.begin_date;
    const fyTo = selectedFY?.endDate || selectedFY?.end_date;
    try {
      if (metric === 'cash-register') {
        const response = await api.fetchCashBank({ companyGuid: guid, fromDate: fyFrom, toDate: fyTo });
        commit(() => setData({ cashRegister: response?.data || {} }));
      } else if (metric === 'payments' || metric === 'receipts') {
        const params = { companyGuid: guid, period };
        if (period === 'FY') { params.from = fyFrom; params.to = fyTo; }
        else {
          const days = period === '7D' ? 7 : 30;
          const end = new Date(); const start = new Date(); start.setDate(start.getDate() - (days - 1));
          params.from = start.toISOString().slice(0, 10); params.to = end.toISOString().slice(0, 10);
          params.period = period === '7D' ? '7D' : '1M';
        }
        const response = metric === 'payments'
          ? await api.fetchKpiPayments(guid, params)
          : await api.fetchKpiReceipts(guid, params);
        commit(() => setData(response?.data || {}));
      } else if (metric === 'receivables' || metric === 'payables') {
        const response = await api.fetchKpiDetail(metric, { companyGuid: guid, from: fyFrom, to: fyTo, overdue: overdueOnly ? '1' : undefined });
        commit(() => setData(response?.data || {}));
      } else {
        // cash-in-hand, bank-balance, loans-ods
        const response = await api.fetchKpiDetail(metric, { companyGuid: guid, from: fyFrom, to: fyTo });
        commit(() => setData(response?.data || {}));
      }
    } catch (e) {
      commit(() => { setData(null); setError(e.message || lt('Failed to load KPI details')); });
    } finally { commit(() => setLoading(false)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, period, mode, overdueOnly]);

  useEffect(() => { if (conf) load(); }, [conf, load]);
  useEffect(() => { setTab(''); setMode('All'); setPeriod('FY'); setOverdueOnly(false); setOpenBank(null); }, [metric]);
  if (!conf) return null;

  const d = data || {};

  const body = () => {
    if (metric === 'cash-in-hand') {
      const txns = (d.transactions || []).map((r, i) => ({
        ...r, id: r.guid || i, inflow: r.direction === 'in' ? num(r.amount) : 0, outflow: r.direction === 'out' ? num(r.amount) : 0,
      }));
      const daily = (d.daily_balance || []).map(r => ({ ...r, balance: num(r.balance) }));
      return <>
        <StatGrid items={cardStats(d.kpi_cards, { bal: '#181818', in: '#447B4B', out: '#B14435', net: '#3963E4' }).map(s => ({ ...s, value: mc(num(s.raw.amount)), sub: s.delta == null ? ' ' : lt('vs previous period') }))} />
        <Panel title="Daily cash balance" sub={`${lt('Last')} ${d.series_days || 30} ${lt('days')}`}>
          <SeriesChart rows={daily} xKey="day" area={{ key: 'balance', name: 'Balance', color: '#3963E4' }} fmtMoney={fmtMoney} fmtDate={date} lt={lt} />
        </Panel>
        <Panel title="Receipts vs payments" sub="Daily cash movement">
          <SeriesChart rows={daily} xKey="day" bars={[{ key: 'inflow', name: 'Inflow', color: '#447B4B' }, { key: 'outflow', name: 'Outflow', color: '#B14435' }]} fmtMoney={fmtMoney} fmtDate={date} lt={lt} />
        </Panel>
        <DataTable testid="kpi-cash-in-hand-table" rows={txns} pageSize={20} scroll onRowClick={r => r.guid && setVoucher(r)} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) },
          { key: 'voucher_number', label: 'Voucher' },
          { key: 'party_name', label: 'Particulars' },
          { key: 'voucher_type', label: 'Type', render: r => <Pill tone={r.direction === 'in' ? 'pos' : 'neg'}>{lt(r.voucher_type)}</Pill> },
          { key: 'inflow', label: 'Inflow', align: 'right', render: r => r.inflow ? <span className="text-pos">{money(r.inflow)}</span> : '—' },
          { key: 'outflow', label: 'Outflow', align: 'right', render: r => r.outflow ? <span className="text-neg">{money(r.outflow)}</span> : '—' },
        ]} />
      </>;
    }

    if (metric === 'bank-balance') {
      const banks = (d.banks || []).map((b, i) => ({ ...b, id: b.name || i, balance: num(b.balance) }));
      const daily = (d.daily_balance || []).map(r => ({ ...r, balance: num(r.balance) }));
      const open = banks.find(b => b.id === openBank);
      return <>
        <StatGrid items={cardStats(d.kpi_cards, { total: '#3963E4', in: '#447B4B', out: '#B14435', count: '#181818' }).map(s => ({ ...s, value: s.raw.id === 'count' ? String(s.raw.amount) : mc(num(s.raw.amount)), sub: s.delta == null ? ' ' : lt('vs previous period') }))} />
        <Panel title="Daily bank balance" sub={`${lt('Last')} ${d.series_days || 30} ${lt('days')}`}>
          <SeriesChart rows={daily} xKey="day" area={{ key: 'balance', name: 'Balance', color: '#3963E4' }} fmtMoney={fmtMoney} fmtDate={date} lt={lt} />
        </Panel>
        <DataTable testid="kpi-bank-balance-table" rows={banks} onRowClick={r => setOpenBank(openBank === r.id ? null : r.id)} columns={[
          { key: 'name', label: 'Account', render: r => <span className="font-medium">{r.name}</span> },
          { key: 'bank_name', label: 'Bank', render: r => r.bank_name || r.parent || '—' },
          { key: 'account_number', label: 'Account no.', render: r => r.account_number || '—' },
          { key: 'balance', label: 'Balance', align: 'right', render: r => <span className={r.balance < 0 ? 'font-semibold text-neg' : 'font-semibold'}>{money(r.balance)}</span> },
        ]} />
        {open && (
          <Panel title={open.name} sub="Recent transactions">
            <DataTable testid="kpi-bank-txns-table" rows={(open.transactions || []).map((t, i) => ({ ...t, id: t.guid || i }))} pageSize={10} onRowClick={r => r.guid && setVoucher(r)} columns={[
              { key: 'date', label: 'Date', render: r => date(r.date) },
              { key: 'voucher_number', label: 'Voucher' },
              { key: 'voucher_type', label: 'Type', render: r => <Pill tone={r.type === 'Dr' ? 'pos' : 'neg'}>{lt(r.voucher_type)}</Pill> },
              { key: 'party_name', label: 'Party' },
              { key: 'amount', label: 'Amount', align: 'right', render: r => money(num(r.amount)) },
            ]} />
          </Panel>
        )}
      </>;
    }

    if (metric === 'loans-ods') {
      const facilities = (d.facilities || []).map((f, i) => ({ ...f, id: f.guid || f.name || i, balance: num(f.balance ?? f.amount) }));
      return <>
        {/* Borrowings are a liability: an increase is unfavourable → invert delta colors */}
        <StatGrid items={cardStats(d.kpi_cards, { total: '#B14435', loans: '#BB7836', ods: '#3963E4' }).map(s => ({ ...s, deltaInvert: true, value: mc(num(s.raw.amount)), sub: s.delta == null ? ' ' : lt('vs previous period') }))} />
        {facilities.length ? (
          <DataTable testid="kpi-loans-ods-table" rows={facilities} columns={[
            { key: 'name', label: 'Facility', render: r => <span className="font-medium">{r.name}</span> },
            { key: 'parent', label: 'Group', render: r => r.parent || r.lender || '—' },
            { key: 'kind', label: 'Type', render: r => <Pill tone={/od|overdraft|cash credit/i.test(`${r.kind || ''} ${r.parent || ''} ${r.name || ''}`) ? 'note' : 'warn'}>{lt(/od|overdraft|cash credit/i.test(`${r.kind || ''} ${r.parent || ''} ${r.name || ''}`) ? 'Overdraft' : 'Loan')}</Pill> },
            { key: 'balance', label: 'Outstanding', align: 'right', render: r => <span className="font-semibold">{money(r.balance)}</span> },
          ]} />
        ) : <Empty message="No loan or OD facilities" hint="No ledgers under loan or overdraft groups were found in this company." />}
      </>;
    }

    if (metric === 'receivables' || metric === 'payables') {
      const isRec = metric === 'receivables';
      const parties = (d.parties || []).map((p, i) => ({ ...p, id: p.name || i, amount: num(p.amount) }));
      const activity = ((isRec ? d.receipts : d.payments) || []).map((a, i) => ({ ...a, id: a.guid || i, amount: num(a.amount) }));
      // Mirrors mobile "Recent Outstandings"/"Recent Payables": party · ref, date (due||bill), amount
      const bills = (d.bills || []).map((b, i) => ({
        ...b, id: `${b.ref || b.party || ''}-${i}`, amount: Math.abs(num(b.amount)), date: b.date || b.dueDate || b.billDate,
      }));
      const billsLabel = isRec ? 'Recent Outstandings' : 'Recent Payables';
      const tabs = [lt(billsLabel), lt('Parties'), lt(d.activityLabel || (isRec ? 'Receipts' : 'Payments'))];
      const activeTab = tab || tabs[0];
      return <>
        <StatGrid cols={3} items={[
          { label: isRec ? 'Total receivable' : 'Total payable', value: mc(num(d.total)), sub: overdueOnly ? 'Overdue only' : 'All outstanding', tone: isRec ? '#447B4B' : '#B14435', delta: d.trend_pct == null ? null : Math.round(d.trend_pct * 10) / 10, deltaInvert: !isRec },
          { label: 'Open bills', value: mc(num(d.openBillOutstanding)), sub: 'Bill-wise tracked', tone: '#3963E4' },
          { label: 'Parties', value: String(parties.length), sub: 'With balances', tone: '#181818' },
        ]} />
        <AgingStrip aging={d.aging} money={money} lt={lt} />
        <div className="flex items-center justify-between">
          <Tabs tabs={tabs} value={activeTab} onChange={setTab} testid="kpi-arap-tabs" />
          <label className="flex items-center gap-2 text-[12px] text-ink-soft">{lt('Overdue only')}
            <Toggle checked={overdueOnly} onChange={setOverdueOnly} testid="kpi-overdue-toggle" />
          </label>
        </div>
        {activeTab === tabs[0] ? (
          bills.length ? (
            <DataTable testid={`kpi-${metric}-bills-table`} rows={bills} pageSize={20} scroll onRowClick={r => r.voucherGuid && setVoucher({ guid: r.voucherGuid })} columns={[
              { key: 'party', label: 'Party', render: r => <span className="font-medium">{r.party}{r.ref ? <span className="text-ink-faint"> · {r.ref}</span> : null}</span> },
              { key: 'date', label: 'Date', render: r => r.date ? date(r.date) : '—' },
              { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
            ]} />
          ) : <Empty message="No open bills" hint="Bill-wise outstanding appears here once bill references are synced from Tally." />
        ) : activeTab === tabs[1] ? (
          <DataTable testid={`kpi-${metric}-table`} rows={parties} pageSize={20} scroll columns={[
            { key: 'name', label: 'Party', render: r => <span className="font-medium">{r.name}</span> },
            { key: 'openBillCount', label: 'Open bills', align: 'right' },
            { key: 'overdueOutstanding', label: 'Overdue', align: 'right', render: r => num(r.overdueOutstanding) ? <span className="text-neg">{money(num(r.overdueOutstanding))}</span> : '—' },
            { key: 'oldestOverdueDays', label: 'Oldest overdue', align: 'right', render: r => r.oldestOverdueDays ? `${r.oldestOverdueDays} ${lt('days')}` : '—' },
            { key: 'phone', label: 'Contact', render: r => r.phone ? (
              <span className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <a href={`tel:${r.phone}`} className="text-[12px] font-medium text-ink underline decoration-line underline-offset-2">{lt('Call')}</a>
                <a href={`https://wa.me/91${String(r.phone).replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-pos underline decoration-line underline-offset-2">WhatsApp</a>
              </span>
            ) : '—' },
            { key: 'amount', label: 'Outstanding', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
          ]} footer={f => `${lt('Total')} ${money(sum(f))}`} />
        ) : (
          <DataTable testid="kpi-arap-activity-table" rows={activity} pageSize={20} scroll onRowClick={r => r.guid && setVoucher(r)} columns={[
            { key: 'date', label: 'Date', render: r => date(r.date) },
            { key: 'voucher_number', label: 'Voucher' },
            { key: 'party_name', label: 'Party' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
          ]} />
        )}
      </>;
    }

    if (metric === 'payments' || metric === 'receipts') {
      const txns = (d.transactions || []).filter(t => mode === 'All' || t.mode === mode).map((t, i) => ({ ...t, id: t.guid || i, amount: num(t.amount) }));
      const daily = (d.daily_series || []).map(r => ({ ...r, amount: num(r.amount) }));
      const color = metric === 'receipts' ? '#447B4B' : '#B14435';
      return <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5" data-testid="kpi-period-tabs">
            {['7D', '30D', 'FY'].map(p => <Button key={p} variant={period === p ? 'primary' : 'ghost'} onClick={() => setPeriod(p)} data-testid={`kpi-period-${p}`}>{lt(p)}</Button>)}
          </div>
          <Tabs tabs={['All', 'Cash', 'Bank']} value={mode} onChange={setMode} testid="kpi-mode-tabs" />
        </div>
        <StatGrid items={cardStats(d.kpi_cards, { period: color, today: '#181818', cash: '#BB7836', bank: '#3963E4' }).map(s => ({ ...s, value: mc(num(s.raw.amount)), sub: s.delta == null ? ' ' : lt('vs previous period') }))} />
        <Panel title={metric === 'receipts' ? 'Daily receipts' : 'Daily payments'} sub={`${lt('Last')} ${daily.length} ${lt('days')}`}>
          <SeriesChart rows={daily} xKey="day" bars={[{ key: 'amount', name: metric === 'receipts' ? 'Receipts' : 'Payments', color }]} fmtMoney={fmtMoney} fmtDate={date} lt={lt} />
        </Panel>
        <DataTable testid={`kpi-${metric}-table`} rows={txns} pageSize={20} scroll onRowClick={r => r.guid && setVoucher(r)} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) },
          { key: 'voucher_number', label: 'Voucher' },
          { key: 'party_name', label: 'Party' },
          { key: 'mode', label: 'Mode', render: r => <Pill tone={r.mode === 'Cash' ? 'warn' : 'note'}>{lt(r.mode || 'Bank')}</Pill> },
          { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
          { key: 'status', label: 'Status', render: r => {
            const status = r.is_cancelled ? 'Cancelled' : r.status || 'Synced';
            return <Pill tone={STATUS_TONE[status] || 'neutral'}>{lt(status)}</Pill>;
          } },
        ]} />
      </>;
    }

    // cash-register (unchanged legacy view)
    const cr = d.cashRegister || {};
    const rows = mapCash(cr);
    return <>
      <StatGrid items={[
        { label: 'Inflow', value: mc(sum(rows, 'inflow')), sub: 'Receipts', tone: '#447B4B' },
        { label: 'Outflow', value: mc(sum(rows, 'outflow')), sub: 'Payments', tone: '#B14435' },
        { label: 'Net', value: mc(sum(rows, 'inflow') - sum(rows, 'outflow')), sub: 'Movement', tone: '#181818' },
        { label: 'Bank balance', value: mc(num(cr.summary?.bankBalance)), sub: 'From Tally', tone: '#3963E4' },
      ]} />
      <DataTable testid="kpi-cash-register-table" rows={rows} pageSize={40} scroll columns={[
        { key: 'date', label: 'Date', render: r => date(r.date) },
        { key: 'voucher_number', label: 'Voucher' },
        { key: 'particulars', label: 'Particulars' },
        { key: 'mode', label: 'Mode', render: r => <Pill>{lt(r.mode)}</Pill> },
        { key: 'inflow', label: 'Inflow', align: 'right', render: r => r.inflow ? <span className="text-pos">{money(r.inflow)}</span> : '—' },
        { key: 'outflow', label: 'Outflow', align: 'right', render: r => r.outflow ? <span className="text-neg">{money(r.outflow)}</span> : '—' },
        { key: 'balance', label: 'Balance', align: 'right', render: r => money(r.balance) },
      ]} />
    </>;
  };

  return (
    <Drawer open size="xl" eyebrow="KPI drill-down" onClose={onClose} testid={`kpi-panel-${metric}`}
      title={conf.title} sub={<>{lt(conf.sub)} · {subtitle}</>} footer={<Button onClick={onClose}>{lt('Close')}</Button>}>
      <div className="space-y-5">
        {error ? <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} /> : loading ? (
          <p className="py-8 text-center text-[13px] text-ink-soft">{lt('Loading KPI details…')}</p>
        ) : body()}
      </div>
      <VoucherDrawer voucher={voucher} onClose={() => setVoucher(null)} />
    </Drawer>
  );
}
