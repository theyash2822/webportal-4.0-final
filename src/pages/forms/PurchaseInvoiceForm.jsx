import useFYDates from '../../hooks/useFYDates';
import { useState, useCallback } from 'react';
import { FormField, Input, Select, SectionTitle, Toggle } from '../../components/FormField';
import ItemsTable from '../../components/ItemsTable';
import LogisticsSection from '../../components/LogisticsSection';
import SummaryFooter from '../../components/SummaryFooter';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLedgers, fetchStocks, fetchParties as fetchPartiesAPI } from '../../services/api';
import LiveSearch from '../../components/LiveSearch';
import { createPurchaseInvoice } from '../../services/api';

export default function PurchaseInvoiceForm({ onClose }) {
  const { fyMin, fyMax } = useFYDates();
  const { selectedCompany } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdNumber, setCreatedNumber] = useState('');
  const [isOptional, setIsOptional] = useState(false);

  const [partyLedger, setPartyLedger] = useState('');
  const [purchaseLedger, setPurchaseLedger] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [narration, setNarration] = useState('');
  const [items, setItems] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [logistics, setLogistics] = useState([]);

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const taxAmt   = items.reduce((s, i) => s + (parseFloat(i.amount) || 0) * ((parseFloat(i.tax) / 100) || 0.18), 0);
  const logTotal = logistics.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const fetchVendors = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchPartiesAPI({ companyGuid: selectedCompany.guid, searchText: q || '', pageSize: 30 });
    return (res?.data?.parties || []).map(l => ({ label: l.name, value: l.name, sub: l.parent || '' }));
  }, [selectedCompany?.guid]);

  const fetchPurchaseLedgers = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchLedgers({ companyGuid: selectedCompany.guid, searchText: q || 'purchase', pageSize: 15 });
    return (res?.data?.ledgers || [])
      .filter(l => (l.parent || '').toLowerCase().includes('purchase') || (l.name || '').toLowerCase().includes('purchase'))
      .map(l => ({ label: l.name, value: l.name, sub: l.parent || '' }));
  }, [selectedCompany?.guid]);

  const handleSubmit = async () => {
    if (!partyLedger) { setError('Please select a vendor / party'); return; }
    if (!purchaseLedger) { setError('Please select a purchase ledger'); return; }
    if (!items.length || !items[0]?.name) { setError('Please add at least one item'); return; }
    if (!selectedCompany) { setError('No company selected'); return; }
    setSubmitting(true); setError('');
    try {
      const result = await createPurchaseInvoice({
        companyGuid: selectedCompany.guid, companyName: selectedCompany.name,
        date: invoiceDate.replace(/-/g, ''), partyLedger,
        purchaseLedger: purchaseLedger,
        items: items.filter(i => i.name).map(i => ({
          itemName: i.name, billedQty: parseFloat(i.qty) || 1,
          rate: parseFloat(i.rate) || 0, amount: parseFloat(i.amount) || 0,
          purchaseLedger,
          godown: warehouse || '', taxPercent: parseFloat(i.tax) || 18,
        })),
        narration, isOptional,
      });
      if (result?.status) { setCreatedNumber(result?.voucherNumber || ''); setSubmitted(true); }
      else setError(result?.message || 'Failed to create purchase invoice');
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#E8F5ED] flex items-center justify-center border border-[#A8D5BC]">
          <CheckCircle size={32} className="text-[#2D7D46]" />
        </div>
        <p className="text-base font-semibold text-[#1A1A1A]">{isOptional ? 'Optional Entry Saved!' : 'Purchase Invoice Created in Tally!'}</p>
        {createdNumber && <p className="text-sm font-mono font-bold text-[#1A1A1A] bg-[#ECEEEF] px-3 py-1 rounded-lg">{createdNumber}</p>}
        <p className="text-sm text-[#787774]">{selectedCompany?.name}</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setSubmitted(false); setPartyLedger(''); setItems([]); setNarration(''); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">Create Another</button>
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
        <FormField label="Vendor / Party" required>
          <LiveSearch value={partyLedger} onChange={setPartyLedger} placeholder="Search vendor..." fetchFn={fetchVendors} />
        </FormField>
        <FormField label="Purchase Ledger" required>
          <LiveSearch value={purchaseLedger} onChange={setPurchaseLedger} placeholder="Search purchase ledger..." fetchFn={fetchPurchaseLedgers} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Invoice Date" required><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} min={fyMin || undefined} max={fyMax || undefined} /></FormField>
        <FormField label="Vendor Invoice No"><Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Vendor's invoice number" /></FormField>
      </div>

      <SectionTitle title="Items / Services" subtitle="Add products with qty, rate and tax" />
      <ItemsTable warehouse={warehouse} onWarehouseChange={setWarehouse} onItemsChange={setItems} />

      <SectionTitle title="Logistics / Shipping" subtitle="Optional" />
      <LogisticsSection onLogisticsChange={setLogistics} />

      <SectionTitle title="Narration" />
      <textarea rows={2} value={narration} onChange={e => setNarration(e.target.value)} placeholder="Optional narration" className="notion-input w-full text-sm resize-none" />

      {error && <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-sm text-[#C0392B]"><AlertCircle size={14} />{error}</div>}

      <SummaryFooter subtotal={subtotal} tax={Math.round(taxAmt)} logistics={logTotal} onSubmit={handleSubmit} submitLabel={submitting ? 'Submitting...' : 'Submit to Tally'} showDraft={true} />
    </div>
  );
}
