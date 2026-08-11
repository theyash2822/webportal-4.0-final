import useFYDates from '../../hooks/useFYDates';
import { useState, useCallback } from 'react';
import { FormField, Input, Select, SectionTitle, Textarea } from '../../components/FormField';
import SummaryFooter from '../../components/SummaryFooter';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLedgers, fetchPartiesList, fetchBankLedgers as fetchBankLedgersAPI, unwrapList } from '../../services/api';
import LiveSearch from '../../components/LiveSearch';
import { createPaymentVoucher, createReceiptVoucher, createJournalVoucher, createContraVoucher } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';

const VOUCHER_TYPES = ['Payment', 'Receipt', 'Journal', 'Contra'];

export default function VoucherForm({ onClose, initialType = 'Payment' }) {
  const { fyMin, fyMax } = useFYDates();
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  const { selectedCompany } = useAuth();

  const fetchAllLedgers = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    const res = await fetchLedgers({ companyGuid: selectedCompany.guid, searchText: q || '', pageSize: 30 });
    return (res?.data?.ledgers || []).map(l => ({ label: l.name, value: l.name, sub: l.parent || '', badge: l.balance_type }));
  }, [selectedCompany?.guid]);

  const fetchParties = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    try {
      const res = await fetchPartiesList(selectedCompany.guid, { search: q || '', searchText: q || '', limit: 30 });
      const list = unwrapList(res);
      if (list.length) {
        return list.map(l => ({
          label: l.name,
          value: l.name,
          sub: l.parent || l.parent_name || l.type || '',
        }));
      }
    } catch { /* fall through */ }
    return fetchAllLedgers(q);
  }, [selectedCompany?.guid, fetchAllLedgers]);

  const fetchBankLedgers = useCallback(async (q) => {
    if (!selectedCompany?.guid) return [];
    try {
      const res = await fetchBankLedgersAPI(selectedCompany.guid, 'all');
      const list = unwrapList(res);
      const mapped = list.map(l => ({
        label: l.name,
        value: l.name,
        sub: l.type || l.parent || '',
        badge: l.balance != null ? String(l.balance) : undefined,
      }));
      const qq = (q || '').trim().toLowerCase();
      if (!qq) return mapped;
      return mapped.filter(l => l.label.toLowerCase().includes(qq) || (l.sub || '').toLowerCase().includes(qq));
    } catch {
      const res = await fetchLedgers({ companyGuid: selectedCompany.guid, searchText: q || 'bank', pageSize: 30 });
      return (res?.data?.ledgers || [])
        .filter(l => ['bank', 'cash', 'wallet'].some(k =>
          (l.parent || '').toLowerCase().includes(k) || (l.name || '').toLowerCase().includes(k)))
        .map(l => ({ label: l.name, value: l.name, sub: l.parent || '' }));
    }
  }, [selectedCompany?.guid]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdNumber, setCreatedNumber] = useState('');
  const [type, setType] = useState(initialType || 'Payment');
  const [isOptional, setIsOptional] = useState(false);

  // Common fields
  const [partyLedger, setPartyLedger] = useState('');
  const [bankLedger, setBankLedger] = useState('');
  const [drLedger, setDrLedger] = useState('');
  const [crLedger, setCrLedger] = useState('');
  const [fromLedger, setFromLedger] = useState('');
  const [toLedger, setToLedger] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');

  const numAmount = parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!selectedCompany) { setError('No company selected'); return; }
    if (!numAmount) { setError('Please enter an amount'); return; }

    setError('');
    setSubmitting(true);

    try {
      const base = {
        companyGuid: selectedCompany.guid,
        companyName: selectedCompany.name,
        date: date,
        narration,
        reference,
        amount: numAmount,
        isOptional,
      };

      let result;
      if (type === 'Payment') {
        if (!partyLedger || !bankLedger) { setError('Party and bank/cash ledger required'); setSubmitting(false); return; }
        result = await createPaymentVoucher({
          ...base, partyLedger, bankLedger, ledgerAccount: bankLedger, paymentMethod: 'Cash',
        });
      } else if (type === 'Receipt') {
        if (!partyLedger || !bankLedger) { setError('Party and bank/cash ledger required'); setSubmitting(false); return; }
        result = await createReceiptVoucher({
          ...base, partyLedger, bankLedger, ledgerAccount: bankLedger, paymentMethod: 'Cash',
        });
      } else if (type === 'Journal') {
        if (!drLedger || !crLedger) { setError('Dr and Cr ledger required'); setSubmitting(false); return; }
        result = await createJournalVoucher({ ...base, drLedger, crLedger });
      } else if (type === 'Contra') {
        if (!fromLedger || !toLedger) { setError('From and To ledger required'); setSubmitting(false); return; }
        result = await createContraVoucher({ ...base, fromLedger, toLedger });
      }

      if (result?.status) {
        // Voucher number from backend (parsed from Tally XML by desktop)
        setCreatedNumber(result?.voucherNumber || '');
        setSubmitted(true);
      } else {
        setError(result?.message || 'Failed to create voucher in Tally');
      }
    } catch (e) {
      setError(e.message || 'Failed to connect to Tally');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#E8F5ED] flex items-center justify-center border border-[#A8D5BC]">
          <CheckCircle size={32} className="text-[#2D7D46]" />
        </div>
        <p className="text-base font-semibold text-[#1A1A1A]">{type} Voucher Created in Tally!</p>
        {createdNumber && (
          <p className="text-sm font-mono font-bold text-[#1A1A1A] bg-[#ECEEEF] px-3 py-1 rounded-lg">
            {createdNumber}
          </p>
        )}
        <p className="text-sm text-[#787774]">{selectedCompany?.name} · ₹{numAmount.toLocaleString('en-IN')}</p>
        <p className="text-xs text-[#AEACA8]">{isOptional ? 'Saved as optional entry' : 'Posted to Tally books'}</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setSubmitted(false); setAmount(''); setPartyLedger(''); setBankLedger(''); }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">
            New Voucher
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#1A1A1A] hover:bg-[#333] transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Company + Optional */}
      <div className="flex items-center justify-between p-3 bg-[#F5F4EF] rounded-xl border border-[#D4D3CE]">
        <div>
          <p className="text-xs text-[#AEACA8]">Company</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{selectedCompany?.name || 'No company selected'}</p>
        </div>
        <button onClick={() => setIsOptional(p => !p)}
          className={`px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors ${
            isOptional ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]' : 'bg-[#E8F5ED] text-[#2D7D46] border-[#BBF7D0]'
          }`}>
          {isOptional ? 'Optional Entry' : 'Regular Entry'}
        </button>
      </div>

      {/* Voucher type */}
      <FormField label="Voucher Type" required>
        <div className="flex gap-2">
          {VOUCHER_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                type === t ? 'bg-[#1A1A1A] text-white border-transparent' : 'border-[#D4D3CE] text-[#787774] hover:border-[#1A1A1A]'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" required>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} min={fyMin || undefined} max={fyMax || undefined} />
        </FormField>
        <FormField label="Amount (₹)" required>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" prefix="₹" />
        </FormField>
      </div>

      {/* Payment / Receipt */}
      {(type === 'Payment' || type === 'Receipt') && (
        <div className="grid grid-cols-1 gap-4">
          <FormField label={type === 'Payment' ? 'Pay To (Party)' : 'Receive From (Party)'} required>
            <LiveSearch
              value={partyLedger}
              onChange={setPartyLedger}
              placeholder="Search party / ledger..."
              fetchFn={fetchParties}
            />
          </FormField>
          <FormField label={type === 'Payment' ? 'Pay From (Bank/Cash)' : 'Deposit To (Bank/Cash)'} required>
            <LiveSearch
              value={bankLedger}
              onChange={setBankLedger}
              placeholder="Search bank / cash ledger..."
              fetchFn={fetchBankLedgers}
            />
          </FormField>
        </div>
      )}

      {/* Journal */}
      {type === 'Journal' && (
        <div className="grid grid-cols-1 gap-4">
          <FormField label="Debit Ledger (Dr)" required>
            <LiveSearch value={drLedger} onChange={setDrLedger} placeholder="Search debit ledger..." fetchFn={fetchAllLedgers} />
          </FormField>
          <FormField label="Credit Ledger (Cr)" required>
            <LiveSearch value={crLedger} onChange={setCrLedger} placeholder="Search credit ledger..." fetchFn={fetchAllLedgers} />
          </FormField>
        </div>
      )}

      {/* Contra */}
      {type === 'Contra' && (
        <div className="grid grid-cols-1 gap-4">
          <FormField label="Transfer From" required>
            <LiveSearch value={fromLedger} onChange={setFromLedger} placeholder="Search source ledger..." fetchFn={fetchBankLedgers} />
          </FormField>
          <FormField label="Transfer To" required>
            <LiveSearch value={toLedger} onChange={setToLedger} placeholder="Search destination ledger..." fetchFn={fetchBankLedgers} />
          </FormField>
        </div>
      )}

      <FormField label="Narration">
        <Input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Optional narration" />
      </FormField>
      <FormField label="Reference">
        <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no / UTR / Reference" />
      </FormField>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-sm text-[#C0392B]">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <SummaryFooter
        subtotal={numAmount}
        onSubmit={handleSubmit}
        onDraft={() => { setIsOptional(true); handleSubmit(); }}
        submitLabel={submitting ? 'Submitting...' : `Submit ${type} to Tally`}
        showDraft={true}
      />
    </div>
  );
}
