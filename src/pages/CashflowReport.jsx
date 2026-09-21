import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button, Pill, Empty, Skeleton, Page, useLabelT, SERIES } from '../components/kit';
import { useAuth } from '../contexts/AuthContext';
import { useFmt } from './shared';
import api, { workspaceStamp, isWorkspaceCurrent, getWorkspaceId } from '../services/api';
import { resolvePeriodDates } from '../utils/periodDates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const PERIODS = ['7D', '1M', '3M'];

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1.5 text-lg font-bold tabular tracking-tight" style={tone ? { color: tone } : undefined}>{value}</p>
    </div>
  );
}

export default function CashflowReport() {
  const lt = useLabelT();
  const { money, mc, date } = useFmt();
  const { selectedCompany, selectedFY } = useAuth();
  const [period, setPeriod] = useState(() => localStorage.getItem('td_cashflow_period') || '1M');
  const [cf, setCf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const guid = selectedCompany?.guid;
    const stamp = workspaceStamp();
    const identity = `${getWorkspaceId() || ''}|${guid || ''}|${selectedFY?.startDate || ''}|${period}`;
    setCf(null);
    if (!guid) return;
    setLoading(true);
    setError('');
    const { from, to } = resolvePeriodDates(period, { from: selectedFY?.startDate, to: selectedFY?.endDate });
    api.fetchCashflow(guid, period, from, to)
      .then((data) => {
        if (!isWorkspaceCurrent(stamp)) return;
        setCf(data);
      })
      .catch(e => {
        if (!isWorkspaceCurrent(stamp)) return;
        setCf(null);
        setError(e?.message || 'Failed to load cashflow');
      })
      .finally(() => {
        if (!isWorkspaceCurrent(stamp)) return;
        setLoading(false);
      });
    return identity;
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { localStorage.setItem('td_cashflow_period', period); }, [period]);

  const income = Number(cf?.totalIncome ?? 0);
  const expense = Number(cf?.totalExpense ?? 0);
  const netCash = Number(cf?.netCash ?? 0);
  const incomePct = Number(cf?.incomePercentage ?? 0);
  const healthy = netCash >= 0;
  const base = Math.max(1, income, expense);
  const seriesRows = (cf?.series || []).map((r, i) => ({
    id: r.date || i, label: r.label || r.date, inflow: Number(r.inflow || 0), outflow: Number(r.outflow || 0),
  }));

  return (
    <Page testid="cashflow-report-page" title="Cashflow Report" subtitle={cf?.updatedAt ? `${lt('Updated')} ${cf.updatedAt}` : lt('Income, expense and net cash')}>
      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map(p => (
          <Button key={p} variant={period === p ? 'primary' : 'ghost'} data-testid={`cashflow-period-${p}`} onClick={() => setPeriod(p)}>{p}</Button>
        ))}
      </div>
      {loading && !cf ? <Skeleton rows={10} /> : error ? (
        <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{lt('Cash & Bank Balance')}</p>
                <p className="display mt-2 text-4xl font-bold tabular text-ink">{mc(netCash)}</p>
              </div>
              <Pill tone={healthy ? 'pos' : 'neg'}>
                {healthy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {healthy ? '+' : ''}{incomePct}% {lt(healthy ? 'Healthy' : 'Watch')}
              </Pill>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <p className="text-sm font-bold text-ink">{lt('Income vs Expense')}</p>
            {[['Income', income, SERIES[1], ArrowUpCircle], ['Expense', expense, SERIES[4], ArrowDownCircle]].map(([l, v, c, Icon]) => (
              <div key={l} className="flex items-center gap-3">
                <span className="flex w-24 items-center gap-2 text-xs font-bold uppercase text-ink-soft"><Icon size={16} style={{ color: c }} /> {lt(l)}</span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round((v / base) * 100)}%`, background: c }} />
                </span>
                <span className="w-24 text-right text-sm font-bold tabular">{mc(v)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="mb-4 text-sm font-bold text-ink">{lt('Trend')}</p>
            {seriesRows.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={seriesRows}>
                  <CartesianGrid strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => mc(v)} width={56} />
                  <Tooltip formatter={v => money(v)} />
                  <Bar dataKey="inflow" name={lt('Income')} fill={SERIES[1]} maxBarSize={18} />
                  <Bar dataKey="outflow" name={lt('Expense')} fill={SERIES[4]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty message="No cashflow series" />}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={lt('Total Income')} value={mc(income)} tone={SERIES[1]} />
            <Metric label={lt('Total Expense')} value={mc(expense)} tone={SERIES[4]} />
            <Metric label={lt('Gross Profit')} value={money(Number(cf?.grossProfit ?? 0))} />
            <Metric label={lt('Net Profit')} value={money(Number(cf?.netProfit ?? 0))} />
            <Metric label={lt('Sales')} value={mc(Number(cf?.sales ?? 0))} />
            <Metric label={lt('Gross Cash')} value={mc(Number(cf?.grossCash ?? netCash))} />
            <Metric label={lt('Net Realisable')} value={mc(Number(cf?.netRealisableBalance ?? netCash))} />
            <Metric label={lt('GP vs Sales')} value={`${Number(cf?.grossProfitVsSalesPct ?? incomePct)}%`} />
          </div>
        </div>
      )}
    </Page>
  );
}
