import { useState } from 'react';
import { CreditCard, Calendar, TrendingDown, AlertTriangle } from 'lucide-react';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Table from '../../components/Table';
import Drawer from '../../components/Drawer';
import { useSettings } from '../../contexts/SettingsContext';

const statusVariant = { Active: 'green', Closed: 'gray', NPA: 'red' };
const emiVariant = { Paid: 'green', Due: 'yellow', Upcoming: 'blue', Overdue: 'red' };
const TABS = ['Loans Register', 'OD Accounts', 'EMI Calendar'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const loans = [];
const odAccounts = [];
const emiSchedule = [];
const emiDays = {};

function buildCalendar() {
  const weeks = [];
  let week = [];
  for (let d = 1; d <= 31; d++) {
    const dow = new Date(2025, 6, d).getDay();
    if (d === 1) week = new Array(dow).fill(null);
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push([...week, ...new Array(7 - week.length).fill(null)]);
  return weeks;
}

export default function LoansODs() {
  const { formatAmount } = useSettings();
  const fmt = n => formatAmount(n || 0);
  const [tab, setTab] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const calendar = buildCalendar();

  const loanCols = [
    { key: 'name', label: 'Loan Name' },
    { key: 'lender', label: 'Lender' },
    { key: 'type', label: 'Type' },
    { key: 'sanctioned', label: 'Sanctioned', render: v => fmt(v) },
    { key: 'outstanding', label: 'Outstanding', render: v => <span className="font-semibold text-[#C0392B]">{fmt(v)}</span> },
    { key: 'emiAmount', label: 'EMI/Month', render: v => fmt(v) },
    { key: 'nextEmiDate', label: 'Next EMI' },
    { key: 'status', label: 'Status', render: v => <Badge label={v} variant={statusVariant[v]} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
        Coming soon — not connected to live Tally data yet
      </div>
      <div>
        <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Loans & ODs</h1>
        <p className="text-sm text-[#787774] mt-0.5">Loan register & OD utilization</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total Loan Outstanding" value="—" icon={CreditCard} accent="#C0392B" />
        <KPICard title="EMI / Month" value="—" icon={Calendar} accent="#F59E0B" />
        <KPICard title="OD Utilization" value="—" icon={TrendingDown} accent="#1A1A1A" />
        <KPICard title="EMI Due Soon" value="—" icon={AlertTriangle} accent="#C0392B" />
      </div>

      <div className="bg-white border border-[#D4D3CE] rounded-xl">
        <div className="flex border-b border-[#D4D3CE] px-1 pt-1">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg mr-1 ${tab === i ? 'text-[#1A1A1A] bg-[#ECEEEF]' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>{t}</button>
          ))}
        </div>
        <div className="p-5">
          {tab === 0 && (
            loans.length === 0
              ? <div className="py-12 text-center text-sm text-[#AEACA8]">No loans — feature not connected to live data yet</div>
              : <Table columns={loanCols} data={loans} onRowClick={setDrawer} />
          )}
          {tab === 1 && (
            odAccounts.length === 0
              ? <div className="py-12 text-center text-sm text-[#AEACA8]">No OD accounts yet</div>
              : (
                <div className="space-y-4">
                  {odAccounts.map(od => {
                    const pct = Math.round((od.utilized / od.limit) * 100);
                    const color = pct > 80 ? '#C0392B' : pct > 60 ? '#F59E0B' : '#2D7D46';
                    return (
                      <div key={od.id} className="border border-[#D4D3CE] rounded-xl p-5 bg-[#F9F9F9]">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-semibold text-[#1A1A1A]">{od.name}</p>
                            <p className="text-sm text-[#787774]">{od.bank} · {od.accountNo}</p>
                          </div>
                          <Badge label={od.status} variant="green" />
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                          <div><p className="text-xs text-[#787774] mb-1">Limit</p><p className="font-semibold text-[#1A1A1A]">{fmt(od.limit)}</p></div>
                          <div><p className="text-xs text-[#787774] mb-1">Utilized</p><p className="font-semibold" style={{ color }}>{fmt(od.utilized)}</p></div>
                          <div><p className="text-xs text-[#787774] mb-1">Available</p><p className="font-semibold text-[#2D7D46]">{fmt(od.limit - od.utilized)}</p></div>
                        </div>
                        <div className="w-full bg-[#F5F4EF] rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
          )}
          {tab === 2 && (
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A] mb-4">EMI Calendar</p>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-[#AEACA8] py-1">{d}</div>)}
              </div>
              {calendar.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((day, di) => {
                    const emi = day && emiDays[day];
                    return (
                      <div key={di} className={`h-14 rounded-lg flex flex-col items-center justify-center text-xs border ${!day ? 'border-transparent' : emi ? 'border-[#1A1A1A] bg-[#ECEEEF]' : 'border-[#D4D3CE] bg-white'}`}>
                        {day && <span className="font-medium text-[#1A1A1A]">{day}</span>}
                        {emi && <span className="text-[9px] font-semibold text-[#1A1A1A] mt-0.5 px-1 truncate">{emi.label}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="text-xs text-[#AEACA8] mt-4 text-center">No EMI schedule — not connected to live data yet</p>
            </div>
          )}
        </div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.name}>
        {drawer && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Sanctioned', fmt(drawer.sanctioned)], ['Outstanding', fmt(drawer.outstanding)], ['EMI Amount', fmt(drawer.emiAmount)], ['Next EMI', drawer.nextEmiDate]].map(([l, v]) => (
                <div key={l} className="p-3 bg-[#F9F9F9] rounded-lg border border-[#D4D3CE]">
                  <p className="text-xs text-[#787774] mb-1">{l}</p>
                  <p className="font-medium text-[#1A1A1A] text-sm">{v}</p>
                </div>
              ))}
            </div>
            {emiSchedule.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-[#F9F9F9]"><tr>
                  {['#', 'Date', 'EMI', 'Status'].map(h => <th key={h} className="px-3 py-2 text-left text-[#787774] font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {emiSchedule.map(e => (
                    <tr key={e.no} className="border-t border-[#F5F4EF]">
                      <td className="px-3 py-2">{e.no}</td>
                      <td className="px-3 py-2">{e.date}</td>
                      <td className="px-3 py-2 font-semibold">{fmt(e.emi)}</td>
                      <td className="px-3 py-2"><Badge label={e.status} variant={emiVariant[e.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
