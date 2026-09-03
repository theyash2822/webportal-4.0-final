// Cashflow detail drawer — same fields as mobile app/cashflow-report.tsx.
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { Drawer, Button, Pill, Empty, Skeleton, useLabelT, SERIES } from './kit';
import { useAuth } from '../contexts/AuthContext';
import { useFmt } from '../pages/shared';
import api from '../services/api';
import { resolvePeriodDates } from '../utils/periodDates';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const PERIODS = ['7D', '1M', '3M'];

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1.5 text-lg font-bold tabular tracking-tight" style={tone ? { color: tone } : undefined}>{value}</p>
    </div>
  );
}

export default function CashflowReportDrawer({ open, onClose, initialPeriod = '1M' }) {
  const lt = useLabelT();
  const navigate = useNavigate();
  const { money, mc, date } = useFmt();
  const { selectedCompany, selectedFY } = useAuth();
  const [period, setPeriod] = useState(initialPeriod === '6M' ? '3M' : (PERIODS.includes(initialPeriod) ? initialPeriod : '1M'));
  const [cf, setCf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setPeriod(initialPeriod === '6M' ? '3M' : (PERIODS.includes(initialPeriod) ? initialPeriod : '1M'));
  }, [open, initialPeriod]);

  const load = useCallback(() => {
    const guid = selectedCompany?.guid;
    if (!open || !guid) return;
    setLoading(true);
    setError('');
    const { from, to } = resolvePeriodDates(period, {
      from: selectedFY?.startDate,
      to: selectedFY?.endDate,
    });
    api.fetchCashflow(guid, period, from, to)
      .then((data) => setCf(data))
      .catch((e) => { setCf(null); setError(e?.message || 'Failed to load cashflow'); })
      .finally(() => setLoading(false));
  }, [open, selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, period]);

  useEffect(() => { load(); }, [load]);

  const income = Number(cf?.totalIncome ?? 0);
  const expense = Number(cf?.totalExpense ?? 0);
  const netCash = Number(cf?.netCash ?? 0);
  const incomePct = Number(cf?.incomePercentage ?? 0);
  const healthy = netCash >= 0;
  const base = Math.max(1, income, expense);
  const incomeBar = Math.round((income / base) * 100);
  const expenseBar = Math.round((expense / base) * 100);

  const seriesRows = (cf?.series || []).map((r, i) => ({
    id: r.date || i,
    label: r.label || r.date,
    date: r.date,
    inflow: Number(r.inflow || 0),
    outflow: Number(r.outflow || 0),
  }));
  const chartRows = seriesRows.length
    ? seriesRows
    : (income || expense ? [{ id: 'period', label: period, inflow: income, outflow: expense }] : []);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Cashflow"
      testid="cashflow-report-drawer"
      title="Cashflow Report"
      sub={cf?.updatedAt ? <>{lt('Updated')} {cf.updatedAt}</> : lt('Income, expense and profit for the selected window')}
      actions={(
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'ghost'}
              data-testid={`cashflow-drawer-period-${p}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      )}
      footer={<>
        <Button onClick={() => { onClose(); navigate('/cashflow-report'); }} data-testid="cashflow-open-full"><ExternalLink size={14} /> {lt('Full screen')}</Button>
        <Button onClick={onClose}>{lt('Close')}</Button>
      </>}
    >
      {loading && !cf ? <Skeleton rows={8} /> : error ? (
        <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{lt('Net Cash')}</p>
                <p className="display mt-2 text-4xl font-bold leading-none text-ink tabular tracking-tight">{mc(netCash)}</p>
              </div>
              <Pill tone={healthy ? 'pos' : 'neg'}>
                {healthy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {healthy ? '+' : ''}{incomePct}% {lt(healthy ? 'Healthy' : 'Watch')}
              </Pill>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <p className="text-sm font-bold text-ink">{lt('Income vs Expense')}</p>
            {[['Income', income, SERIES[1], ArrowUpCircle, incomeBar], ['Expense', expense, SERIES[4], ArrowDownCircle, expenseBar]].map(([l, v, c, Icon, pct]) => (
              <div key={l}>
                <div className="flex items-center gap-3">
                  <span className="flex w-24 items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                    <Icon size={16} style={{ color: c }} /> {lt(l)}
                  </span>
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: c }} />
                  </span>
                  <span className="w-24 text-right text-sm font-bold tabular text-ink">{mc(v)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="mb-4 text-sm font-bold text-ink">{lt('Trend')}</p>
            {chartRows.length === 0 ? <Empty message="No cashflow series" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartRows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => mc(v)} width={56} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => money(v)} labelFormatter={(v) => (date(v) !== v ? date(v) : v)} />
                  <Bar dataKey="inflow" name={lt('Income')} fill={SERIES[1]} maxBarSize={18} />
                  <Bar dataKey="outflow" name={lt('Expense')} fill={SERIES[4]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-ink">{lt('Key Metrics')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Metric label={lt('Total Income')} value={mc(income)} tone={SERIES[1]} />
              <Metric label={lt('Total Expense')} value={mc(expense)} tone={SERIES[4]} />
              <Metric label={lt('Gross Profit')} value={money(Number(cf?.grossProfit ?? 0))} tone={Number(cf?.grossProfit ?? 0) >= 0 ? SERIES[1] : SERIES[4]} />
              <Metric label={lt('Net Profit')} value={money(Number(cf?.netProfit ?? 0))} tone={Number(cf?.netProfit ?? 0) >= 0 ? SERIES[1] : SERIES[4]} />
              <Metric label={lt('Gross Profit vs Sales')} value={`${Number(cf?.grossProfitVsSalesPct ?? incomePct)}%`} />
              <Metric label={lt('Sales')} value={mc(Number(cf?.sales ?? 0))} />
              <Metric label={lt('Gross Cash')} value={mc(Number(cf?.grossCash ?? netCash))} />
              <Metric label={lt('Net Realisable')} value={mc(Number(cf?.netRealisableBalance ?? netCash))} />
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
