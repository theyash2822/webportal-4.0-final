import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import { Button, Field, Input, Textarea, useLabelT } from '../kit';
import {
  BillAllocations,
  DoneState,
  EntryTypeToggle,
  FormError,
  FormSection,
  SearchSelect,
  ToggleRow,
  billAllocationsPayload,
  num,
  todayISO,
  inr,
  useCreateData,
  useSubmit,
  useNumberingPolicy,
} from './common';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { INR_NOTES, sumDenomCounts, emptyDenomCounts, autoSplitAmount } from '../../utils/cashDenominations';

const METHODS = ['Cash', 'Bank', 'Cheque', 'NEFT', 'RTGS', 'UPI'];
const INSTRUMENT_METHODS = ['Cheque', 'NEFT', 'RTGS'];
const REF_LABELS = {
  Bank: 'Reference No.',
  Cheque: 'Cheque No.',
  NEFT: 'NEFT UTR',
  RTGS: 'RTGS UTR',
  UPI: 'UPI Ref ID',
};

const parentOf = row => String(
  row?.parent || row?.parent_name || row?.parentName || row?.group_name || row?.group || '',
);
const rowName = row => typeof row === 'string' ? row : row?.name || row?.ledger_name || '';
const containsParent = (row, text) => parentOf(row).toLowerCase().includes(text.toLowerCase());
const companyName = company => company?.name || company?.companyName || '';
const balanceNumber = value => {
  if (value == null || value === '') return null;
  const parsed = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
};

function LoadingError({ loading, error, retry }) {
  const lt = useLabelT();
  if (loading) return <p className="py-8 text-center text-[13px] text-ink-faint">{lt('Loading form data…')}</p>;
  if (!error) return null;
  return (
    <div className="space-y-3">
      <FormError error={error} />
      <Button onClick={retry}>{lt('Try again')}</Button>
    </div>
  );
}

function Complete({ done, title, onClose, testid }) {
  const lt = useLabelT();
  return (
    <>
      <DoneState done={done} title={title} />
      <Button variant="primary" className="w-full" onClick={onClose} data-testid={testid}>{lt('Done')}</Button>
    </>
  );
}

function MethodPills({ value, onChange, prefix }) {
  const lt = useLabelT();
  return (
    <div className="flex flex-wrap gap-2" data-testid={`${prefix}-method`}>
      {METHODS.map(method => (
        <button
          key={method}
          type="button"
          data-testid={`${prefix}-method-${method.toLowerCase()}`}
          onClick={() => onChange(method)}
          className={`h-9 rounded-lg border px-3 text-[12px] font-medium transition-colors ${
            value === method ? 'border-ink bg-ink text-white' : 'border-line bg-cream text-ink-soft hover:border-ink'
          }`}
        >
          {lt(method)}
        </button>
      ))}
    </div>
  );
}

function MoneyVoucherForm({ direction, onClose, onCreated }) {
  const lt = useLabelT();
  const isPayment = direction === 'payment';
  const prefix = isPayment ? 'payment' : 'receipt';
  const title = isPayment ? 'Payment' : 'Receipt';
  const { loading, error: loadError, opt, company, retry } = useCreateData(['parties']);
  const { selectedFY } = useAuth();
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const { saving, error, setError, done, run } = useSubmit();
  const [entryType, setEntryType] = useState('regular');
  const [date, setDate] = useState(todayISO());
  const [party, setParty] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [ledger, setLedger] = useState('');
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [reference, setReference] = useState('');
  const [instrumentDate, setInstrumentDate] = useState(todayISO());
  const [bankName, setBankName] = useState('');
  const [narration, setNarration] = useState('');
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [allocations, setAllocations] = useState({});
  const [remainderMode, setRemainderMode] = useState('On Account');

  useEffect(() => {
    if (entryType === 'regular') setDate(todayISO());
  }, [entryType]);

  useEffect(() => {
    if (!company?.guid) return;
    let alive = true;
    setLedger('');
    setLedgerLoading(true);
    api.fetchBankLedgers(company.guid, method === 'Cash' ? 'cash' : 'bank')
      .then(res => { if (alive) setLedgerRows(api.unwrapList(res)); })
      .catch(() => { if (alive) setError('Unable to load cash and bank ledgers.'); })
      .finally(() => { if (alive) setLedgerLoading(false); });
    return () => { alive = false; };
  }, [company?.guid, method, setError]);

  useEffect(() => {
    setAllocations({});
    setBills([]);
    if (!company?.guid || !party) return;
    let alive = true;
    setBillsLoading(true);
    api.fetchOutstandingBills(company.guid, party, isPayment ? { crOnly: true } : { drOnly: true })
      .then(res => { if (alive) setBills(api.unwrapList(res)); })
      .catch(() => { if (alive) setError('Unable to load outstanding bills for this party.'); })
      .finally(() => { if (alive) setBillsLoading(false); });
    return () => { alive = false; };
  }, [company?.guid, party, isPayment, setError]);

  const parties = useMemo(() => {
    const rows = opt.parties || [];
    if (showAll) return rows;
    return rows.filter(row => containsParent(row, isPayment ? 'Creditor' : 'Debtor'));
  }, [opt.parties, showAll, isPayment]);

  const submit = async () => {
    const allocated = Object.values(allocations).reduce((sum, value) => sum + num(value), 0);
    if (!date) return setError('Date is required.');
    if (!party) return setError('Party ledger is required.');
    if (num(amount) <= 0) return setError(`${title} amount must be greater than zero.`);
    if (!ledger) return setError(`${method === 'Cash' ? 'Cash' : 'Bank'} ledger is required.`);
    if (allocated - num(amount) > 0.01) return setError('Bill allocation cannot exceed the voucher amount.');
    if (INSTRUMENT_METHODS.includes(method) && !instrumentDate) return setError('Instrument date is required.');

    const payload = {
      companyGuid: company.guid,
      companyName: companyName(company),
      date,
      amount: num(amount),
      partyLedger: party,
      ledgerAccount: ledger,
      paymentMethod: method,
      billAllocations: billAllocationsPayload(allocations, amount, remainderMode),
      entryType,
      numbering_policy: numberingPolicy,
      reference: reference.trim() || undefined,
      narration: narration.trim() || undefined,
    };
    if (INSTRUMENT_METHODS.includes(method)) {
      payload.instrumentDetails = {
        instrumentNo: reference.trim(),
        instrumentDate,
        bankName: bankName.trim(),
        transactionType: undefined,
      };
    }
    const result = await run(() => isPayment
      ? api.createPaymentVoucher(payload)
      : api.createReceiptVoucher(payload));
    if (result) onCreated?.();
  };

  if (done) return <Complete done={done} title={title} onClose={onClose} testid={`${prefix}-done`} />;
  if (loading || loadError) return <LoadingError loading={loading} error={loadError} retry={retry} />;

  return (
    <div className="space-y-4">
      <FormSection title={`${title} details`} sub="Voucher essentials" testid={`${prefix}-essentials`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EntryTypeToggle value={entryType} onChange={setEntryType} testid={`${prefix}-entry-type`} />
          <Field label="Date *" hint={entryType === 'regular' ? 'Regular vouchers use today’s date.' : undefined}>
            <Input type="date" value={date} disabled={entryType === 'regular'} max={todayISO()}
              min={entryType === 'optional' ? selectedFY?.startDate : undefined}
              onChange={e => setDate(e.target.value)} data-testid={`${prefix}-date`} />
          </Field>
          <Field label="Party ledger *" className="sm:col-span-2">
            <SearchSelect value={party} onChange={setParty} options={parties} required
              subOf={parentOf} placeholder="Select party…" testid={`${prefix}-party`} />
          </Field>
          <div className="sm:col-span-2">
            <ToggleRow label="Show all parties" hint={`Default: Sundry ${isPayment ? 'Creditors' : 'Debtors'}`}
              checked={showAll} onChange={setShowAll} testid={`${prefix}-show-all-parties`} />
          </div>
          <Field label={`${title} amount (₹) *`}>
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}
              data-testid={`${prefix}-amount`} />
          </Field>
        </div>
      </FormSection>

      {party && (
        <FormSection title="Bill allocation" sub="Settle outstanding references" testid={`${prefix}-bill-section`}>
          {billsLoading
            ? <p className="text-[12px] text-ink-faint">{lt('Loading outstanding bills…')}</p>
            : <BillAllocations bills={bills} allocations={allocations} setAllocations={setAllocations}
                amount={amount} remainderMode={remainderMode} setRemainderMode={setRemainderMode}
                testid={`${prefix}-bills`} />}
        </FormSection>
      )}

      <FormSection title="Payment method" sub="Cash, bank or instrument details" testid={`${prefix}-method-section`}>
        <div className="space-y-4">
          <Field label="Method *"><MethodPills value={method} onChange={setMethod} prefix={prefix} /></Field>
          <Field label={`${method === 'Cash' ? 'Cash' : 'Bank'} ledger *`}>
            <SearchSelect value={ledger} onChange={setLedger} options={ledgerRows} required disabled={ledgerLoading}
              subOf={parentOf} placeholder={ledgerLoading ? 'Loading ledgers…' : 'Select ledger…'}
              testid={`${prefix}-ledger`} />
          </Field>
          {method !== 'Cash' && (
            <Field label={REF_LABELS[method]}>
              <Input value={reference} onChange={e => setReference(e.target.value)} data-testid={`${prefix}-reference`} />
            </Field>
          )}
          {INSTRUMENT_METHODS.includes(method) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Instrument date *">
                <Input type="date" value={instrumentDate} onChange={e => setInstrumentDate(e.target.value)}
                  data-testid={`${prefix}-instrument-date`} />
              </Field>
              <Field label="Bank name">
                <Input value={bankName} onChange={e => setBankName(e.target.value)} data-testid={`${prefix}-bank-name`} />
              </Field>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection title="Notes" defaultOpen={false} testid={`${prefix}-notes-section`}>
        <Field label="Narration">
          <Textarea value={narration} onChange={e => setNarration(e.target.value)} data-testid={`${prefix}-narration`} />
        </Field>
      </FormSection>
      <FormError error={error} testid={`${prefix}-error`} />
      <Button variant="primary" className="w-full" disabled={saving} onClick={submit} data-testid={`${prefix}-submit`}>
        {saving ? lt('Saving…') : <>{lt('Save')} {lt(title)}</>}
      </Button>
    </div>
  );
}

export function PaymentForm({ onClose, onCreated }) {
  return <MoneyVoucherForm direction="payment" onClose={onClose} onCreated={onCreated} />;
}

export function ReceiptForm({ onClose, onCreated }) {
  return <MoneyVoucherForm direction="receipt" onClose={onClose} onCreated={onCreated} />;
}

const DEPRECIATION_RATES = [
  ['Buildings residential', 5, 'Buildings'],
  ['Buildings general', 10, 'Buildings'],
  ['Temporary structures', 40, 'Buildings'],
  ['Furniture & fittings', 10, 'Furniture and fittings'],
  ['Plant & machinery general', 15, 'Plant and machinery'],
  ['Motor cars', 15, 'Plant and machinery'],
  ['Motor buses/lorries hire', 30, 'Plant and machinery'],
  ['Computers incl. software', 40, 'Plant and machinery'],
  ['Ships', 20, 'Ships'],
  ['Intangible assets', 25, 'Intangible assets'],
].map(([displayName, ratePercent, assetBlock]) => ({ name: `${displayName} — ${ratePercent}%`, displayName, ratePercent, assetBlock }));

export function JournalForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { loading, error: loadError, opt, company, retry } = useCreateData(['ledgers']);
  const { selectedFY } = useAuth();
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const { saving, error, setError, done, run } = useSubmit();
  const [entryType, setEntryType] = useState('regular');
  const [date, setDate] = useState(todayISO());
  const [drLedger, setDrLedger] = useState('');
  const [crLedger, setCrLedger] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [depreciation, setDepreciation] = useState(false);
  const [baseWdv, setBaseWdv] = useState('');
  const [assetClosingFetched, setAssetClosingFetched] = useState(null);
  const [rateName, setRateName] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [rateMeta, setRateMeta] = useState(null);
  const [amountManual, setAmountManual] = useState(false);

  useEffect(() => {
    if (entryType === 'regular') setDate(todayISO());
  }, [entryType]);

  useEffect(() => {
    if (!depreciation || amountManual) return;
    setAmount(baseWdv && ratePercent ? String(+(num(baseWdv) * num(ratePercent) / 100).toFixed(2)) : '');
  }, [depreciation, baseWdv, ratePercent, amountManual]);

  const selectCredit = (name, row) => {
    setCrLedger(name);
    if (!depreciation) return;
    const raw = row?.closing_balance ?? row?.closingBalance ?? row?.balance;
    const closing = balanceNumber(raw);
    setAssetClosingFetched(closing);
    if (closing != null) setBaseWdv(String(closing));
  };

  const submit = async () => {
    if (!drLedger || !crLedger) return setError('Both debit and credit ledgers are required.');
    if (drLedger === crLedger) return setError('Debit and credit ledgers must be different.');
    if (num(amount) <= 0) return setError('Amount must be greater than zero.');
    if (depreciation && num(baseWdv) <= 0) return setError('Base WDV must be greater than zero.');
    if (depreciation && (!rateMeta || num(ratePercent) <= 0)) return setError('Select a depreciation block and enter a valid rate.');
    const payload = {
      companyGuid: company.guid,
      companyName: companyName(company),
      date,
      amount: num(amount),
      drLedger,
      crLedger,
      entryType,
      numbering_policy: numberingPolicy,
      narration: narration.trim() || undefined,
    };
    if (depreciation) {
      payload.depreciationMeta = {
        method: 'direct_write_down',
        baseWdv: num(baseWdv),
        ratePercent: num(ratePercent),
        assetLedger: crLedger,
        expenseLedger: drLedger,
        assetClosingFetched,
        assetBlock: rateMeta.assetBlock || null,
        displayName: rateMeta.displayName || null,
      };
    }
    const result = await run(() => api.createJournalVoucher(payload));
    if (result) onCreated?.();
  };

  if (done) return <Complete done={done} title="Journal" onClose={onClose} testid="journal-done" />;
  if (loading || loadError) return <LoadingError loading={loading} error={loadError} retry={retry} />;

  return (
    <div className="space-y-4">
      <FormSection title="Journal details" sub="Debit and credit entry" testid="journal-essentials">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EntryTypeToggle value={entryType} onChange={setEntryType} testid="journal-entry-type" />
          <Field label="Date *" hint={entryType === 'regular' ? 'Regular vouchers use today’s date.' : undefined}>
            <Input type="date" value={date} disabled={entryType === 'regular'}
              min={entryType === 'optional' ? selectedFY?.startDate : undefined} onChange={e => setDate(e.target.value)}
              data-testid="journal-date" />
          </Field>
          <div className="sm:col-span-2">
            <ToggleRow label="Depreciation on asset" hint="Write down an asset using an Income Tax depreciation block."
              checked={depreciation} onChange={value => { setDepreciation(value); setAmountManual(false); }}
              testid="journal-depreciation" />
          </div>
          <Field label={depreciation ? 'Debit — Depreciation expense (By) *' : 'Debit ledger (By) *'}>
            <SearchSelect value={drLedger} onChange={setDrLedger} options={opt.ledgers || []} required subOf={parentOf}
              placeholder="Select debit ledger…" testid="journal-debit-ledger" />
          </Field>
          <Field label={depreciation ? 'Credit — Asset write-down (To) *' : 'Credit ledger (To) *'}>
            <SearchSelect value={crLedger} onChange={selectCredit} options={opt.ledgers || []} required subOf={parentOf}
              placeholder="Select credit ledger…" testid="journal-credit-ledger" />
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={() => { setDrLedger(crLedger); setCrLedger(drLedger); }} data-testid="journal-swap">
              <ArrowLeftRight size={14} /> {lt('Swap ledgers')}
            </Button>
          </div>
        </div>
      </FormSection>

      {depreciation && (
        <FormSection title="Depreciation calculation" sub="Direct write-down method" testid="journal-depreciation-section">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Base WDV (₹) *" hint={assetClosingFetched != null ? 'Auto-filled from the asset ledger closing balance.' : undefined}>
              <Input type="number" min="0" step="any" value={baseWdv} onChange={e => setBaseWdv(e.target.value)}
                data-testid="journal-base-wdv" />
            </Field>
            <Field label="Depreciation block *">
              <SearchSelect value={rateName} options={DEPRECIATION_RATES} required translateOptions
                onChange={(name, row) => { setRateName(name); setRateMeta(row); setRatePercent(String(row.ratePercent)); }}
                subOf={row => row.assetBlock} placeholder="Select IT block…" testid="journal-depreciation-block" />
            </Field>
            <Field label="Rate % *">
              <Input type="number" min="0" step="any" value={ratePercent} onChange={e => setRatePercent(e.target.value)}
                data-testid="journal-rate" />
            </Field>
            <div className="flex items-end">
              <Button onClick={() => setAmountManual(false)} data-testid="journal-recalculate">
                <RotateCcw size={13} /> {lt('Recalculate amount')}
              </Button>
            </div>
          </div>
        </FormSection>
      )}

      <FormSection title="Amount and narration" testid="journal-amount-section">
        <div className="space-y-4">
          <Field label="Amount (₹) *">
            <Input type="number" min="0" step="any" value={amount}
              onChange={e => { setAmount(e.target.value); if (depreciation) setAmountManual(true); }}
              data-testid="journal-amount" />
          </Field>
          <Field label="Narration">
            <Textarea value={narration} onChange={e => setNarration(e.target.value)} data-testid="journal-narration" />
          </Field>
        </div>
      </FormSection>
      <FormError error={error} testid="journal-error" />
      <Button variant="primary" className="w-full" disabled={saving} onClick={submit} data-testid="journal-submit">
        {saving ? lt('Saving…') : lt('Save Journal')}
      </Button>
    </div>
  );
}

export function ContraForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { loading, error: loadError, opt, company, retry } = useCreateData(['banks']);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const { saving, error, setError, done, run } = useSubmit();
  const [entryType, setEntryType] = useState('regular');
  const [date, setDate] = useState(todayISO());
  const [fromLedger, setFromLedger] = useState('');
  const [toLedger, setToLedger] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [showCashCount, setShowCashCount] = useState(false);
  const [cashCounts, setCashCounts] = useState(() => emptyDenomCounts());
  const [cashCountUsed, setCashCountUsed] = useState(false);
  const cashCounted = useMemo(() => sumDenomCounts(cashCounts), [cashCounts]);
  const cashMatched = Math.abs(cashCounted - num(amount)) < 0.005 && num(amount) > 0;
  const cashApplied = cashCountUsed && cashMatched;
  const rows = opt.banks || [];
  const byName = useMemo(() => Object.fromEntries(rows.map(row => [rowName(row), row])), [rows]);
  const fromIsCash = containsParent(byName[fromLedger], 'Cash');
  const toIsCash = containsParent(byName[toLedger], 'Cash');
  const fromIsBank = !!fromLedger && !fromIsCash;
  const toIsBank = !!toLedger && !toIsCash;
  const bankInvolved = fromIsBank || toIsBank;
  const contraKind = fromIsCash && toIsBank ? 'cash deposit'
    : fromIsBank && toIsCash ? 'cash withdrawal'
      : fromIsBank && toIsBank ? 'bank transfer'
        : fromIsCash && toIsCash ? 'cash transfer' : null;
  const transactionType = contraKind === 'cash withdrawal' ? 'Cheque'
    : contraKind === 'bank transfer' ? 'Inter Bank Transfer' : 'Cash';

  useEffect(() => {
    if (entryType === 'regular') setDate(todayISO());
  }, [entryType]);

  const submit = async () => {
    if (!fromLedger || !toLedger) return setError('From and To ledgers are required.');
    if (fromLedger === toLedger) return setError('From and To ledgers must be different.');
    if (num(amount) <= 0) return setError('Amount must be greater than zero.');
    if (cashCountUsed && !cashApplied) return setError('Cash count must match the transfer amount (or clear the count).');
    const payload = {
      companyGuid: company.guid,
      companyName: companyName(company),
      date,
      amount: num(amount),
      fromLedger,
      toLedger,
      fromIsCash,
      toIsCash,
      fromIsBank,
      toIsBank,
      contraKind,
      entryType,
      numbering_policy: numberingPolicy,
      narration: narration.trim() || undefined,
    };
    if (bankInvolved || reference.trim()) {
      payload.instrumentDetails = {
        instrumentNo: reference.trim(),
        instrumentDate: date,
        transactionType,
      };
      if (reference.trim()) payload.reference = reference.trim();
    }
    if (cashCountUsed && cashApplied) {
      payload.cashCount = {
        used: true,
        matched: true,
        denominations: cashCounts,
        counted: cashCounted,
        target: num(amount),
      };
    }
    const result = await run(() => api.createContraVoucher(payload));
    if (result) onCreated?.();
  };

  if (done) return <Complete done={done} title="Contra" onClose={onClose} testid="contra-done" />;
  if (loading || loadError) return <LoadingError loading={loading} error={loadError} retry={retry} />;

  return (
    <div className="space-y-4">
      <FormSection title="Contra details" sub="Transfer between cash and bank accounts" testid="contra-essentials">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EntryTypeToggle value={entryType} onChange={setEntryType} testid="contra-entry-type" />
          <Field label="Date *" hint={entryType === 'regular' ? 'Regular vouchers use today’s date.' : undefined}>
            <Input type="date" value={date} disabled={entryType === 'regular'} onChange={e => setDate(e.target.value)}
              data-testid="contra-date" />
          </Field>
          <Field label="From ledger *">
            <SearchSelect value={fromLedger} onChange={setFromLedger} options={rows} required subOf={parentOf}
              placeholder="Select source…" testid="contra-from-ledger" />
          </Field>
          <Field label="To ledger *">
            <SearchSelect value={toLedger} onChange={setToLedger} options={rows} required subOf={parentOf}
              placeholder="Select destination…" testid="contra-to-ledger" />
          </Field>
          {contraKind && <p className="sm:col-span-2 text-[12px] capitalize text-ink-faint">{lt('Transfer type:')} {lt(contraKind)}</p>}
          <Field label="Amount (₹) *">
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}
              data-testid="contra-amount" />
          </Field>
          {bankInvolved && (
            <Field label="Cheque / reference (optional)">
              <Input value={reference} onChange={e => setReference(e.target.value)} data-testid="contra-reference" />
            </Field>
          )}
        </div>
      </FormSection>
      {(fromIsCash || toIsCash) && (
        <FormSection title="Cash count" sub="Optional denomination sheet — must match amount when applied" defaultOpen={showCashCount} testid="contra-cash-count">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setCashCounts(autoSplitAmount(amount))} data-testid="contra-cash-autosplit">{lt('Auto split')}</Button>
            <Button type="button" onClick={() => { setCashCounts(emptyDenomCounts()); setCashCountUsed(false); }} data-testid="contra-cash-clear">{lt('Clear')}</Button>
            <Button type="button" variant="primary" disabled={!cashMatched} onClick={() => setCashCountUsed(true)} data-testid="contra-cash-apply">{lt('Apply count')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INR_NOTES.map(face => (
              <Field key={face} label={`₹${face}`}>
                <Input type="number" min="0" value={cashCounts[String(face)] || 0}
                  onChange={e => setCashCounts(c => ({ ...c, [String(face)]: Math.max(0, Number(e.target.value) || 0) }))}
                  data-testid={`contra-denom-${face}`} />
              </Field>
            ))}
          </div>
          <p className={`mt-3 text-[13px] ${cashMatched ? 'text-pos' : cashCountUsed ? 'text-neg' : 'text-ink-soft'}`} data-testid="contra-cash-total">
            {lt('Counted')}: {inr(cashCounted)} · {lt('Amount')}: {inr(amount)}
            {cashCountUsed && (cashApplied ? ` · ${lt('Matched')}` : ` · ${lt('Mismatch')}`)}
          </p>
        </FormSection>
      )}
      <FormSection title="Notes" defaultOpen={false} testid="contra-notes-section">
        <Field label="Narration / notes">
          <Textarea value={narration} onChange={e => setNarration(e.target.value)} data-testid="contra-narration" />
        </Field>
      </FormSection>
      <FormError error={error} testid="contra-error" />
      <Button variant="primary" className="w-full" disabled={saving} onClick={submit} data-testid="contra-submit">
        {saving ? lt('Saving…') : lt('Save Contra')}
      </Button>
    </div>
  );
}

export function ExpenseForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { loading, error: loadError, opt, company, retry } = useCreateData(['ledgers', 'banks']);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const { saving, error, setError, done, run } = useSubmit();
  const [expenseLedger, setExpenseLedger] = useState('');
  const [paidFrom, setPaidFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [narration, setNarration] = useState('');
  const expenses = (opt.ledgers || []).filter(row => containsParent(row, 'Expense'));
  const banks = opt.banks || [];
  const bankByName = useMemo(() => Object.fromEntries(banks.map(row => [rowName(row), row])), [banks]);

  const submit = async () => {
    if (!expenseLedger) return setError('Expense ledger is required.');
    if (!paidFrom) return setError('Paid-from ledger is required.');
    if (!date) return setError('Date is required.');
    if (num(amount) <= 0) return setError('Amount must be greater than zero.');
    const paymentMethod = containsParent(bankByName[paidFrom], 'Cash') ? 'Cash' : 'Bank';
    const payload = {
      companyGuid: company.guid,
      companyName: companyName(company),
      date,
      amount: num(amount),
      partyLedger: expenseLedger,
      ledgerAccount: paidFrom,
      paymentMethod,
      billAllocations: [],
      entryType: 'regular',
      numbering_policy: numberingPolicy,
      narration: narration.trim() || undefined,
    };
    const result = await run(() => api.createPaymentVoucher(payload));
    if (result) onCreated?.();
  };

  if (done) return <Complete done={done} title="Expense" onClose={onClose} testid="expense-done" />;
  if (loading || loadError) return <LoadingError loading={loading} error={loadError} retry={retry} />;

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-note-bg px-3.5 py-2.5 text-[12px] text-note">
        {lt('Expense is recorded as a payment voucher.')}
      </p>
      <FormSection title="Expense details" sub="Simple payment preset" testid="expense-essentials">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Expense ledger *" className="sm:col-span-2">
            <SearchSelect value={expenseLedger} onChange={setExpenseLedger} options={expenses} required subOf={parentOf}
              placeholder="Select expense ledger…" testid="expense-ledger" />
          </Field>
          <Field label="Paid from *">
            <SearchSelect value={paidFrom} onChange={setPaidFrom} options={banks} required subOf={parentOf}
              placeholder="Cash or bank ledger…" testid="expense-paid-from" />
          </Field>
          <Field label="Amount (₹) *">
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}
              data-testid="expense-amount" />
          </Field>
          <Field label="Date *">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="expense-date" />
          </Field>
          <Field label="Narration" className="sm:col-span-2">
            <Textarea value={narration} onChange={e => setNarration(e.target.value)} data-testid="expense-narration" />
          </Field>
        </div>
      </FormSection>
      <FormError error={error} testid="expense-error" />
      <Button variant="primary" className="w-full" disabled={saving} onClick={submit} data-testid="expense-submit">
        {saving ? lt('Saving…') : lt('Record Expense')}
      </Button>
    </div>
  );
}