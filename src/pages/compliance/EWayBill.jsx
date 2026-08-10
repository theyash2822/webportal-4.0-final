import { useState } from 'react';
import { Truck, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import KPICard from '../../components/KPICard';
import Badge from '../../components/Badge';
import Drawer from '../../components/Drawer';

const statusVariant = { Active: 'green', Expiring: 'yellow', Expired: 'red', Cancelled: 'gray' };
const ewbPerDay = [];
const ewayBills = [];

export default function EWayBill() {
  const [drawer, setDrawer] = useState(null);
  return (
    <div className="space-y-5">
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
        Coming soon — not connected to live Tally data yet
      </div>
      <div><h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">E-Way Bill</h1><p className="text-sm text-[#787774] mt-0.5">Compliance</p></div>
      <div className="grid grid-cols-4 gap-3">
        <KPICard title="Total EWBs" value="—" icon={Truck} accent="#1A1A1A" />
        <KPICard title="Active" value="—" icon={CheckCircle} accent="#2D7D46" />
        <KPICard title="Expiring Today" value="—" icon={AlertTriangle} accent="#D97706" />
        <KPICard title="Cancelled" value="—" icon={XCircle} accent="#C0392B" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">EWBs per Day</p>
          <p className="text-xs text-[#787774] mb-4">No live data yet</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={ewbPerDay} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F4EF" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#787774' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #D4D3CE', borderRadius: 8 }} />
              <Bar dataKey="count" name="EWBs" fill="#1A1A1A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-[#AEACA8] -mt-20 relative z-10 py-16">No E-Way Bill activity</p>
        </div>
        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-3">Recent Activity</p>
          <p className="text-xs text-[#AEACA8] text-center py-8">No activity yet</p>
        </div>
      </div>
      <div className="bg-white border border-[#D4D3CE] rounded-xl">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#D4D3CE]">
          <p className="text-sm font-semibold text-[#1A1A1A]">E-Way Bill Register</p>
        </div>
        <div className="py-12 text-center text-[#AEACA8] text-sm">No E-Way Bills — feature not connected to live data yet</div>
      </div>
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={`EWB: ${drawer?.ewbNo || ''}`}>
        {drawer && (
          <div className="space-y-3 text-sm text-[#787774]">
            <Badge label={drawer.status} variant={statusVariant[drawer.status]} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
