import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, BarChart3, LineChart as LineIcon,
  ShoppingCart, Wallet,
  ArrowUpCircle, ArrowDownCircle, Maximize2,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { resolvePeriodDates, DASHBOARD_PERIOD_CODE } from '../utils/periodDates';
import {
  Page, Card, Panel, Button, Pill, Bar as MiniBar, Empty, Skeleton,
  Tabs, ChartTooltip, CHART_AXIS, CHART_GRID, SERIES, useLabelT,
} from '../components/kit';
import { useFmt, PartyPanel } from './shared';
import KpiPanel, { KPI_KEYS } from './KpiPanel';
import CashflowReportDrawer from '../components/CashflowReportDrawer';

/* Count-up for headline figures — eases the raw number in over ~0.8s, formatted per frame. */
function AnimatedNumber({ value, format, testid, className = '' }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) { setShown(target); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(target); return; }
    let raf;
    const t0 = performance.now();
    const dur = 800;
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <span data-testid={testid} className={className}>{format(shown)}</span>;
}

/* Tiny inline trend line for the Sales/Purchases/Expenses strip. */
function Sparkline({ points, color, width = 72, height = 26 }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Trend pill: 0% is grey + black (neither good nor bad). No prior → em dash.
   invert: liabilities — a rise is red. */
function TrendChip({ pct, invert = false }) {
  if (pct == null || !Number.isFinite(Number(pct))) {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-bold tabular text-ink-faint">—</span>
    );
  }
  if (Number(pct) === 0) {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-bold tabular text-ink">0%</span>
    );
  }
  const up = Number(pct) > 0;
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular ${good ? 'bg-pos-bg text-pos' : 'bg-neg-bg text-neg'}`}>
      {up ? <TrendingUp size={11} strokeWidth={2.5} /> : <TrendingDown size={11} strokeWidth={2.5} />}
      {up ? '+' : ''}{Number(pct)}%
    </span>
  );
}

export default function Dashboard() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const { key: routeKey } = useParams();
  const [drill, setDrill] = useState(routeKey && KPI_KEYS.includes(routeKey) ? routeKey : null);
  const { authBootstrapping, syncVersion } = useAuth();
  const {
    selectedCompany, selectedFY, pairing, demoMode: wsDemoMode, pairingStatus,
    companies: wsCompanies,
  } = useWorkspace();
  const connectionStatus = String(pairing?.status || pairingStatus || '').toUpperCase();
  const demoMode = typeof wsDemoMode === 'boolean'
    ? wsDemoMode
    : (() => {
      if (connectionStatus === 'CONNECTED') return false;
      if (connectionStatus === 'UNPAIRED' || connectionStatus === 'RECONNECTING') return true;
      // Status unknown — fail-closed Demo
      return true;
    })();
  const reconnecting = connectionStatus === 'RECONNECTING';
  const connectedEmpty =
    connectionStatus === 'CONNECTED' &&
    Array.isArray(wsCompanies) &&
    wsCompanies.filter((c) => {
      const name = String(c?.name || '').toLowerCase();
      const guid = String(c?.guid || c?.id || '');
      return c?.is_active !== false
        && !name.startsWith('demo')
        && !guid.startsWith('dddddddd-dddd-4ddd-8ddd-');
    }).length === 0;
  const { money, mc } = useFmt();

  const [metrics, setMetrics] = useState({ tiles: [] });
  const [chartData, setChartData] = useState({ series: [], interval: null });
  const [kpiStrip, setKpiStrip] = useState([]);
  const [costAnalysis, setCostAnalysis] = useState({ total_raw: 0, heads: [] });
  const [costFailed, setCostFailed] = useState(false);
  const [recent, setRecent] = useState([]);
  const [cashflow, setCashflow] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadWarn, setLoadWarn] = useState('');
  const [period, setPeriod] = useState('1 Month');
  const [chart, setChart] = useState('bar');
  const [cashflowOpen, setCashflowOpen] = useState(false);
  const [partyName, setPartyName] = useState(null);
  const hasDataRef = useRef(false);
  const prevCompanyRef = useRef(selectedCompany?.guid);

  const load = () => {
    if (prevCompanyRef.current !== selectedCompany?.guid) {
      prevCompanyRef.current = selectedCompany?.guid;
      hasDataRef.current = false;
    }
    const soft = hasDataRef.current;
    if (!soft) setLoading(true);
    setError('');
    setLoadWarn('');
    setCostFailed(false);
    if (authBootstrapping) {
      if (!soft) setLoading(true);
      return;
    }
    // Demo Mode still loads KPIs from the Demo company — do not blank the dashboard.
    const guid = selectedCompany?.guid;
    const fyFrom = selectedFY?.startDate || selectedFY?.begin_date
      || selectedCompany?.years?.[0]?.startDate || selectedCompany?.years?.[0]?.begin_date;
    const fyTo = selectedFY?.endDate || selectedFY?.end_date
      || selectedCompany?.years?.[0]?.endDate || selectedCompany?.years?.[0]?.end_date;
    if (!guid || !fyFrom || !fyTo) {
      setMetrics({ tiles: [] });
      setChartData({ series: [], interval: null });
      setKpiStrip([]);
      setCostAnalysis({ total_raw: 0, heads: [] });
      setRecent([]);
      setCashflow(null);
      setTopCustomers([]);
      setError(demoMode
        ? lt('Demo Mode — waiting for Demo company. Try refresh or Settings → Tally Sync.')
        : connectedEmpty
          ? lt('No active Tally companies found. Check the company/FY selection in TallyDekho Desktop and sync again.')
          : lt('Select a company to load the dashboard.'));
      setLoading(false);
      return;
    }
    const code = DASHBOARD_PERIOD_CODE[period] || '1M';
    const { from, to } = resolvePeriodDates(code, {
      from: fyFrom,
      to: fyTo,
    });
    Promise.allSettled([
      api.loadMobileDashboard(guid, code, from, to),
      api.aggregateTopCustomersFromInvoices(guid, from, to),
      api.aggregateCostFromExpenses(guid, from, to),
      // Web chart UI — backend serves series here (metrics tiles only on /metrics, same as mobile).
      api.fetchDashboardChart(guid, code, from, to),
    ])
      .then((results) => {
        const [dashResult, custResult, costResult, chartResult] = results;
        const failed = [];
        if (dashResult.status === 'rejected') {
          failed.push('dashboard');
          console.warn('[dashboard] mobile bundle failed:', dashResult.reason?.message || dashResult.reason);
        } else if (dashResult.value?.failed?.length) {
          dashResult.value.failed.forEach((s) => failed.push(s));
        }
        if (custResult.status === 'rejected') {
          failed.push('customers');
          console.warn('[dashboard] top customers failed:', custResult.reason?.message || custResult.reason);
        }
        if (costResult.status === 'rejected') {
          failed.push('cost');
          console.warn('[dashboard] cost breakdown failed:', costResult.reason?.message || costResult.reason);
        }
        if (dashResult.status === 'rejected') {
          throw new Error(lt('Failed to load dashboard'));
        }
        if (failed.length) {
          setLoadWarn(lt('Some dashboard sections failed to load. Tap Retry or check Tally sync.'));
        }

        const dash = dashResult.value;
        const chartRes = chartResult.status === 'fulfilled' ? chartResult.value : null;
        setMetrics(dash.metrics || { tiles: [], series: [] });
        setChartData({
          series: chartRes?.series?.length ? chartRes.series : (dash.metrics?.series || []),
          interval: chartRes?.interval || dash.metrics?.interval || null,
        });
        setKpiStrip(dash.kpiStrip || []);
        setCashflow(dash.cashflow);
        setTopCustomers(custResult.status === 'fulfilled' ? (custResult.value || []) : []);
        setRecent(api.unwrapList(dash.recent).map(a => {
          const label = String(a.label || '');
          const hash = label.indexOf('#');
          return {
            id: a.id || a.guid,
            guid: a.guid,
            party_name: a.party || '',
            voucher_type: hash >= 0 ? label.slice(0, hash).trim() : (label || (a.is_credit ? 'Receipt' : 'Voucher')),
            voucher_number: hash >= 0 ? label.slice(hash + 1).trim() : '',
            amount: Number(a.amount_raw ?? a.amount ?? 0),
          };
        }));
        const failedCost = costResult.status === 'rejected';
        setCostFailed(failedCost);
        setCostAnalysis(failedCost ? { total_raw: 0, heads: [] } : (costResult.value || { total_raw: 0, heads: [] }));
        hasDataRef.current = true;
      })
      .catch(e => {
        setMetrics({ tiles: [] });
        setChartData({ series: [], interval: null });
        setKpiStrip([]);
        setCostAnalysis({ total_raw: 0, heads: [] });
        setCostFailed(true);
        setRecent([]);
        setCashflow(null);
        setTopCustomers([]);
        setError(e.message || lt('Failed to load dashboard'));
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [
    selectedCompany?.guid,
    selectedFY?.uniqueId,
    period,
    connectionStatus,
    demoMode,
    authBootstrapping,
    syncVersion,
  ]);

  const tileOf = (...ids) => (metrics.tiles || []).find(t => ids.includes(t.id));
  const tileAmt = id => Number((id === 'purchases' ? tileOf('purchases', 'purchase') : tileOf(id))?.amount_raw || 0);
  const salesTotal = tileAmt('sales');
  const purchaseTotal = tileAmt('purchases');
  const expensesPeriod = tileAmt('expenses');

  const displaySeries = useMemo(() => {
    const fromApi = (chartData.series || []).map(r => ({
      month: r.label || r.date,
      Sales: Number(r.sales || 0),
      Purchase: Number(r.purchase || 0),
      Expenses: Number(r.expenses || 0),
    }));
    if (fromApi.length) return fromApi;
    if (salesTotal || purchaseTotal || expensesPeriod) {
      return [{ month: period, Sales: salesTotal, Purchase: purchaseTotal, Expenses: expensesPeriod }];
    }
    return [];
  }, [chartData.series, salesTotal, purchaseTotal, expensesPeriod, period]);

  const tileTrend = id => {
    const t = id === 'purchases' ? tileOf('purchases', 'purchase') : tileOf(id);
    if (!t) return null;
    // Dummy mobile `change: 0` is not a trend — only show % when the API compared a real prior window
    if (Object.prototype.hasOwnProperty.call(t, 'trend_pct')) {
      if (t.trend_pct == null || !Number.isFinite(Number(t.trend_pct))) return null;
      return Number(t.trend_pct);
    }
    if (t.change == null || Number(t.change) === 0 || !Number.isFinite(Number(t.change))) return null;
    return Number(t.change);
  };
  const peak = useMemo(() => displaySeries.reduce((m, r) => (r.Sales > (m?.Sales || 0) ? r : m), null), [displaySeries]);
  const turnover = salesTotal;
  const trio = [
    ['Sales', salesTotal, tileTrend('sales'), SERIES[1], TrendingUp, '/sales', displaySeries.map(r => r.Sales), false],
    ['Purchases', purchaseTotal, tileTrend('purchases'), SERIES[2], ShoppingCart, '/purchase', displaySeries.map(r => r.Purchase), false],
    ['Expenses', expensesPeriod, tileTrend('expenses'), SERIES[4], Wallet, '/expenses', displaySeries.map(r => r.Expenses), true],
  ];

  const maxCust = topCustomers[0]?.revenue || 1;

  const expenseSplit = useMemo(() => (
    (costAnalysis.heads || []).map((e, i) => ({
      name: e.name,
      amount: Number(e.amount_raw || 0),
      pct: Number(e.pct || 0),
      color: SERIES[i % SERIES.length],
    }))
  ), [costAnalysis]);
  const expenseTotal = Number(costAnalysis.total_raw || 0);

  const byId = Object.fromEntries((kpiStrip || []).map(k => [k.id, k]));
  const kpis = [
    // last flag: invert chip colors — for liabilities a rise is unfavorable (red)
    ['Receivables', byId.receivable?.amount_raw, 'Due from customers', SERIES[2], 'receivables', byId.receivable?.trend_pct, false],
    ['Payables', byId.payable?.amount_raw, 'Due to suppliers', SERIES[4], 'payables', byId.payable?.trend_pct, true],
    ['Bank balance', byId.bank?.amount_raw, '3 accounts', SERIES[3], 'bank-balance', byId.bank?.trend_pct, false],
    ['Loans & ODs', byId.loans?.amount_raw, 'Outstanding', SERIES[4], 'loans-ods', byId.loans?.trend_pct, true],
    ['Receipts', byId.receipts?.amount_raw, 'This period', SERIES[0], 'receipts', byId.receipts?.trend_pct, false],
    ['Payments', byId.payments?.amount_raw, 'This period', SERIES[1], 'payments', byId.payments?.trend_pct, true],
    ['Cash-in-hand', byId.cash?.amount_raw, 'Cash Register', SERIES[0], 'cash-in-hand', byId.cash?.trend_pct, false],
  ];

  const cashIn = Number(cashflow?.totalIncome ?? 0);
  const cashOut = Number(cashflow?.totalExpense ?? 0);
  const netCash = Number(cashflow?.netCash ?? 0);
  const cfGross = Number(cashflow?.grossProfit ?? 0);
  const cfNet = Number(cashflow?.netProfit ?? 0);
  const incomePercentage = Number(cashflow?.incomePercentage ?? 0);
  const cashHealthy = netCash >= 0;
  const base = Math.max(1, cashIn, cashOut);
  const incomePct = Math.round((cashIn / base) * 100);
  const expensePct = Math.round((cashOut / base) * 100);

  const blocks = {
    chart: (
      <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="display text-4xl font-bold leading-none text-ink tabular tracking-tight">{mc(turnover)}</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-ink-soft">{lt('Turnover overview')} · {lt('FY')} {selectedFY?.name || '2025-26'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-4 pr-2 sm:flex">
            {[['Sales', SERIES[1]], ['Purchase', SERIES[2]], ['Expenses', SERIES[4]]].map(([l, c]) => (
              <span key={l} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <span className="h-2 w-2 rounded-sm" style={{ background: c }} />{lt(l)}
              </span>
            ))}
          </div>
          <Tabs
            testid="dashboard-period"
            tabs={['7 Days', '1 Month', '3 Months', '6 Months']}
            value={period}
            onChange={setPeriod}
          />
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
            <button
              data-testid="chart-bar-toggle"
              onClick={() => setChart('bar')}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${chart === 'bar' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream hover:text-ink'}`}
            >
              <BarChart3 size={16} strokeWidth={2} />
            </button>
            <button
              data-testid="chart-line-toggle"
              onClick={() => setChart('area')}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${chart === 'area' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream hover:text-ink'}`}
            >
              <LineIcon size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {loading ? <Skeleton rows={6} /> : displaySeries.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={280}>
            {chart === 'bar' ? (
              <BarChart data={displaySeries} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="month" {...CHART_AXIS} />
                <YAxis tickFormatter={v => mc(v)} width={62} {...CHART_AXIS} />
                <Tooltip content={<ChartTooltip format={money} />} cursor={{ fill: 'rgba(26,26,26,0.035)' }} />
                <Bar dataKey="Sales" name={lt('Sales')} radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {displaySeries.map((r, i) => (
                    <Cell key={i} fill={peak && r.month === peak.month ? SERIES[1] : 'rgba(45,125,70,0.38)'} />
                  ))}
                </Bar>
                <Bar dataKey="Purchase" name={lt('Purchase')} radius={[4, 4, 0, 0]} maxBarSize={26} fill="rgba(37,99,235,0.35)" />
                <Bar dataKey="Expenses" name={lt('Expenses')} radius={[4, 4, 0, 0]} maxBarSize={26} fill="rgba(192,57,43,0.35)" />
              </BarChart>
            ) : (
              <AreaChart data={displaySeries} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--pos)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--pos)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="month" {...CHART_AXIS} />
                <YAxis tickFormatter={v => mc(v)} width={62} {...CHART_AXIS} />
                <Tooltip content={<ChartTooltip format={money} />} />
                <Area type="monotone" dataKey="Sales" name={lt('Sales')} stroke="var(--pos)" strokeWidth={3} fill="url(#gs)" dot={false} activeDot={{ r: 5, fill: 'var(--pos)', stroke: '#fff', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="Purchase" name={lt('Purchase')} stroke="var(--note)" strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} />
                <Area type="monotone" dataKey="Expenses" name={lt('Expenses')} stroke="var(--neg)" strokeWidth={2} strokeDasharray="2 4" fill="none" dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      </Card>
    ),
    cost: (
      <Panel title="Cost analysis" testid="cost-analysis-panel">
      {costFailed ? <Empty message="Expense breakdown unavailable" /> : (<>
      <p className="display text-4xl font-bold leading-none text-ink tabular tracking-tight">
        <AnimatedNumber value={expenseTotal} format={mc} />
      </p>
      <div className="mt-5 flex h-4 w-full gap-1 overflow-hidden">
        {expenseSplit.map((e, i) => (
          <span key={e.name} className="hatched grow-x h-full origin-left rounded-sm"
            style={{ width: `${e.pct}%`, background: e.color, minWidth: 6, animationDelay: `${0.1 + i * 0.06}s` }} />
        ))}
      </div>
      <div className="stagger mt-6 space-y-3">
         {expenseSplit.length === 0 ? <Empty message="No expense vouchers" /> : expenseSplit.map(e => (
          <div key={e.name} className="flex items-center gap-3">
            <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: e.color }} />
             <span className="flex-1 truncate text-sm font-semibold text-ink-soft">{e.name === 'Other' ? lt('Other') : e.name}</span>
            <span className="text-sm font-bold text-ink tabular">{e.pct}%</span>
          </div>
        ))}
      </div>
      </>)}
      </Panel>
    ),
    cashflow: (
      <Panel
        title="Cashflow"
      testid="financial-health-panel"
      right={
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Pill tone={cashHealthy ? 'pos' : 'neg'}>
            {cashHealthy ? '+' : ''}{incomePercentage}% {lt(cashHealthy ? 'Healthy' : 'Watch')}
          </Pill>
          <Button
            variant="ghost"
            data-testid="cashflow-expand-btn"
            onClick={() => setCashflowOpen(true)}
            title={lt('Open cashflow report')}
          >
            <Maximize2 size={15} strokeWidth={2} />
          </Button>
        </span>
      }
      >
      <div className="flex flex-col items-center pt-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-ink-soft">{lt('Net Cash')}</p>
        <p className="display mt-2 text-4xl font-bold leading-none text-ink tabular tracking-tight">
          <AnimatedNumber value={netCash} format={mc} testid="net-cash-value" />
        </p>
        <div className="mt-8 w-full space-y-4">
          {[['Income', cashIn, SERIES[1], ArrowUpCircle, incomePct], ['Expense', cashOut, SERIES[4], ArrowDownCircle, expensePct]].map(([l, v, c, Icon, pct]) => (
            <div key={l} className="flex items-center gap-4">
              <span className="flex w-24 flex-shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                 <Icon size={16} strokeWidth={2} style={{ color: c }} /> {lt(l)}
              </span>
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(26,26,26,0.06)' }}>
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: c }} />
              </span>
              <span className="w-20 flex-shrink-0 text-right text-sm font-bold text-ink tabular">
                <AnimatedNumber value={v} format={mc} />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-8 grid w-full grid-cols-2 gap-4">
          {[['Gross profit', cfGross], ['Net profit', cfNet]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-paper-2 px-5 py-4">
               <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{lt(l)}</p>
              <p className="mt-2 text-xl font-bold text-ink tabular tracking-tight"><AnimatedNumber value={v} format={mc} /></p>
            </div>
          ))}
        </div>
      </div>
      </Panel>
    ),
    customers: (
      <Panel title="Top customers" testid="top-customers-panel">
      {loading ? <Skeleton rows={5} /> : topCustomers.length === 0 ? <Empty /> : (
        <div className="stagger space-y-5">
          {topCustomers.map((c, i) => (
            <button
              type="button"
              key={c.name || i}
              data-testid={`top-customer-${i}`}
              onClick={() => c.name && setPartyName(c.name)}
              className="flex w-full items-center gap-4 text-left transition-opacity hover:opacity-80"
            >
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm" style={{ background: SERIES[i % SERIES.length] }}>
                {(c.name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <span className="truncate text-sm font-bold text-ink">{c.name}</span>
                  <span className="flex-shrink-0 text-sm font-bold text-ink tabular">
                    <AnimatedNumber value={c.revenue} format={mc} />
                  </span>
                </div>
                <MiniBar pct={(c.revenue / maxCust) * 100} color={SERIES[i % SERIES.length]} height={6} />
              </div>
            </button>
          ))}
        </div>
      )}
      </Panel>
    ),
    activity: (
      <Panel
        title="Recent activity"
      testid="recent-activity-panel"
       right={<Button variant="primary" onClick={() => navigate('/audit-trail/daybook')} data-testid="dashboard-daybook">{lt('Day Book')}</Button>}
      >
      <div className="divide-y divide-line">
         {loading ? <Skeleton rows={5} /> : recent.length === 0 ? <Empty message="No recent vouchers" /> : recent.map(v => (
          <div key={v.id} className="group flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${
              v.voucher_type === 'Sales' ? 'bg-pos-bg text-pos' : v.voucher_type === 'Purchase' ? 'bg-warn-bg text-warn' : 'bg-paper-2 text-ink-soft'
            }`}>
              {v.voucher_type === 'Purchase'
                ? <TrendingDown size={18} strokeWidth={2} />
                : <TrendingUp size={18} strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink group-hover:text-ink/80 transition-colors">{v.party_name}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-ink-soft">{v.voucher_type} · <span className="tabular">{v.voucher_number}</span></p>
            </div>
            <span className="text-sm font-bold text-ink tabular">{money(v.amount)}</span>
          </div>
        ))}
      </div>
      </Panel>
    ),
  };

  // Sales · Purchases · Expenses — three individual cards.
  blocks.trioStrip = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {trio.map(([label, value, delta, tone, Icon, , spark, invert]) => (
        <div
          key={label}
          data-testid={`trio-${label.toLowerCase()}`}
          className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 text-left"
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${tone}1A` }}>
            <Icon size={18} strokeWidth={2} style={{ color: tone }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">{lt(label)}</span>
            {loading ? (
              <span className="mt-1 block h-6 w-20 animate-pulse rounded-md bg-cream" />
            ) : (
              <span className="mt-0.5 block">
                <span className="display text-2xl font-bold leading-none text-ink tabular tracking-tight">{money(value)}</span>
              </span>
            )}
          </span>
          {!loading && (
            <span className="flex flex-shrink-0 flex-col items-end gap-1">
              <Sparkline points={spark} color={delta == null ? tone : delta < 0 ? 'var(--neg)' : 'var(--pos)'} />
              <TrendChip pct={delta} invert={!!invert} />
            </span>
          )}
        </div>
      ))}
    </div>
  );

  // Sleek KPI strip — one card, all 7 metrics as compact columns with a left color accent.
  blocks.kpiStrip = (
    <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-4 xl:grid-cols-7">
      {kpis.map(([label, value, sub, tone, metric, trend, invert]) => (
        <button
          key={metric}
          data-testid={`kpi-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
          onClick={() => setDrill(metric)}
          className="group relative min-w-0 bg-surface px-6 py-5 text-left transition-colors duration-200 hover:bg-cream/60 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
        >
          <span className="absolute inset-y-5 left-3 w-1 rounded-full" style={{ background: tone }} />
          <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-ink-soft">{lt(label)}</span>
          {loading && value != null ? (
            <span className="mt-2.5 block h-5 w-14 animate-pulse rounded-md bg-cream" />
          ) : (
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="display block text-xl font-bold leading-none text-ink tabular tracking-tight">
                {value == null ? lt('View') : mc(value)}
              </span>
              <TrendChip pct={trend} invert={invert} />
            </span>
          )}
        </button>
      ))}
    </Card>
  );

  return (
    <Page
      testid="dashboard-page"
      title="Dashboard"
    >
      {error && (
        <div className="rounded-xl border border-neg/20 bg-neg-bg p-4 text-sm font-semibold text-neg flex items-center justify-between shadow-sm">
           <span>{error}</span> <Button variant="danger" className="ml-4" onClick={load}>{lt('Retry')}</Button>
        </div>
      )}
      {!error && loadWarn && (
        <div className="rounded-xl border border-warn/30 bg-warn-bg p-4 text-sm font-semibold text-warn flex items-center justify-between shadow-sm">
          <span>{loadWarn}</span>
          <Button variant="secondary" className="ml-4" onClick={load}>{lt('Retry')}</Button>
        </div>
      )}
      {/* Demo Mode — real Tally data hidden until CONNECTED (UNPAIRED | RECONNECTING) */}
      {demoMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn-bg px-5 py-3 shadow-sm" data-testid="demo-mode-banner">
          <span className="h-2 w-2 rounded-sm bg-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              {reconnecting ? lt('Paired · waiting for first sync') : lt('Demo Mode')}
            </p>
            <p className="text-[12px] text-ink-soft">
              {reconnecting
                ? lt('Desktop is paired. Live books stay hidden until the first sync completes.')
                : lt('Showing sample Demo company data. Live Tally books stay hidden until you pair and sync.')}
            </p>
          </div>
          {!reconnecting && (
            <Button onClick={() => navigate('/settings/tally-sync')}>{lt('Connect')}</Button>
          )}
        </div>
      )}
      {connectedEmpty && !demoMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn-bg px-5 py-3 shadow-sm" data-testid="connected-empty-banner">
          <span className="h-2 w-2 rounded-sm bg-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{lt('Connected · no active companies')}</p>
            <p className="text-[12px] text-ink-soft">
              {lt('No active Tally companies found. Check the company/FY selection in TallyDekho Desktop and sync again.')}
            </p>
          </div>
        </div>
      )}


      {/* Sales · Purchases · Expenses — three cards */}
      {blocks.trioStrip}

      {/* All 7 KPIs — one sleek strip */}
      {blocks.kpiStrip}

      {/* Turnover chart — full width */}
      {blocks.chart}

      {/* Cost analysis · Cashflow · Top customers (wider) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        {blocks.cost}
        {blocks.cashflow}
        {blocks.customers}
      </div>

      {blocks.activity}

      <KpiPanel metric={drill} onClose={() => { setDrill(null); if (routeKey) navigate('/', { replace: true }); }} />
      <CashflowReportDrawer
        open={cashflowOpen}
        onClose={() => setCashflowOpen(false)}
        initialPeriod={DASHBOARD_PERIOD_CODE[period] || '1M'}
      />
      {partyName && <PartyPanel id={partyName} onClose={() => setPartyName(null)} />}
    </Page>
  );
}
