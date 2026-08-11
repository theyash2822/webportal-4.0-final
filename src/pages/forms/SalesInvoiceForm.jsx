import useFYDates from '../../hooks/useFYDates';
import { useState, useCallback } from 'react';
import { FormField, Input, Select, SectionTitle, Toggle } from '../../components/FormField';
import ItemsTable from '../../components/ItemsTable';
import LogisticsSection from '../../components/LogisticsSection';
import SummaryFooter from '../../components/SummaryFooter';
import { CheckCircle, AlertCircle, Printer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createSalesInvoice, fetchLedgers, fetchPartiesList, fetchSalesLedgerAccounts, unwrapList } from '../../services/api';
import InvoicePDF from '../../components/InvoicePDF';
import LiveSearch from '../../components/LiveSearch';
import { useSettings } from '../../contexts/SettingsContext';

const PAYMENT_TERMS = ['Paid / Due on Receipt', '15 Days', '30 Days', 'Custom'];

export default function SalesInvoiceForm({ onClose }) {
  const { fyMin, fyMax } = useFYDates();
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const { selectedCompany } = useAuth();

  // Same as mobile: GET /api/parties (all Sundry Debtors/Creditors ledgers, up to 500)
  const fetchParties = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    try {
      const res = await fetchPartiesList(selectedCompany.guid, {
        search: q || '',
        type: 'customer',
      });
      const list = unwrapList(res);
      if (list.length) {
        return list.map(l => ({
          label: l.name,
          value: l.name,
          sub: l.parent || '',
          badge: l.gstin ? 'GST' : '',
        }));
      }
    } catch { /* fall through */ }
    // Fallback: any ledger search
    const res = await fetchLedgers({
      companyGuid: selectedCompany.guid,
      searchText: q || '',
      pageSize: 100,
    });
    return (res?.data?.ledgers || [])
      .filter(l => {
        const p = (l.parent || '').toLowerCase();
        return p.includes('debtor') || p.includes('creditor') || !q;
      })
      .map(l => ({ label: l.name, value: l.name, sub: l.parent || '' }));
  }, [selectedCompany?.guid]);

  // Same as mobile: GET /api/sales/ledger-accounts (full Sales Accounts list)
  const fetchSalesLedgers = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    try {
      const res = await fetchSalesLedgerAccounts(selectedCompany.guid);
      const list = unwrapList(res);
      const mapped = list.map(l => ({
        label: l.name,
        value: l.name,
        sub: l.parent || 'Sales Accounts',
      }));
      const qq = (q || '').trim().toLowerCase();
      if (!qq) return mapped;
      return mapped.filter(l => l.label.toLowerCase().includes(qq));
    } catch {
      const res = await fetchLedgers({
        companyGuid: selectedCompany.guid,
        searchText: q || '',
        pageSize: 100,
      });
      return (res?.data?.ledgers || [])
        .filter(l => (l.parent || '').toLowerCase().includes('sales') || (l.name || '').toLowerCase().includes('sales'))
        .map(l => ({ label: l.name, value: l.name, sub: l.parent || '' }));
    }
  }, [selectedCompany?.guid]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdVoucherNumber, setCreatedVoucherNumber] = useState('');
  const [createdPayload, setCreatedPayload] = useState(null);
  const [showPDF, setShowPDF] = useState(false);
  const [isOptional, setIsOptional] = useState(false);

  // Form fields
  const [partyLedger, setPartyLedger] = useState('');
  const [salesLedger, setSalesLedger] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');

  // Items and logistics
  const [items, setItems] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [logistics, setLogistics] = useState([]);

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const taxAmt   = items.reduce((s, i) => s + (parseFloat(i.amount) || 0) * ((parseFloat(i.tax) / 100) || 0), 0);
  const logTotal = logistics.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const total    = subtotal + taxAmt + logTotal;

  const handleSubmit = async () => {
    if (!partyLedger) { setError('Please select a customer / party'); return; }
    if (!salesLedger) { setError('Please select a sales ledger (e.g. Sales, Sales Account GST)'); return; }
    if (items.length === 0 || !items[0]?.name) { setError('Please add at least one item'); return; }
    const missingWh = items.filter(i => i.name && !(i.warehouse || warehouse));
    if (missingWh.length) { setError('Please select a warehouse for each item'); return; }
    if (!selectedCompany) { setError('No company selected'); return; }

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        companyGuid: selectedCompany.guid,
        companyName: selectedCompany.name,
        // Backend expects ISO YYYY-MM-DD (mobile parity). YYYYMMDD breaks app_vouchers date insert.
        date: invoiceDate,
        narration,
        reference,
        partyLedger,
        // Positive party total — backend writes party as -totalAmount (Dr).
        // Exclude UI-estimated taxAmt while taxes:[] (no tax ledger lines) so XML balances.
        // When a real tax-ledger picker lands, include taxAmt again and populate taxes[].
        totalAmount: subtotal + logTotal,
        voucherType: 'Sales',
        isOptional,
        items: items.filter(i => i.name).map(i => ({
          itemName: i.name,
          hsn: i.hsn || '',
          actualQty: i.qty,
          billedQty: i.qty,
          unit: i.unit || 'Nos',
          rate: i.rate,
          tax: i.tax || '18%',
          amount: i.amount,
          salesLedger,
          godown: i.warehouse || warehouse || '',
        })),
        // Do not invent tax ledger names (CGST/SGST). Mobile sends real ledgers only.
        taxes: [],
        logistics: logistics.filter(l => l.amount > 0).map(l => ({ ledgerName: l.type || 'Freight', amount: l.amount })),
      };

      const result = await createSalesInvoice(payload);
      if (result?.status) {
        // Voucher number comes from backend (parsed from Tally XML by desktop)
        // If desktop was offline, result.queued=true and voucherNumber is empty
        const assignedNumber = result?.voucherNumber || '';
        setCreatedVoucherNumber(assignedNumber);
        setCreatedPayload({ ...payload, _queued: result?.queued || false, _queueId: result?.queueId });
        setSubmitted(true);
      } else {
        setError(result?.message || 'Failed to create invoice in Tally');
      }
    } catch (e) {
      setError(e.message || 'Failed to connect to Tally');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDraft = async () => {
    setIsOptional(true);
    await handleSubmit();
  };

  if (submitted) {
    // Build invoice data for PDF
    const invoiceForPDF = createdPayload ? {
      ref: createdVoucherNumber || '(Tally will assign)',
      date: invoiceDate,
      customer: partyLedger,
      gstin: '',
      address: '',
      phone: '',
      items: (createdPayload.items || []).map((item, i) => ({
        name: item.itemName,
        hsn: item.hsn || '',
        qty: item.billedQty,
        unit: item.unit || 'Nos',
        rate: item.rate,
        tax: parseInt(item.tax) || 18,
        amount: item.amount,
      })),
      companyName: selectedCompany?.name,
      companyGstin: selectedCompany?.gstin || '',
      companyAddress: selectedCompany?.address || '',
      subtotal,
      discount: 0,
      cgst: Math.round(taxAmt / 2),
      sgst: Math.round(taxAmt / 2),
      igst: 0,
      total,
      mode: 'Credit',
      terms: 'Payment due within 30 days.',
      narration,
    } : null;

    if (showPDF && invoiceForPDF) {
      return <InvoicePDF open={true} onClose={() => setShowPDF(false)} invoice={invoiceForPDF} companyGuid={selectedCompany?.guid} />;
    }

    const isQueued = createdPayload?._queued;
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center border ${
          isQueued ? 'bg-amber-50 border-amber-200' : 'bg-[#E8F5ED] border-[#A8D5BC]'
        }`}>
          <CheckCircle size={32} className={isQueued ? 'text-amber-500' : 'text-[#2D7D46]'} />
        </div>
        <p className="text-base font-semibold text-[#1A1A1A]">
          {isQueued ? 'Entry Saved — Waiting for Desktop' : isOptional ? 'Optional Entry Saved!' : 'Sales Invoice Created in Tally!'}
        </p>
        {createdVoucherNumber ? (
          <p className="text-sm font-mono font-bold text-[#1A1A1A] bg-[#ECEEEF] px-3 py-1 rounded-lg">
            {createdVoucherNumber}
          </p>
        ) : isQueued ? (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-center max-w-xs">
            Desktop app is offline. Entry is queued and will push to Tally automatically when desktop connects.
          </p>
        ) : null}
        <p className="text-sm text-[#787774]">{selectedCompany?.name} · ₹{total.toLocaleString('en-IN')}</p>
        <p className="text-xs text-[#AEACA8]">
          {isQueued ? 'Check Audit Trail → My Entries to retry manually' : isOptional ? 'Saved as optional entry — will not affect books until approved' : 'Entry posted to Tally books'}
        </p>
        <div className="flex gap-3 mt-2 flex-wrap justify-center">
          {invoiceForPDF && (
            <button onClick={() => setShowPDF(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#1A1A1A] hover:bg-[#333] transition-colors">
              <Printer size={14} /> View / Print PDF
            </button>
          )}
          <button onClick={() => { setSubmitted(false); setPartyLedger(''); setItems([]); setNarration(''); setReference(''); setCreatedVoucherNumber(''); }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">
            Create Another
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Company + Optional toggle */}
      <div className="flex items-center justify-between p-3 bg-[#F5F4EF] rounded-xl border border-[#D4D3CE]">
        <div>
          <p className="text-xs text-[#AEACA8]">Company</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{selectedCompany?.name || 'No company selected'}</p>
        </div>
        <button
          onClick={() => setIsOptional(p => !p)}
          className={`px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors ${
            isOptional ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]' : 'bg-[#E8F5ED] text-[#2D7D46] border-[#BBF7D0]'
          }`}
        >
          {isOptional ? 'Optional Entry' : 'Regular Entry'}
        </button>
      </div>
      {isOptional && (
        <p className="text-xs text-[#D97706] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
          Optional entry — saved in Tally but does NOT affect books until you convert it to regular.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Customer / Party" required>
          <LiveSearch
            value={partyLedger}
            onChange={setPartyLedger}
            placeholder="Search party name..."
            fetchFn={fetchParties}
          />
        </FormField>
        <FormField label="Sales Ledger" required>
          <LiveSearch
            value={salesLedger}
            onChange={setSalesLedger}
            placeholder="Search sales ledger..."
            fetchFn={fetchSalesLedgers}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Invoice Date" required>
          <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} min={fyMin || undefined} max={fyMax || undefined} />
        </FormField>
        <FormField label="Reference No">
          <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="PO/SO reference" />
        </FormField>
      </div>

      <SectionTitle title="Items / Services" subtitle="Add products with qty, rate and tax" />
      <ItemsTable warehouse={warehouse} onWarehouseChange={setWarehouse} onItemsChange={setItems} />

      <SectionTitle title="Logistics / Shipping" subtitle="Optional" />
      <LogisticsSection onLogisticsChange={setLogistics} />

      <SectionTitle title="Narration" />
      <textarea rows={2} value={narration} onChange={e => setNarration(e.target.value)}
        placeholder="Optional narration for this invoice"
        className="notion-input w-full text-sm resize-none" />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-sm text-[#C0392B]">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <SummaryFooter
        subtotal={subtotal}
        tax={Math.round(taxAmt)}
        logistics={logTotal}
        onSubmit={handleSubmit}
        onDraft={handleDraft}
        submitLabel={submitting ? 'Submitting...' : 'Submit to Tally'}
        showDraft={true}
      />
    </div>
  );
}
