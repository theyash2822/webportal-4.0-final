import { useState } from 'react';
import { Bell } from 'lucide-react';

const TABS = ['All', 'Compliance', 'Transactions', 'Financials', 'Inventory', 'Sync'];

export default function Notifications() {
  const [tab, setTab] = useState('All');

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
        Coming soon — not connected to live Tally data yet
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">Notifications</h1>
          <p className="text-sm text-[#787774] mt-0.5">0 notifications</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${tab === t ? 'text-white' : 'text-[#787774] bg-white border border-[#D4D3CE] hover:border-[#1A1A1A]'}`}
            style={tab === t ? { background: '#1A1A1A' } : {}}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#D4D3CE] rounded-2xl py-16 text-center">
        <Bell size={36} className="mx-auto mb-3 text-[#AEACA8]" />
        <p className="text-sm font-medium text-[#787774]">No notifications</p>
        <p className="text-xs text-[#AEACA8] mt-1">Live notifications are not wired yet</p>
      </div>
    </div>
  );
}
