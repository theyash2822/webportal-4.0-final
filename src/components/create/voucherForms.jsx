import { useEffect, useMemo, useState, useRef } from 'react';
import { Field, Input, Select, Button, useLabelT } from '../kit';
import api from '../../services/api';
import {
  num, todayISO, useCreateData, SearchSelect, FormSection,
  EntryTypeToggle, ToggleRow, LineItemsEditor, emptyLine, lineAmount,
  TaxRowsEditor, taxesPayload, taxesTotal, flattenLineTaxes, lineTaxesTotal,
  ChargesEditor, chargesPayload, chargesTotal, DispatchSection, emptyDispatch,
  useSubmit, FormError, DoneState, TotalBar, useNumberingPolicy,
} from './common';
import { PartyForm } from './masterForms';
import { loadDraft, saveDraft, clearDraft } from '../../utils/draftSave';

const DRAFT_MODES = new Set(['sales-invoice', 'proforma', 'purchase-invoice']);

const TERMS = 'Goods once sold will not be taken back.';

const addDays = (date, days) => {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const paymentDays = (term, custom) => (
  term === '15d' ? 15 : term === '30d' ? 30 : term === 'custom' ? Math.max(0, num(custom)) : 0
);

const itemPayload = (line, ledger, ledgerKey) => ({
  itemName: line.name,
  billedQty: num(line.qty),
  actualQty: num(line.qty),
  qty: num(line.qty),
  rate: num(line.rate),
  amount: lineAmount(line),
  [ledgerKey]: ledger,
  godown: line.godown || 'Main Location',
  unit: line.unit || '',
  discountType: line.discountType,
  discount: num(line.discount),
  taxEntries: (line.taxEntries || [])
    .filter(t => t.ledgerName)
    .map(t => ({
      ledgerName: t.ledgerName,
      taxRate: t.taxRate,
      taxAmount: t.taxAmount,
    })),
});

const dispatchPayload = d => ({
  dispatch_from: d.dispatch_from || undefined,
  dispatch_from_state: d.dispatch_state || undefined,
  dispatch_from_address1: d.dispatch_address1 || undefined,
  dispatch_from_address2: d.dispatch_address2 || undefined,
  dispatch_from_pincode: d.dispatch_pincode || undefined,
  ship_to: d.ship_to || undefined,
  ship_to_state: d.ship_state || undefined,
  ship_to_address1: d.ship_address1 || undefined,
  ship_to_address2: d.ship_address2 || undefined,
  ship_to_pincode: d.ship_pincode || undefined,
  transport_mode: d.transport_mode || 'Road',
  transporter_name: d.transporter_name || undefined,
  transporter_id: d.transporter_id || undefined,
  vehicle_number: d.vehicle_number || undefined,
  vehicle_type: d.vehicle_type || 'Regular',
  transport_doc_no: d.transport_doc_no || undefined,
  transport_doc_date: d.transport_doc_date || undefined,
});

function LoadingState({ loading, error, retry }) {
  const lt = useLabelT();
  if (loading) return <p className="py-8 text-center text-[13px] text-ink-faint">{lt('Loading Tally masters…')}</p>;
  if (error) return (
    <div className="space-y-3 py-6">
      <FormError error={error} />
      <Button onClick={retry} data-testid="voucher-retry">{lt('Retry')}</Button>
    </div>
  );
  return null;
}

function Success({ done, title, onClose, companyGuid }) {
  const lt = useLabelT();
  return (
    <>
      <DoneState done={done} title={title} companyGuid={companyGuid} />
      <Button variant="primary" className="w-full" onClick={onClose} data-testid="voucher-done">{lt('Done')}</Button>
    </>
  );
}

function PaymentFields({ prefix, enabled, setEnabled, value, setValue, banks, verb }) {
  return (
    <FormSection title={`${verb} payment`} sub="Optionally settle this invoice now" defaultOpen={false} testid={`${prefix}-payment-section`}>
      <ToggleRow label={`${verb} payment now`} checked={enabled} onChange={setEnabled} testid={`${prefix}-payment-toggle`} />
      {enabled && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Mode">
            <Select value={value.mode} onChange={e => setValue(v => ({ ...v, mode: e.target.value }))} data-testid={`${prefix}-payment-mode`}>
              <option value="Cash">Cash</option><option value="Bank">Bank</option>
            </Select>
          </Field>
          <Field label="Payment ledger">
            <SearchSelect value={value.ledgerName} required onChange={ledgerName => setValue(v => ({ ...v, ledgerName }))}
              options={banks || []} placeholder="Cash or bank ledger…" testid={`${prefix}-payment-ledger`} />
          </Field>
          <Field label="Amount">
            <Input type="number" min="0" step="any" value={value.amount}
              onChange={e => setValue(v => ({ ...v, amount: e.target.value }))} data-testid={`${prefix}-payment-amount`} />
          </Field>
          <Field label="Reference">
            <Input value={value.reference} onChange={e => setValue(v => ({ ...v, reference: e.target.value }))}
              data-testid={`${prefix}-payment-reference`} />
          </Field>
        </div>
      )}
    </FormSection>
  );
}

/**
 * Invoices and orders intentionally share one implementation: their mobile
 * screens use the same item, tax and logistics editors and differ only in a
 * small set of header/payment fields.
 */
function CommercialForm({ mode, onClose, onCreated, prefill }) {
  const lt = useLabelT();
  const purchase = mode === 'purchase-invoice' || mode === 'purchase-order';
  const order = mode === 'sales-order' || mode === 'purchase-order';
  const proforma = mode === 'proforma';
  const salesInvoice = mode === 'sales-invoice' || proforma;
  const invoiceLike = salesInvoice || mode === 'purchase-invoice';
  const convertTdkRef = mode === 'sales-invoice' ? prefill?.convertTdkRef : undefined;
  const prefix = {
    'sales-invoice': 'si', proforma: 'proforma', 'sales-order': 'so',
    'purchase-invoice': 'pi', 'purchase-order': 'po',
  }[mode];
  const title = {
    'sales-invoice': 'Sales invoice', proforma: 'Proforma invoice', 'sales-order': 'Sales order',
    'purchase-invoice': 'Purchase invoice', 'purchase-order': 'Purchase order',
  }[mode];
  const { loading, error: loadError, opt, company, retry } = useCreateData([
    purchase ? 'partiesVendor' : 'parties',
    'items', 'warehouses', purchase ? 'purchaseLedgers' : 'salesLedgers',
    'taxLedgers', 'chargeLedgers', ...(order || proforma ? [] : ['banks']),
  ]);
  const submit = useSubmit();
  const [date, setDate] = useState((prefill?.date || '').slice(0, 10) || todayISO());
  const [party, setParty] = useState(prefill?.party || '');
  const [ledger, setLedger] = useState(prefill?.ledger || '');
  const [entryType, setEntryType] = useState('regular');
  const [reference, setReference] = useState(prefill?.reference || '');
  const [againstOrderNo, setAgainstOrderNo] = useState(prefill?.againstOrderNo || '');
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('due_on_receipt');
  const [customDays, setCustomDays] = useState('');
  const [narration, setNarration] = useState(prefill?.narration || '');
  const [termsText, setTermsText] = useState(TERMS);
  const [lines, setLines] = useState(prefill?.lines?.length
    ? prefill.lines.map(l => ({ ...emptyLine(), ...l, taxEntries: l.taxEntries || [] }))
    : [emptyLine()]);
  const [taxes, setTaxes] = useState(prefill?.taxes?.length ? prefill.taxes : []);
  const [charges, setCharges] = useState([]);
  const [roundOffLedger, setRoundOffLedger] = useState('');
  const [roundOffAmount, setRoundOffAmount] = useState('');
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatch, setDispatch] = useState(emptyDispatch());
  const [ewayRequired, setEwayRequired] = useState(false);
  const [ewayApplicable, setEwayApplicable] = useState(false);
  const [einvoiceApplicable, setEinvoiceApplicable] = useState(false);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const [showAddParty, setShowAddParty] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const [payment, setPayment] = useState({ mode: 'Cash', ledgerName: '', amount: '', reference: '' });
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState('');
  const [purchaseRefNo, setPurchaseRefNo] = useState('');
  const draftLoaded = useRef(false);
  const [draftBanner, setDraftBanner] = useState(null);

  useEffect(() => {
    if (!company?.guid || !DRAFT_MODES.has(mode) || draftLoaded.current || prefill) return;
    const saved = loadDraft(prefix, company.guid);
    if (!saved) return;
    setDraftBanner(saved);
  }, [company?.guid, mode, prefix, prefill]);

  useEffect(() => {
    if (!company?.guid || !DRAFT_MODES.has(mode)) return;
    const t = setTimeout(() => {
      saveDraft(prefix, company.guid, {
        date, party, ledger, entryType, reference, againstOrderNo, dueDate, paymentTerms, customDays,
        narration, termsText, lines, taxes, charges, roundOffLedger, roundOffAmount, showDispatch, dispatch,
        ewayRequired, vendorInvoiceNo, vendorInvoiceDate, purchaseRefNo,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [
    company?.guid, mode, prefix, date, party, ledger, entryType, reference, againstOrderNo, dueDate,
    paymentTerms, customDays, narration, termsText, lines, taxes, charges, roundOffLedger, roundOffAmount,
    showDispatch, dispatch, ewayRequired, vendorInvoiceNo, vendorInvoiceDate, purchaseRefNo,
  ]);

  const resumeDraft = () => {
    if (!draftBanner) return;
    const d = draftBanner;
    if (d.date) setDate(d.date);
    if (d.party) setParty(d.party);
    if (d.ledger) setLedger(d.ledger);
    if (d.entryType) setEntryType(d.entryType);
    if (d.reference) setReference(d.reference);
    if (d.againstOrderNo) setAgainstOrderNo(d.againstOrderNo);
    if (d.dueDate) setDueDate(d.dueDate);
    if (d.paymentTerms) setPaymentTerms(d.paymentTerms);
    if (d.customDays) setCustomDays(d.customDays);
    if (d.narration) setNarration(d.narration);
    if (d.termsText) setTermsText(d.termsText);
    if (d.lines?.length) setLines(d.lines.map(l => ({ ...emptyLine(), ...l, taxEntries: l.taxEntries || [] })));
    if (d.taxes?.length) setTaxes(d.taxes);
    if (d.charges?.length) setCharges(d.charges);
    if (d.roundOffLedger) setRoundOffLedger(d.roundOffLedger);
    if (d.roundOffAmount) setRoundOffAmount(d.roundOffAmount);
    if (d.showDispatch) setShowDispatch(true);
    if (d.dispatch) setDispatch(d.dispatch);
    if (d.ewayRequired) setEwayRequired(true);
    if (d.vendorInvoiceNo) setVendorInvoiceNo(d.vendorInvoiceNo);
    if (d.vendorInvoiceDate) setVendorInvoiceDate(d.vendorInvoiceDate);
    if (d.purchaseRefNo) setPurchaseRefNo(d.purchaseRefNo);
    setDraftBanner(null);
  };

  const discardDraft = () => {
    if (company?.guid) clearDraft(prefix, company.guid);
    setDraftBanner(null);
  };

  const partyOptions = purchase ? (opt.partiesVendor || opt.parties || []) : (opt.parties || []);
  const taxable = useMemo(() => lines.reduce((sum, line) => sum + (line.name ? lineAmount(line) : 0), 0), [lines]);
  const lineTax = useMemo(() => lineTaxesTotal(lines), [lines]);
  const voucherTax = useMemo(() => taxesTotal(taxes, taxable), [taxes, taxable]);
  const logistics = useMemo(() => [
    ...chargesPayload(charges),
    ...(roundOffLedger && num(roundOffAmount) !== 0
      ? [{ ledgerName: roundOffLedger, amount: num(roundOffAmount), taxes: [] }] : []),
  ], [charges, roundOffLedger, roundOffAmount]);
  const total = taxable
    + (invoiceLike ? lineTax : voucherTax)
    + chargesTotal(charges)
    + (roundOffLedger ? num(roundOffAmount) : 0);

  useEffect(() => {
    if (!company?.guid || !(salesInvoice || mode === 'purchase-invoice')) return;
    let alive = true;
    Promise.all([
      api.fetchComplianceConfig(company.guid).catch(() => null),
      api.fetchCompanyProfile(company.guid).catch(() => null),
    ]).then(([cfgRes, profileRes]) => {
      if (!alive) return;
      const cfg = cfgRes?.data || cfgRes || {};
      if (salesInvoice && cfg.e_way_bill_applicable === 'applicable_configured') {
        setShowDispatch(true);
        setEwayRequired(true);
        setEwayApplicable(true);
      }
      if (salesInvoice && cfg.e_invoice_applicable === 'applicable_configured') {
        setEinvoiceApplicable(true);
      }
      const profile = profileRes?.data || {};
      if (profile.address || profile.state || profile.pincode) {
        setDispatch(d => {
          if (d.dispatch_address1) return d;
          const [a1, a2] = String(profile.address || '').split(/\r?\n/).map(s => s.trim());
          return {
            ...d,
            dispatch_from: d.dispatch_from || company.name || '',
            dispatch_state: d.dispatch_state || profile.state || '',
            dispatch_address1: d.dispatch_address1 || a1 || '',
            dispatch_address2: d.dispatch_address2 || a2 || '',
            dispatch_pincode: d.dispatch_pincode || String(profile.pincode || ''),
          };
        });
      }
    });
    return () => { alive = false; };
  }, [company?.guid, company?.name, salesInvoice, mode]);

  useEffect(() => {
    if (!showDispatch || !party) return;
    const row = partyOptions.find(p => (typeof p === 'string' ? p : p.name) === party);
    if (!row || typeof row === 'string') return;
    setDispatch(d => {
      if (d.ship_address1) return d;
      const [a1, a2] = String(row.address || '').split(/\r?\n/).map(s => s.trim());
      return {
        ...d,
        ship_to: d.ship_to || row.name || party,
        ship_state: d.ship_state || row.state || row.state_name || '',
        ship_address1: d.ship_address1 || a1 || '',
        ship_address2: d.ship_address2 || a2 || '',
        ship_pincode: d.ship_pincode || String(row.pincode || ''),
      };
    });
  }, [showDispatch, party, partyOptions]);

  useEffect(() => {
    if (!salesInvoice) return;
    setDueDate(addDays(date, paymentDays(paymentTerms, customDays)));
  }, [date, paymentTerms, customDays, salesInvoice]);

  const validate = () => {
    if (!company?.guid || !company?.name) return 'Select a company first.';
    if (!date) return 'Date is required.';
    if (!party) return `${purchase ? 'Vendor' : 'Customer'} is required.`;
    if (!ledger) return `${purchase ? 'Purchase' : 'Sales'} ledger is required.`;
    const filled = lines.filter(l => l.name);
    if (!filled.length) return 'Add at least one item.';
    for (const line of filled) {
      if (num(line.qty) <= 0) return `Enter a quantity greater than zero for ${line.name}.`;
      if (num(line.rate) <= 0) return `Enter a rate greater than zero for ${line.name}.`;
      if (!line.godown) return `Select a warehouse for ${line.name}.`;
    }
    if (paymentTerms === 'custom' && num(customDays) < 0) return 'Custom payment days cannot be negative.';
    if (payNow && (!payment.ledgerName || num(payment.amount) <= 0)) return 'Select a payment ledger and enter a payment amount.';
    if (ewayRequired) {
      if (!showDispatch) return 'Dispatch details are required for an E-way bill.';
      if (!dispatch.dispatch_from || !dispatch.dispatch_address1 || !/^\d{6}$/.test(dispatch.dispatch_pincode)) {
        return 'Complete dispatch-from city, address and valid 6-digit pincode.';
      }
      if (!dispatch.ship_to || !dispatch.ship_address1 || !/^\d{6}$/.test(dispatch.ship_pincode)) {
        return 'Complete ship-to city, address and valid 6-digit pincode.';
      }
    }
    return '';
  };

  const save = async () => {
    const validation = validate();
    if (validation) { submit.setError(validation); return; }
    const ledgerKey = purchase ? 'purchaseLedger' : 'salesLedger';
    const isOptional = proforma || entryType === 'optional';
    const taxesOut = invoiceLike ? flattenLineTaxes(lines) : taxesPayload(taxes, taxable);
    const body = {
      companyGuid: company.guid,
      companyName: company.name,
      partyLedger: party,
      date,
      [ledgerKey]: ledger,
      voucherType: purchase ? 'Purchase' : 'Sales',
      isOptional,
      original_entry_type: proforma ? 'optional' : entryType,
      numbering_policy: numberingPolicy,
      totalAmount: total,
      reference: reference || undefined,
      againstOrderNo: againstOrderNo || undefined,
      dueDate: dueDate || undefined,
      paymentTerms: salesInvoice ? paymentTerms : undefined,
      customDays: paymentTerms === 'custom' ? num(customDays) : undefined,
      narration: narration || undefined,
      termsText: termsText || undefined,
      items: lines.filter(l => l.name).map(l => itemPayload(l, ledger, ledgerKey)),
      taxes: taxesOut,
      logistics,
    };
    if (salesInvoice) {
      body.eway_bill_required = ewayRequired;
      body.eway_bill_applicable = ewayApplicable;
      body.einvoice_applicable = einvoiceApplicable;
      body.dispatch_details = showDispatch ? dispatchPayload(dispatch) : undefined;
      body.collect_payment = !proforma && payNow ? { ...payment, amount: num(payment.amount), reference: payment.reference || undefined } : undefined;
    }
    if (mode === 'purchase-invoice') {
      body.vendorInvoiceNo = vendorInvoiceNo || undefined;
      body.vendorInvoiceDate = vendorInvoiceDate || undefined;
      body.purchaseRefNo = purchaseRefNo || undefined;
      body.reference = vendorInvoiceNo || purchaseRefNo || reference || undefined;
      body.make_payment = payNow ? { ...payment, amount: num(payment.amount), reference: payment.reference || undefined } : null;
    }
    let fn = {
      'sales-invoice': api.createSalesInvoice,
      proforma: api.createProformaInvoice,
      'sales-order': api.createSalesOrder,
      'purchase-invoice': api.createPurchaseInvoice,
      'purchase-order': api.createPurchaseOrder,
    }[mode];
    if (convertTdkRef) {
      body.tdkRef = convertTdkRef;
      body.isOptional = false;
      body.original_entry_type = 'optional';
      fn = api.convertProformaInvoice;
    }
    const result = await submit.run(() => fn(body));
    if (result) {
      if (company?.guid) clearDraft(prefix, company.guid);
      onCreated?.();
    }
  };

  if (submit.done) return <Success done={submit.done} title={title} onClose={onClose} companyGuid={company?.guid} />;
  if (loading || loadError) return <LoadingState loading={loading} error={loadError} retry={retry} />;
  const ledgerOptions = purchase ? opt.purchaseLedgers : opt.salesLedgers;
  const roundOffOptions = opt.roundOffLedgers?.length ? opt.roundOffLedgers : (opt.chargeLedgers || []);

  return (
    <div className="space-y-4">
      {draftBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-cream/70 px-4 py-3 text-[13px]" data-testid="draft-resume-banner">
          <span className="text-ink-soft">{lt('You have an unsaved draft from the last 30 minutes.')}</span>
          <div className="flex gap-2">
            <Button onClick={resumeDraft} data-testid="draft-resume">{lt('Resume')}</Button>
            <Button variant="ghost" onClick={discardDraft} data-testid="draft-discard">{lt('Discard')}</Button>
          </div>
        </div>
      )}
      {convertTdkRef && (
        <div className="rounded-2xl border border-line bg-cream/70 px-4 py-3 text-[13px] text-ink-soft" data-testid="convert-banner">
          {lt('Converting proforma')} <span className="font-medium text-ink">{convertTdkRef}</span> — {lt('the same Tally voucher becomes a regular Sales Invoice. Review the details below, then confirm.')}
        </div>
      )}
      {!convertTdkRef && prefill?.againstOrderNo && (
        <div className="rounded-2xl border border-line bg-cream/70 px-4 py-3 text-[13px] text-ink-soft" data-testid="from-order-banner">
          {lt('Prefilled from')} {lt(purchase ? 'purchase' : 'sales')} {lt('order')} <span className="font-medium text-ink">{prefill.againstOrderNo}</span>.
        </div>
      )}
      <FormSection title="Voucher details" sub={`${purchase ? 'Vendor' : 'Customer'}, date and accounting ledger`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={order ? 'Order date' : 'Date'}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid={`${prefix}-date`} />
          </Field>
          <Field label={purchase ? 'Vendor' : 'Customer'}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <SearchSelect value={party} required onChange={setParty} options={partyOptions}
                    placeholder={`Select ${purchase ? 'vendor' : 'customer'}…`} testid={`${prefix}-party`} />
                </div>
                {(salesInvoice || proforma || purchase) && (
                  <Button type="button" variant="ghost" className="shrink-0 px-3" onClick={() => setShowAddParty(v => !v)}
                    data-testid={`${prefix}-add-party`}>
                    {lt(showAddParty ? 'Cancel' : 'Add')}
                  </Button>
                )}
              </div>
              {showAddParty && (
                <div className="rounded-xl border border-line bg-cream/50 p-3">
                  <PartyForm kind={purchase ? 'supplier' : 'customer'} onClose={() => setShowAddParty(false)}
                    onCreated={name => { retry(); if (name) setParty(name); setShowAddParty(false); }} />
                </div>
              )}
            </div>
          </Field>
          <Field label={`${purchase ? 'Purchase' : 'Sales'} ledger`}>
            <SearchSelect value={ledger} required onChange={setLedger} options={ledgerOptions || []}
              placeholder="Select ledger…" testid={`${prefix}-ledger`} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={e => setReference(e.target.value)} data-testid={`${prefix}-reference`} />
          </Field>
          {order ? (
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid={`${prefix}-due-date`} />
            </Field>
          ) : (
            <Field label={`Against ${purchase ? 'purchase' : 'sales'} order no.`}>
              <Input value={againstOrderNo} onChange={e => setAgainstOrderNo(e.target.value)} data-testid={`${prefix}-against-order`} />
            </Field>
          )}
          {!proforma && !convertTdkRef && <EntryTypeToggle value={entryType} onChange={setEntryType} testid={`${prefix}-entry-type`} />}
        </div>
      </FormSection>

      {salesInvoice && (
        <FormSection title="Payment terms" sub="Due date is calculated automatically">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Terms">
              <Select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} data-testid={`${prefix}-payment-terms`}>
                <option value="due_on_receipt">Due on receipt</option><option value="15d">15 days</option>
                <option value="30d">30 days</option><option value="custom">Custom</option>
              </Select>
            </Field>
            {paymentTerms === 'custom' && (
              <Field label="Custom days">
                <Input type="number" min="0" value={customDays} onChange={e => setCustomDays(e.target.value)} data-testid={`${prefix}-custom-days`} />
              </Field>
            )}
            <Field label="Due date"><Input type="date" value={dueDate} readOnly data-testid={`${prefix}-due-date`} /></Field>
          </div>
        </FormSection>
      )}

      {mode === 'purchase-invoice' && (
        <FormSection title="Supplier document" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Vendor invoice no."><Input value={vendorInvoiceNo} onChange={e => setVendorInvoiceNo(e.target.value)} data-testid="pi-vendor-invoice-no" /></Field>
            <Field label="Vendor invoice date"><Input type="date" value={vendorInvoiceDate} onChange={e => setVendorInvoiceDate(e.target.value)} data-testid="pi-vendor-invoice-date" /></Field>
            <Field label="Purchase reference no."><Input value={purchaseRefNo} onChange={e => setPurchaseRefNo(e.target.value)} data-testid="pi-purchase-reference" /></Field>
          </div>
        </FormSection>
      )}

      <FormSection title="Items" sub={invoiceLike ? 'Quantity, price, warehouse and line taxes' : 'Quantity, price, discount and warehouse'}>
        <LineItemsEditor
          lines={lines}
          setLines={setLines}
          items={opt.items}
          warehouses={opt.warehouses}
          taxLedgers={opt.taxLedgers}
          showLineTaxes={invoiceLike}
          showBarcode={invoiceLike}
          testid={`${prefix}-lines`}
        />
      </FormSection>
      {!invoiceLike && (
        <FormSection title="Taxes" sub="GST, cess and other tax ledgers">
          <TaxRowsEditor taxes={taxes} setTaxes={setTaxes} taxLedgers={opt.taxLedgers} taxableValue={taxable} testid={`${prefix}-taxes`} />
        </FormSection>
      )}
      <FormSection title="Additional charges" sub="Freight, packing, tax and round-off" defaultOpen={false}>
        <ChargesEditor charges={charges} setCharges={setCharges} chargeLedgers={opt.chargeLedgers}
          taxLedgers={opt.taxLedgers} testid={`${prefix}-charges`} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Round-off ledger">
            <SearchSelect value={roundOffLedger} onChange={setRoundOffLedger} options={roundOffOptions}
              placeholder="Optional…" testid={`${prefix}-roundoff-ledger`} />
          </Field>
          <Field label="Round-off amount"><Input type="number" step="any" value={roundOffAmount}
            onChange={e => setRoundOffAmount(e.target.value)} data-testid={`${prefix}-roundoff-amount`} /></Field>
        </div>
      </FormSection>

      {salesInvoice && (
        <FormSection title="Dispatch & compliance" sub="Transport, E-way bill and e-invoice" defaultOpen={showDispatch || ewayRequired}>
          <div className="mb-4 space-y-2">
            <ToggleRow label="Add dispatch details" checked={showDispatch} onChange={setShowDispatch} testid={`${prefix}-dispatch-toggle`} />
            <ToggleRow label="E-way bill required" checked={ewayRequired} onChange={v => { setEwayRequired(v); if (v) setShowDispatch(true); }} testid={`${prefix}-eway-required`} />
            <ToggleRow label="E-way bill applicable" checked={ewayApplicable} onChange={setEwayApplicable} testid={`${prefix}-eway-applicable`} />
            <ToggleRow label="E-invoice applicable" checked={einvoiceApplicable} onChange={setEinvoiceApplicable} testid={`${prefix}-einvoice-applicable`} />
          </div>
          {showDispatch && <DispatchSection value={dispatch} onChange={setDispatch} testid={`${prefix}-dispatch`} />}
        </FormSection>
      )}

      {!order && !proforma && (
        <PaymentFields prefix={prefix} enabled={payNow} setEnabled={setPayNow} value={payment}
          setValue={setPayment} banks={opt.banks} verb={purchase ? 'Make' : 'Collect'} />
      )}
      <FormSection title="Notes & terms" defaultOpen={false}>
        <div className="space-y-3">
          <Field label="Narration / notes"><Input value={narration} onChange={e => setNarration(e.target.value)} data-testid={`${prefix}-narration`} /></Field>
          {(order || salesInvoice) && <Field label="Terms & conditions"><Input value={termsText} onChange={e => setTermsText(e.target.value)} data-testid={`${prefix}-terms`} /></Field>}
        </div>
      </FormSection>
      <TotalBar value={total} testid={`${prefix}-total`} />
      <FormError error={submit.error} testid={`${prefix}-error`} />
      <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid={`${prefix}-submit`}>
        {submit.saving ? lt('Saving…') : convertTdkRef ? lt('Convert to Sales Invoice') : <>{lt('Create')} {lt(title)}</>}
      </Button>
    </div>
  );
}

export function SalesInvoiceForm(props) { return <CommercialForm {...props} mode="sales-invoice" />; }
export function ProformaForm(props) { return <CommercialForm {...props} mode="proforma" />; }
export function SalesOrderForm(props) { return <CommercialForm {...props} mode="sales-order" />; }
export function PurchaseInvoiceForm(props) { return <CommercialForm {...props} mode="purchase-invoice" />; }
export function PurchaseOrderForm(props) { return <CommercialForm {...props} mode="purchase-order" />; }

function first(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '');
}

const normalizeInvoices = raw => api.unwrapList(raw).map(row => {
  const voucherNumber = String(first(row.voucher_number, row.voucherNumber, row.number, '') || '');
  return {
    ...row,
    name: voucherNumber,
    id: String(first(row.guid, row.id, row.voucher_guid, voucherNumber, '') || ''),
    guid: first(row.guid, row.voucher_guid),
    voucherNumber,
    date: String(first(row.date, row.voucher_date, '') || ''),
    party: String(first(row.party_name, row.partyLedger, row.party, '') || ''),
  };
}).filter(row => row.id && row.voucherNumber);

const normalizeReturnContext = (raw, selected, ledgerKey) => {
  const body = raw?.data ?? raw ?? {};
  const invoice = body.invoice ?? body.originalInvoice ?? body.original_invoice ?? {};
  const source = first(body.items, body.inventoryItems, body.inventory_items, invoice.items, invoice.inventory_items);
  const defaultLedger = String(first(
    body[ledgerKey === 'salesLedger' ? 'defaultSalesLedger' : 'defaultPurchaseLedger'],
    body[ledgerKey], body[ledgerKey === 'salesLedger' ? 'sales_ledger' : 'purchase_ledger'], ''
  ) || '');
  return (Array.isArray(source) ? source : []).map((row, index) => {
    const soldQty = Math.abs(num(first(row.soldQty, row.sold_qty, row.originalQty, row.billedQty, row.actualQty, row.qty)));
    const previouslyReturnedQty = Math.abs(num(first(row.previouslyReturnedQty, row.previously_returned_qty, row.returnedQty, row.returned_qty, 0)));
    const explicit = first(row.remainingQty, row.remaining_qty, row.returnableQty, row.availableQty);
    const remainingQty = explicit === undefined ? Math.max(0, soldQty - previouslyReturnedQty) : Math.max(0, num(explicit));
    const rate = Math.abs(num(first(row.rate, row.originalRate, row.original_rate)));
    return {
      lineId: first(row.lineId, row.line_id, row.inventoryEntryId, row.inventory_entry_id, `${selected.id}-${index}`),
      itemName: String(first(row.itemName, row.item_name, row.stockItem, row.stock_item_name, row.name, '') || ''),
      unit: String(first(row.unit, row.base_unit, '') || ''),
      soldQty, previouslyReturnedQty, remainingQty, rate,
      returnQty: '',
      ledger: String(first(row[ledgerKey], row[ledgerKey === 'salesLedger' ? 'sales_ledger' : 'purchase_ledger'], defaultLedger, '') || ''),
      godown: String(first(row.godown, row.warehouse, row.godown_name, 'Main Location') || ''),
    };
  }).filter(row => row.itemName);
};

function ReturnNoteForm({ type, onClose, onCreated }) {
  const lt = useLabelT();
  const credit = type === 'credit';
  const prefix = credit ? 'cn' : 'dn';
  const ledgerKey = credit ? 'salesLedger' : 'purchaseLedger';
  const { loading, error: loadError, opt, company, retry } = useCreateData([
    'parties', 'warehouses', credit ? 'salesLedgers' : 'purchaseLedgers', 'taxLedgers',
  ]);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const submit = useSubmit();
  const [date, setDate] = useState(todayISO());
  const [party, setParty] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [narration, setNarration] = useState('');
  const [entryType, setEntryType] = useState('regular');
  const subtotal = rows.reduce((sum, row) => sum + num(row.returnQty) * row.rate, 0);
  const total = subtotal + taxesTotal(taxes, subtotal);

  useEffect(() => {
    setSelected(null); setRows([]); setInvoices([]); setInvoiceError('');
    if (!party || !company?.guid) return;
    let alive = true;
    setInvoiceLoading(true);
    api.fetchVouchers({ companyGuid: company.guid, voucherType: credit ? 'Sales' : 'Purchase', partyName: party, page: 1, pageSize: 100 })
      .then(res => alive && setInvoices(normalizeInvoices(res).filter(v => !v.party || v.party.toLowerCase() === party.toLowerCase())))
      .catch(e => alive && setInvoiceError(e?.message || 'Unable to load original invoices.'))
      .finally(() => alive && setInvoiceLoading(false));
    return () => { alive = false; };
  }, [party, company?.guid, credit]);

  const chooseInvoice = async (name, choice) => {
    setSelected(choice); setRows([]); setInvoiceError('');
    if (!choice) return;
    setDetailLoading(true);
    try {
      const invoiceId = choice.guid || choice.id;
      const context = credit
        ? await api.fetchSalesInvoiceCreditNoteContext(invoiceId, company.guid)
        : await api.fetchPurchaseInvoiceDebitNoteContext(invoiceId, company.guid);
      const normalized = normalizeReturnContext(context, choice, ledgerKey);
      if (normalized.length) {
        setRows(normalized);
      } else {
        // Fallback if context returns empty lines
        const detail = await api.fetchVoucherDetail({ companyGuid: company.guid, voucherId: invoiceId });
        setRows(normalizeReturnContext(detail, choice, ledgerKey));
      }
    } catch (e) {
      try {
        const detail = await api.fetchVoucherDetail({ companyGuid: company.guid, voucherId: choice.guid || choice.id });
        setRows(normalizeReturnContext(detail, choice, ledgerKey));
      } catch {
        setInvoiceError(e?.message || 'Unable to load invoice lines.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const updateRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  const save = async () => {
    if (!company?.guid || !company?.name) { submit.setError('Select a company first.'); return; }
    if (!date) { submit.setError('Date is required.'); return; }
    if (!party) { submit.setError(`${credit ? 'Party' : 'Vendor'} is required.`); return; }
    if (!selected) { submit.setError(`Select the original ${credit ? 'Sales' : 'Purchase'} invoice.`); return; }
    const picked = rows.filter(r => num(r.returnQty) > 0);
    if (!picked.length) { submit.setError('Enter a return quantity for at least one item.'); return; }
    for (const row of picked) {
      if (num(row.returnQty) > row.remainingQty) { submit.setError(`${row.itemName} exceeds its remaining quantity.`); return; }
      if (row.rate <= 0) { submit.setError(`Original rate is missing for ${row.itemName}.`); return; }
      if (!row.ledger) { submit.setError(`Select a ${credit ? 'Sales' : 'Purchase'} ledger for ${row.itemName}.`); return; }
      if (!row.godown) { submit.setError(`Select a warehouse for ${row.itemName}.`); return; }
    }
    if (!narration.trim()) { submit.setError('Reason / narration is required.'); return; }
    const body = {
      companyGuid: company.guid, companyName: company.name, date, partyLedger: party, totalAmount: total,
      items: picked.map(row => ({
        lineId: row.lineId, itemName: row.itemName, actualQty: num(row.returnQty), billedQty: num(row.returnQty),
        unit: row.unit, rate: row.rate, originalRate: row.rate, amount: num(row.returnQty) * row.rate,
        [ledgerKey]: row.ledger, godown: row.godown, soldQty: row.soldQty,
        previouslyReturnedQty: row.previouslyReturnedQty || 0, remainingQty: row.remainingQty,
      })),
      taxes: taxesPayload(taxes, subtotal),
      isOptional: entryType === 'optional', original_entry_type: entryType,
      numbering_policy: numberingPolicy,
      linked_invoice: {
        invoiceGuid: selected.guid || selected.id, voucherNumber: selected.voucherNumber,
        billRefName: selected.voucherNumber, tdkRef: null, date: selected.date,
      },
      narration: narration.trim(),
    };
    const result = await submit.run(() => (credit ? api.createCreditNote(body) : api.createDebitNote(body)));
    if (result) onCreated?.();
  };

  if (submit.done) return <Success done={submit.done} title={credit ? 'Credit note' : 'Debit note'} onClose={onClose} companyGuid={company?.guid} />;
  if (loading || loadError) return <LoadingState loading={loading} error={loadError} retry={retry} />;
  const ledgerOptions = credit ? opt.salesLedgers : opt.purchaseLedgers;
  return (
    <div className="space-y-4">
      <FormSection title="Original invoice" sub="Choose the party and invoice being reversed">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid={`${prefix}-date`} /></Field>
          <Field label={credit ? 'Party' : 'Vendor'}>
            <SearchSelect value={party} required onChange={setParty} options={opt.parties || []} testid={`${prefix}-party`} placeholder="Select party…" />
          </Field>
          <Field label={`Original ${credit ? 'Sales' : 'Purchase'} invoice`} className="sm:col-span-2">
            <SearchSelect value={selected?.voucherNumber || ''} required disabled={!party || invoiceLoading}
              onChange={chooseInvoice} options={invoices} testid={`${prefix}-invoice`}
              placeholder={invoiceLoading ? 'Loading invoices…' : 'Select invoice…'}
              subOf={o => [o.date, o.amount ? `₹${o.amount}` : ''].filter(Boolean).join(' · ')} />
          </Field>
          <EntryTypeToggle value={entryType} onChange={setEntryType} testid={`${prefix}-entry-type`} />
        </div>
        {invoiceError && <div className="mt-3"><FormError error={invoiceError} testid={`${prefix}-invoice-error`} /></div>}
      </FormSection>

      <FormSection title="Returned items" sub="Return quantity cannot exceed the remaining quantity">
        {detailLoading ? <p className="text-[12px] text-ink-faint">{lt('Loading invoice lines…')}</p> : rows.length ? (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={row.lineId || i} className="rounded-xl border border-line bg-cream p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div><p className="text-[13px] font-semibold text-ink">{row.itemName}</p>
                    <p className="text-[11px] text-ink-faint">{lt('Sold')} {row.soldQty} · {lt('Returned')} {row.previouslyReturnedQty} · {lt('Remaining')} {row.remainingQty} {row.unit}</p></div>
                  <p className="text-[12px] font-medium text-ink">₹{row.rate.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Return quantity"><Input type="number" min="0" max={row.remainingQty} step="any" value={row.returnQty}
                    onChange={e => updateRow(i, { returnQty: e.target.value })} data-testid={`${prefix}-return-qty-${i}`} /></Field>
                  <Field label={`${credit ? 'Sales' : 'Purchase'} ledger`}>
                    <SearchSelect value={row.ledger} required onChange={ledger => updateRow(i, { ledger })}
                      options={ledgerOptions || []} testid={`${prefix}-line-ledger-${i}`} placeholder="Select ledger…" />
                  </Field>
                  <Field label="Warehouse"><SearchSelect value={row.godown} required onChange={godown => updateRow(i, { godown })}
                    options={opt.warehouses || []} testid={`${prefix}-line-godown-${i}`} placeholder="Select warehouse…" /></Field>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-ink-faint">{lt(selected ? 'No returnable lines found.' : 'Select an invoice to load its lines.')}</p>}
      </FormSection>
      <FormSection title="Tax reversal" sub="GST and other taxes to reverse">
        <TaxRowsEditor taxes={taxes} setTaxes={setTaxes} taxLedgers={opt.taxLedgers} taxableValue={subtotal} testid={`${prefix}-taxes`} />
      </FormSection>
      <FormSection title="Reason">
        <Field label="Why are these goods being returned?">
          <Input value={narration} onChange={e => setNarration(e.target.value)} data-testid={`${prefix}-narration`} />
        </Field>
      </FormSection>
      <TotalBar value={total} testid={`${prefix}-total`} />
      <FormError error={submit.error} testid={`${prefix}-error`} />
      <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid={`${prefix}-submit`}>
        {submit.saving ? lt('Saving…') : <>{lt('Create')} {lt(credit ? 'credit' : 'debit')} {lt('note')}</>}
      </Button>
    </div>
  );
}

export function CreditNoteForm(props) { return <ReturnNoteForm {...props} type="credit" />; }
export function DebitNoteForm(props) { return <ReturnNoteForm {...props} type="debit" />; }

export function DeliveryNoteForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const prefix = 'dn-delivery';
  const { loading, error: loadError, opt, company, retry } = useCreateData([
    'parties', 'items', 'warehouses', 'salesLedgers', 'taxLedgers', 'chargeLedgers',
  ]);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const submit = useSubmit();
  const [date, setDate] = useState(todayISO());
  const [party, setParty] = useState('');
  const [ledger, setLedger] = useState('');
  const [orders, setOrders] = useState([]);
  const [linkedOrder, setLinkedOrder] = useState(null);
  const [lines, setLines] = useState([emptyLine()]);
  const [taxes, setTaxes] = useState([]);
  const [charges, setCharges] = useState([]);
  const [dispatch, setDispatch] = useState(emptyDispatch());
  const [showDispatch, setShowDispatch] = useState(false);
  const [narration, setNarration] = useState('');
  const [entryType, setEntryType] = useState('regular');
  const taxable = lines.reduce((sum, l) => sum + (l.name ? lineAmount(l) : 0), 0);
  const total = taxable + taxesTotal(taxes, taxable) + chargesTotal(charges);

  useEffect(() => {
    setOrders([]); setLinkedOrder(null);
    if (!party || !company?.guid) return;
    let alive = true;
    api.fetchSalesOrders(company.guid, { partyName: party, limit: 100 })
      .then(res => alive && setOrders(normalizeInvoices(res).filter(v => !v.party || v.party.toLowerCase() === party.toLowerCase())))
      .catch(() => alive && setOrders([]));
    return () => { alive = false; };
  }, [party, company?.guid]);

  const save = async () => {
    if (!company?.guid || !company?.name) { submit.setError('Select a company first.'); return; }
    if (!date || !party) { submit.setError('Date and customer are required.'); return; }
    if (!ledger) { submit.setError('Sales ledger is required.'); return; }
    const filled = lines.filter(l => l.name);
    if (!filled.length) { submit.setError('Add at least one item.'); return; }
    for (const line of filled) {
      if (num(line.qty) <= 0) { submit.setError(`Enter a quantity for ${line.name}.`); return; }
      if (num(line.rate) <= 0) { submit.setError(`Enter a rate for ${line.name}.`); return; }
      if (!line.godown) { submit.setError(`Select a warehouse for ${line.name}.`); return; }
    }
    const body = {
      companyGuid: company.guid, companyName: company.name, partyLedger: party, date,
      totalAmount: total,
      items: filled.map(l => itemPayload(l, ledger, 'salesLedger')),
      taxes: taxesPayload(taxes, taxable), logistics: chargesPayload(charges),
      narration: narration || undefined, isOptional: entryType === 'optional',
      original_entry_type: entryType, numbering_policy: numberingPolicy,
      dispatch_details: showDispatch ? dispatchPayload(dispatch) : undefined,
      linked_order: linkedOrder ? { order_no: linkedOrder.voucherNumber, order_date: linkedOrder.date } : undefined,
    };
    const result = await submit.run(() => api.createDeliveryNote(body));
    if (result) onCreated?.();
  };

  if (submit.done) return <Success done={submit.done} title="Delivery note" onClose={onClose} companyGuid={company?.guid} />;
  if (loading || loadError) return <LoadingState loading={loading} error={loadError} retry={retry} />;
  return (
    <div className="space-y-4">
      <FormSection title="Delivery details" sub="Customer and optional linked sales order">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid={`${prefix}-date`} /></Field>
          <Field label="Customer"><SearchSelect value={party} required onChange={setParty} options={opt.parties || []} testid={`${prefix}-party`} placeholder="Select customer…" /></Field>
          {party && <Field label="Linked sales order"><SearchSelect value={linkedOrder?.voucherNumber || ''}
            onChange={(name, row) => setLinkedOrder(row || null)} options={orders} testid={`${prefix}-order`} placeholder="No linked sales order" subOf={o => o.date} /></Field>}
          <Field label="Sales ledger"><SearchSelect value={ledger} required onChange={setLedger} options={opt.salesLedgers || []} testid={`${prefix}-ledger`} placeholder="Select ledger…" /></Field>
          <EntryTypeToggle value={entryType} onChange={setEntryType} testid={`${prefix}-entry-type`} />
        </div>
      </FormSection>
      <FormSection title="Items"><LineItemsEditor lines={lines} setLines={setLines} items={opt.items} warehouses={opt.warehouses}
        taxLedgers={opt.taxLedgers} testid={`${prefix}-lines`} /></FormSection>
      <FormSection title="Taxes"><TaxRowsEditor taxes={taxes} setTaxes={setTaxes} taxLedgers={opt.taxLedgers} taxableValue={taxable} testid={`${prefix}-taxes`} /></FormSection>
      <FormSection title="Logistics charges" defaultOpen={false}><ChargesEditor charges={charges} setCharges={setCharges}
        chargeLedgers={opt.chargeLedgers} taxLedgers={opt.taxLedgers} testid={`${prefix}-charges`} /></FormSection>
      <FormSection title="Dispatch" sub="Transport and destination details" defaultOpen={false}>
        <ToggleRow label="Add dispatch details" checked={showDispatch} onChange={setShowDispatch} testid={`${prefix}-dispatch-toggle`} />
        {showDispatch && <div className="mt-4"><DispatchSection value={dispatch} onChange={setDispatch} testid={`${prefix}-dispatch`} /></div>}
      </FormSection>
      <FormSection title="Delivery instructions" defaultOpen={false}><Field label="Narration / instructions">
        <Input value={narration} onChange={e => setNarration(e.target.value)} data-testid={`${prefix}-narration`} />
      </Field></FormSection>
      <TotalBar value={total} testid={`${prefix}-total`} />
      <FormError error={submit.error} testid={`${prefix}-error`} />
      <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid={`${prefix}-submit`}>
        {submit.saving ? lt('Saving…') : lt('Create delivery note')}
      </Button>
    </div>
  );
}

export function QuotationNotice({ onClose }) {
  const lt = useLabelT();
  return (
    <div className="space-y-5 py-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[14px] font-semibold text-ink">{lt('Quotations cannot be written to Tally')}</p>
        <p className="mt-2 text-[13px] leading-5 text-ink-soft">
          {lt('Tally has no supported quotation write path. Create a Sales Order or Proforma Invoice instead.')}
        </p>
      </div>
      <Button variant="primary" className="w-full" onClick={onClose} data-testid="quotation-close">{lt('Close')}</Button>
    </div>
  );
}