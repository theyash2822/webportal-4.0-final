import { useState } from 'react';
import { Receipt } from 'lucide-react';
import KPICard from '../../components/KPICard';

const TAX_TABS = ['TDS', 'TCS', 'Import Duty', 'Export Duty', 'Excise', 'VAT', 'Cess'];
const emptyKpis = [
  { t: 'Deducted / Collected', v: '—' },
  { t: 'Remitted', v: '—' },
  { t: 'Pending Pay', v: '—' },
  { t: 'Late Fee', v: '—' },
];

export default function OtherTaxes() {
  const [taxTab, setTaxTab] = useState('TDS');

  return (
    <div className="space-y-5">
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
        Coming soon — not connected to live Tally data yet
      </div>
      <div>
        <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Other Taxes</h1>
        <p className="text-sm text-[#787774] mt-0.5">TDS / TCS and related registers</p>
      </div>
      <div className="bg-white border border-[#D4D3CE] rounded-xl">
        <div className="flex border-b border-[#D4D3CE] px-1 pt-1 overflow-x-auto">
          {TAX_TABS.map(t => (
            <button key={t} onClick={() => setTaxTab(t)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-lg mr-1 ${taxTab === t ? 'text-[#1A1A1A] bg-[#ECEEEF]' : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'}`}>{t}</button>
          ))}
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {emptyKpis.map(k => <KPICard key={k.t} title={k.t} value={k.v} icon={Receipt} accent="#1A1A1A" />)}
          </div>
          <div className="py-12 text-center text-[#787774]">
            <Receipt size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No {taxTab} records — not connected to live data yet</p>
          </div>
        </div>
      </div>
    </div>
  );
}
