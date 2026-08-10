import useFYDates from '../../hooks/useFYDates';
import { useState, useCallback } from 'react';
import { FormField, Input, SectionTitle, Toggle } from '../../components/FormField';
import ItemsTable from '../../components/ItemsTable';
import SummaryFooter from '../../components/SummaryFooter';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLedgers, createDeliveryNote } from '../../services/api';
import LiveSearch from '../../components/LiveSearch';

export default function DeliveryNoteForm({ onClose }) {
  const { fyMin, fyMax } = useFYDates();
  const { selectedCompany } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdNumber, setCreatedNumber] = useState('');
  const [isOptional, setIsOptional] = useState(false);
  const [partyLedger, setPartyLedger] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [items, setItems] = useState([]);
  const [warehouse, setWarehouse] = useState('');

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const taxAmt   = items.reduce((s, i) => s + (parseFloat(i.amount) || 0) * 0.18, 0);

  const fetchParties = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchLedgers({ companyGuid: selectedCompany.guid, searchText: q, pageSize: 20 });
    return (res?.data?.ledgers || []).map(l => ({ label: l.name, value: l.name, sub: l.parent || '', badge: l.gstin ? 'GST' : '' }));
  }, [selectedCompany?.guid]);

  const handleSubmit = async () => {
    if (!partyLedger) { setError('Please select a customer / party'); return; }
    if (!selectedCompany) { setError('No company selected'); return; }
    setSubmitting(true); setError('');
    try {
      const result = await createDeliveryNote({
        companyGuid: selectedCompany.guid, companyName: selectedCompany.name,
        date: date.replace(/-/g, ''), partyLedger,
        amount: subtotal,
        items: items.filter(i => i.name).map(i => ({ itemName: i.name, billedQty: parseFloat(i.qty)||1, rate: parseFloat(i.rate)||0, amount: parseFloat(i.amount)||0 })),
        narration, reference, isOptional,
      });
      if (result?.status) { setCreatedNumber(result?.voucherNumber || ''); setSubmitted(true); }
      else setError(result?.message || 'Failed');
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#E8F5ED] flex items-center justify-center border border-[#A8D5BC]">
          <CheckCircle size={32} className="text-[#2D7D46]" />
        </div>
        <p className="text-base font-semibold text-[#1A1A1A]">Delivery Note Created in Tally!</p>
        {createdNumber && <p className="text-sm font-mono font-bold text-[#1A1A1A] bg-[#ECEEEF] px-3 py-1 rounded-lg">{createdNumber}</p>}
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setSubmitted(false); setPartyLedger(''); setItems([]); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">Create Another</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Toggle label="Optional Entry" value={isOptional} onChange={setIsOptional} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Customer / Party" required>
          <LiveSearch value={partyLedger} onChange={setPartyLedger} placeholder="Search customer / party..." fetchFn={fetchParties} />
        </FormField>
        <FormField label="Reference / Original Invoice">
          <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. SI-2025-001" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" required><Input type="date" value={date} onChange={e => setDate(e.target.value)} min={fyMin || undefined} max={fyMax || undefined} /></FormField>
      </div>
      <SectionTitle title="Items / Services" subtitle="Products being returned / noted" />
      <ItemsTable warehouse={warehouse} onWarehouseChange={setWarehouse} onItemsChange={setItems} />
      <SectionTitle title="Narration" />
      <textarea rows={2} value={narration} onChange={e => setNarration(e.target.value)} placeholder="Reason for delivery note" className="notion-input w-full text-sm resize-none" />
      {error && <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-sm text-[#C0392B]"><AlertCircle size={14} />{error}</div>}
      <SummaryFooter subtotal={subtotal} tax={Math.round(taxAmt)} onSubmit={handleSubmit} submitLabel={submitting ? 'Submitting...' : 'Submit to Tally'} showDraft={true} />
    </div>
  );
}
