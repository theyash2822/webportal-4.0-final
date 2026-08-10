import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import KPICard from '../../components/KPICard';
import { useSettings } from '../../contexts/SettingsContext';
const fmt = n => n == null ? '—' : '₹' + Math.abs(Number(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// No mock data

const fmtL = n => '₹' + (n / 100000).toFixed(1) + 'L';
const TABS = ['Profit & Loss', 'Balance Sheet', 'Trial Balance'];
const COLORS = ['#1A1A1A','#1A1A1A','#798692','#9FA9B1','#B2BAC1'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D4D3CE] rounded-xl p-3 shadow-notion-md text-xs">
      <p className="font-semibold text-[#1A1A1A] mb-1">{label}</p>
      {payload.map((p, i) => <div key={i} className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: p.color }} /><span className="text-[#787774]">{p.name}:</span><span className="font-medium">{fmtL(p.value)}</span></div>)}
    </div>
  );
};

function ExpandRow({ label, amount, children, highlight }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`border-b border-[#F5F4EF] cursor-pointer hover:bg-[#F5F4EF] ${highlight ? 'bg-[#ECEEEF]' : ''}`} onClick={() => setOpen(p => !p)}>
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 font-medium text-[#1A1A1A]">
            {children ? (open ? <ChevronDown size={13} className="text-[#787774]" /> : <ChevronRight size={13} className="text-[#787774]" />) : <span className="w-3.5" />}
            {label}
          </span>
        </td>
        <td className={`px-4 py-3 text-right font-semibold ${highlight ? 'text-[#2D7D46]' : 'text-[#1A1A1A]'}`}>{fmt(amount)}</td>
      </tr>
      {open && children}
    </>
  );
}

export default function Reports() {
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const [tab, setTab] = useState(0);
  const { selectedCompany, token, selectedFY, isPaired } = useAuth();
  const [plReport, setPlReport] = useState(null);
  const [bsReport, setBsReport] = useState(null);
  const [tbReport, setTbReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setPlReport(null);
    setBsReport(null);
    setTbReport(null);
    if (!selectedCompany?.guid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    // V2: pass fy= param for FY-specific balances
    const fyParam = selectedFY?.startDate ? (() => { const y = parseInt(selectedFY.startDate.slice(0, 4), 10); return `${y}-${y + 1}`; })() : null;
    const fyBody = {
      companyGuid: selectedCompany.guid,
      from: selectedFY?.startDate,
      to:   selectedFY?.endDate,
      ...(fyParam ? { fy: fyParam } : {}),
    };
    Promise.all([
      api.fetchReportsPL(fyBody),
      api.fetchReportsBS(fyBody),
      api.fetchReportsTB(fyBody).catch(() => null),
    ]).then(([pl, bs, tb]) => {
      if (pl?.data) setPlReport(pl.data);
      if (bs?.data) setBsReport(bs.data);
      if (tb?.data) setTbReport(tb.data);
    }).catch(err => {
      setError(err?.response?.data?.message || err?.message || 'Failed to load reports data');
    }).finally(() => setLoading(false));
  }, [selectedCompany?.guid, selectedFY?.uniqueId]);

  // Real data only — no mock fallback
  const incomeRows = plReport?.income || [];
  const expenseRows = plReport?.expenses || [];
  const totalIncome   = plReport?.summary?.totalIncome   ?? 0;
  const totalExpenses = plReport?.summary?.totalExpenses ?? 0;
  const netProfit     = plReport?.summary?.netProfit     ?? 0;
  const grossProfit   = plReport?.summary?.grossProfit   ?? 0;

  const totalAssets = bsReport?.summary?.totalAssets ?? 0;
  const totalLiab   = bsReport?.summary?.totalLiabilities ?? 0;
  const bsAssets      = bsReport?.assets      || [];
  const bsLiabilities = bsReport?.liabilities || [];

  // Expense breakdown for chart — real data only, empty array if no data
  const expBreakdown = expenseRows.slice(0, 5).map(e => ({ name: (e.name||'').split(' ').slice(0,2).join(' '), value: Math.abs(parseFloat(e.closing_balance)||0) }));

  // Profit trend — derive from monthlySales if available, else empty array
  const profitTrend = (plReport?.monthlySales || []).map(m => ({
    month: m.month,
    profit: (m.sales ?? 0) - (m.purchase ?? 0),
  }));

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <span className="flex-shrink-0">⚠️</span>
          <span><strong>Error:</strong> {error}</span>
          <button onClick={() => window.location.reload()} className="ml-auto underline font-medium">Retry</button>
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Financial Reports</h1>
        <p className="text-sm text-[#787774] mt-0.5">{selectedFY?.name ? `FY ${selectedFY.name}` : "FY 2025-26"}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Revenue"  value={loading ? '—' : fmtL(totalIncome)}   icon={TrendingUp} accent="#1A1A1A" />
        <KPICard title="Total Expenses" value={loading ? '—' : fmtL(totalExpenses)} icon={TrendingUp} accent="#C0392B" />
        <KPICard title="Net Profit"     value={loading ? '—' : fmtL(netProfit)}     icon={TrendingUp} accent="#2D7D46" />
        <KPICard title="Total Assets"   value={loading ? '—' : fmtL(totalAssets)}   icon={TrendingUp} accent="#D97706" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Profit Trend</p>
          <p className="text-xs text-[#787774] mb-4">6-month net profit</p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={profitTrend}>
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1A1A1A" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F4EF" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 11, border: '1px solid #D4D3CE', borderRadius: 8 }} />
              <Area type="monotone" dataKey="profit" stroke="#1A1A1A" strokeWidth={2} fill="url(#pg)" dot={{ r: 3, fill: '#1A1A1A', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Expense Breakdown</p>
          <p className="text-xs text-[#787774] mb-4">By category</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={expBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                {expBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 11, border: '1px solid #D4D3CE', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Sales vs Purchase</p>
          <p className="text-xs text-[#787774] mb-4">Last 6 months</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={(plReport?.monthlySales || [])} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F4EF" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sales" fill="#1A1A1A" radius={[3,3,0,0]} />
              <Bar dataKey="purchase" fill="#C5CBD0" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-[#D4D3CE] rounded-xl">
        <div className="flex border-b border-[#D4D3CE] px-1 pt-1">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg mr-1 ${tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF] font-semibold' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>{t}</button>
          ))}
        </div>
        <div className="p-5">
          {tab === 0 && (
            <div className="overflow-x-auto rounded-xl border border-[#D4D3CE]">
              <table className="w-full text-sm">
                <thead className="bg-[#F9F9F9] border-b border-[#D4D3CE]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#787774] uppercase">Particulars</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#787774] uppercase">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <ExpandRow label="Income" amount={totalIncome}>
                    {incomeRows.length > 0
                      ? incomeRows.map(i => <tr key={i.name} className="border-b border-[#F5F4EF] bg-[#F9F9F9]"><td className="px-4 py-2 text-[#787774] pl-10">{i.name}</td><td className="px-4 py-2 text-right text-[#787774]">{fmt(Math.abs(parseFloat(i.closing_balance||0)))}</td></tr>)
                      : <tr><td colSpan={2} className="px-4 py-3 text-center text-[#787774] text-xs">No data available</td></tr>}
                  </ExpandRow>
                  <tr className="bg-[#E8F5ED] border-b border-[#A8D5BC]"><td className="px-4 py-3 font-bold text-[#2D7D46]">Gross Profit</td><td className="px-4 py-3 text-right font-bold text-[#2D7D46]">{fmt(grossProfit)}</td></tr>
                  <ExpandRow label="Expenses" amount={totalExpenses}>
                    {expenseRows.length > 0
                      ? expenseRows.map(i => <tr key={i.name} className="border-b border-[#F5F4EF] bg-[#F9F9F9]"><td className="px-4 py-2 text-[#787774] pl-10">{i.name}</td><td className="px-4 py-2 text-right text-[#787774]">{fmt(Math.abs(parseFloat(i.closing_balance||0)))}</td></tr>)
                      : <tr><td colSpan={2} className="px-4 py-3 text-center text-[#787774] text-xs">No data available</td></tr>}
                  </ExpandRow>
                  <tr className="bg-[#E8F5ED]"><td className="px-4 py-3 font-bold text-[#2D7D46] text-base">Net Profit</td><td className="px-4 py-3 text-right font-bold text-[#2D7D46] text-base">{fmt(netProfit)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
          {tab === 1 && (
            <div className="grid grid-cols-2 gap-8">
              {bsAssets.length === 0 && bsLiabilities.length === 0 ? (
                <div className="col-span-2 py-10 text-center text-xs text-[#AEACA8]">{isPaired ? 'No balance sheet data for this period' : 'Pair desktop app to see balance sheet'}</div>
              ) : (
                [['ASSETS', bsAssets, totalAssets], ['LIABILITIES', bsLiabilities, totalLiab]].map(([title, rows, total]) => (
                  <div key={title}>
                    <h3 className="text-xs font-bold text-[#AEACA8] uppercase tracking-widest mb-4 pb-2 border-b border-[#D4D3CE]">{title}</h3>
                    <div className="space-y-1 text-sm">
                      {rows.slice(0, 30).map((a, i) => (
                        <div key={i} className="flex justify-between py-1.5 pl-3 border-b border-[#F5F4EF] last:border-0">
                          <span className="text-[#787774] truncate max-w-[200px]">{a.name}</span>
                          <span className="font-medium text-[#1A1A1A] ml-2">{fmt(parseFloat(a.closing_balance || 0))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-2.5 mt-2 border-t-2 border-[#1A1A1A] font-bold text-[#1A1A1A]">
                        <span>Total {title}</span><span>{fmt(total)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 2 && (
            <div className="overflow-x-auto rounded-xl border border-[#D4D3CE]">
              <table className="w-full text-sm">
                <thead className="bg-[#F9F9F9] border-b border-[#D4D3CE]">
                  <tr>{['Ledger','Group','Opening Dr','Opening Cr','Period Dr','Period Cr','Closing Dr','Closing Cr'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[#787774] uppercase whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(() => {
                    const tbRows = tbReport?.ledgers || tbReport?.rows || tbReport?.items || [];
                    if (!tbRows.length) {
                      return (
                        <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-[#AEACA8]">{isPaired ? 'No trial balance data for this period' : 'Pair desktop app to see trial balance'}</td></tr>
                      );
                    }
                    return tbRows.map((row, i) => {
                      const opening = parseFloat(row.opening_balance ?? row.opening ?? 0) || 0;
                      const closing = parseFloat(row.closing_balance ?? row.closing ?? 0) || 0;
                      const periodDr = parseFloat(row.debit ?? row.period_dr ?? 0) || 0;
                      const periodCr = parseFloat(row.credit ?? row.period_cr ?? 0) || 0;
                      const openingDr = opening > 0 ? opening : 0;
                      const openingCr = opening < 0 ? Math.abs(opening) : 0;
                      const closingDr = closing > 0 ? closing : 0;
                      const closingCr = closing < 0 ? Math.abs(closing) : 0;
                      return (
                        <tr key={i} className="border-b border-[#F5F4EF] hover:bg-[#F5F4EF]">
                          <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">{row.name || row.ledger || '—'}</td>
                          <td className="px-3 py-2.5 text-[#787774]">{row.parent || row.group || '—'}</td>
                          <td className="px-3 py-2.5 text-right">{openingDr ? fmt(openingDr) : <span className="text-[#AEACA8]">—</span>}</td>
                          <td className="px-3 py-2.5 text-right">{openingCr ? fmt(openingCr) : <span className="text-[#AEACA8]">—</span>}</td>
                          <td className="px-3 py-2.5 text-right">{periodDr ? fmt(periodDr) : <span className="text-[#AEACA8]">—</span>}</td>
                          <td className="px-3 py-2.5 text-right">{periodCr ? fmt(periodCr) : <span className="text-[#AEACA8]">—</span>}</td>
                          <td className="px-3 py-2.5 text-right">{closingDr ? fmt(closingDr) : <span className="text-[#AEACA8]">—</span>}</td>
                          <td className="px-3 py-2.5 text-right">{closingCr ? fmt(closingCr) : <span className="text-[#AEACA8]">—</span>}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
