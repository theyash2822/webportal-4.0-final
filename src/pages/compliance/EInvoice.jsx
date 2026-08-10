import { FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import KPICard from '../../components/KPICard';

export default function EInvoice() {
  return (
    <div className="space-y-5">
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
        Coming soon — not connected to live Tally data yet
      </div>
      <div>
        <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">E-Invoice</h1>
        <p className="text-sm text-[#787774] mt-0.5">IRN dashboard</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="IRNs Generated" value="—" icon={FileText} accent="#1A1A1A" />
        <KPICard title="IRN Errors" value="—" icon={AlertTriangle} accent="#C0392B" />
        <KPICard title="IRNs Pending" value="—" icon={Clock} accent="#D97706" />
        <KPICard title="Success Rate" value="—" icon={CheckCircle} accent="#2D7D46" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Daily IRN Trend</p>
          <p className="text-xs text-[#AEACA8] py-12 text-center">No live IRN data yet</p>
        </div>
        <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
          <p className="text-sm font-semibold text-[#1A1A1A] mb-4">Top Error Types</p>
          <p className="text-xs text-[#AEACA8] py-8 text-center">No errors to show</p>
        </div>
      </div>
      <div className="bg-white border border-[#D4D3CE] rounded-xl p-5">
        <p className="text-sm font-semibold text-[#1A1A1A] mb-4">Recent Activity</p>
        <p className="text-xs text-[#AEACA8] py-8 text-center">No activity yet</p>
      </div>
    </div>
  );
}
