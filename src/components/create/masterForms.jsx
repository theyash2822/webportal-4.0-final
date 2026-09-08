import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Input, Select, Button, Textarea, useLabelT } from '../kit';
import api from '../../services/api';
import {
  num, todayISO, namesOf, SearchSelect, FormSection, ToggleRow,
  useCreateData, useSubmit, FormError, DoneState, useNumberingPolicy,
} from './common';

const GROUPS = [
  'Cash-in-hand', 'Bank Accounts', 'Bank OD A/c', 'Fixed Assets', 'Investments',
  'Deposits (Asset)', 'Loans & Advances (Asset)', 'Current Assets', 'Capital Account',
  'Reserves & Surplus', 'Secured Loans', 'Unsecured Loans', 'Current Liabilities',
  'Provisions', 'Sales Accounts', 'Purchase Accounts', 'Direct Expenses',
  'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes',
];
/** Full list including Duties & Taxes — only for locked duties-taxes create path. */
const DUTIES_GROUP = 'Duties & Taxes';
const NO_BALANCE = new Set(['Sales Accounts', 'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes']);
const CREDIT_GROUPS = new Set(['Capital Account', 'Reserves & Surplus', 'Secured Loans', 'Unsecured Loans', 'Current Liabilities', 'Provisions', 'Bank OD A/c']);
const GST_GROUPS = new Set(['Sales Accounts', 'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes']);
const GST_STATE = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

function Done({ done, title, onClose, onViewDocument }) {
  const lt = useLabelT();
  return <><DoneState done={done} title={title} onViewDocument={onViewDocument} /><Button variant="primary" className="w-full" onClick={onClose} data-testid="create-done">{lt('Done')}</Button></>;
}

function BalanceFields({ prefix, balance, setBalance, isCr, setIsCr }) {
  return (
    <div className="grid grid-cols-[1fr_110px] gap-3">
      <Field label="Opening balance"><Input type="number" step="any" value={balance} onChange={e => setBalance(e.target.value)} data-testid={`${prefix}-opening-balance`} /></Field>
      <Field label="Balance type">
        <Select value={isCr ? 'Cr' : 'Dr'} onChange={e => setIsCr(e.target.value === 'Cr')} data-testid={`${prefix}-balance-type`}>
          <option>Dr</option><option>Cr</option>
        </Select>
      </Field>
    </div>
  );
}

export function PartyForm({ kind, onClose, onCreated }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['countries']);
  const submit = useSubmit();
  const lockedSupplier = kind === 'sundry-creditor' || kind === 'supplier';
  const lockedCustomer = kind === 'sundry-debtor' || kind === 'customer';
  const typeLocked = lockedSupplier || lockedCustomer;
  const [mode, setMode] = useState(lockedSupplier ? 'Supplier' : 'Customer');
  useEffect(() => {
    if (lockedSupplier) setMode('Supplier');
    else if (lockedCustomer) setMode('Customer');
  }, [lockedSupplier, lockedCustomer]);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [isCr, setIsCr] = useState(lockedSupplier); // creditors typically Cr
  const [contact, setContact] = useState({ phone: '', email: '', website: '', address1: '', address2: '' });
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [states, setStates] = useState([]);
  const [division, setDivision] = useState('State');
  const [pan, setPan] = useState('');
  const [gstRegType, setGstRegType] = useState('Regular');
  const [gstin, setGstin] = useState('');
  const [vat, setVat] = useState(false);
  const [vatData, setVatData] = useState({ dealerType: '', vatTin: '', cstNo: '', formCApplicable: false });
  const isIndia = country.trim().toLowerCase() === 'india';
  const gstUnlocked = isIndia && !!state.trim() && pincode.trim().length >= 4;

  useEffect(() => {
    let alive = true;
    if (!country) return undefined;
    api.fetchGeoStates(country).then(res => {
      if (!alive) return;
      const raw = res?.data || res;
      const rows = Array.isArray(raw) ? raw : raw?.items || [];
      setStates(rows.map(x => typeof x === 'string' ? x : x.name || x.state_name).filter(Boolean));
      setDivision(res?.meta?.division_label || 'State');
    }).catch(() => { if (alive) { setStates([]); setDivision('State'); } });
    return () => { alive = false; };
  }, [country]);
  useEffect(() => {
    if (isIndia && !state && gstin.length === 15 && GST_STATE[gstin.slice(0, 2)]) {
      setState(GST_STATE[gstin.slice(0, 2)]);
    }
  }, [gstin, isIndia, state]);

  const changeCountry = next => {
    setCountry(next); setState(''); setPincode('');
    if (next.trim().toLowerCase() !== 'india') {
      setPan(''); setGstRegType('Unregistered/Consumer'); setGstin(''); setVat(false);
      setVatData({ dealerType: '', vatTin: '', cstNo: '', formCApplicable: false });
    } else setGstRegType('Regular');
  };
  const save = async () => {
    if (!mode) return submit.setError('Select Customer or Supplier.');
    if (!name.trim()) return submit.setError('Name is required.');
    if (states.length && !state) return submit.setError(`${division} is required.`);
    if (isIndia && !pincode.trim()) return submit.setError('Pincode is required.');
    if (gstUnlocked && !gstRegType) return submit.setError('GST registration type is required.');
    const result = await submit.run(() => api.createPartyInTally({
      companyGuid: company?.guid, companyName: company?.name || '', name: name.trim(),
      parent: mode === 'Supplier' ? 'Sundry Creditors' : 'Sundry Debtors',
      ledger_type: mode === 'Supplier' ? 'sundry_creditor' : 'sundry_debtor',
      openingBalance: num(balance), isCr, isBillWise: 'Yes', mailingName: name.trim(),
      phone: contact.phone, email: contact.email, website: contact.website,
      address: [contact.address1.trim(), contact.address2.trim()].filter(Boolean).join('\n'),
      country, state, pincode,
      pan: isIndia ? pan : '', gstRegType: isIndia ? gstRegType : 'Unregistered/Consumer',
      gstin: isIndia && gstRegType !== 'Unregistered/Consumer' ? gstin : '',
      vatDetails: isIndia && vat ? vatData : undefined,
    }));
    if (result) onCreated?.(name.trim());
  };
  if (submit.done) return <Done done={submit.done} title={mode === 'Supplier' ? 'Sundry Creditor' : 'Sundry Debtor'} onClose={onClose} />;
  const setC = (key, value) => setContact(x => ({ ...x, [key]: value }));
  const setV = (key, value) => setVatData(x => ({ ...x, [key]: value }));
  return (
    <div className="space-y-4">
      <FormError error={submit.error} testid="party-error" />
      <FormSection title="Ledger details">
        <div className="space-y-3">
          {typeLocked ? (
            <p className="text-[13px] text-ink-soft" data-testid="party-type-locked">
              {lt('Under')}: <span className="font-semibold text-ink">{mode === 'Supplier' ? lt('Sundry Creditors') : lt('Sundry Debtors')}</span>
            </p>
          ) : (
            <Field label="Party type *"><Select value={mode} onChange={e => setMode(e.target.value)} data-testid="party-mode"><option>Customer</option><option>Supplier</option></Select></Field>
          )}
          <Field label="Name *"><Input value={name} onChange={e => setName(e.target.value)} data-testid="party-name" /></Field>
          <BalanceFields prefix="party" balance={balance} setBalance={setBalance} isCr={isCr} setIsCr={setIsCr} />
        </div>
      </FormSection>
      <FormSection title="Contact" defaultOpen={false}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Mobile number"><Input value={contact.phone} onChange={e => setC('phone', e.target.value)} data-testid="party-phone" /></Field>
          <Field label="Email"><Input type="email" value={contact.email} onChange={e => setC('email', e.target.value)} data-testid="party-email" /></Field>
          <Field label="Website" className="sm:col-span-2"><Input value={contact.website} onChange={e => setC('website', e.target.value)} data-testid="party-website" /></Field>
        </div>
      </FormSection>
      <FormSection title="Mailing address">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Address line 1"><Input value={contact.address1} onChange={e => setC('address1', e.target.value)} data-testid="party-address-1" /></Field>
          <Field label="Address line 2"><Input value={contact.address2} onChange={e => setC('address2', e.target.value)} data-testid="party-address-2" /></Field>
          <Field label="Country"><SearchSelect value={country} onChange={changeCountry} options={namesOf(opt.countries).length ? namesOf(opt.countries) : ['India']} required testid="party-country" /></Field>
          <Field label={`${division}${states.length ? ' *' : ''}`}><SearchSelect value={state} onChange={setState} options={states} required={states.length > 0} testid="party-state" placeholder={`Select ${division.toLowerCase()}…`} /></Field>
          <Field label={`Pincode${isIndia ? ' *' : ''}`}><Input value={pincode} maxLength={isIndia ? 6 : 12} inputMode="numeric" onChange={e => setPincode(e.target.value)} data-testid="party-pincode" /></Field>
        </div>
      </FormSection>
      {isIndia && <FormSection title="GST & VAT" sub={!gstUnlocked ? `Fill ${division} and pincode first` : undefined} defaultOpen={false}>
        {!gstUnlocked ? <p className="text-[12px] text-ink-faint">{lt('GST details unlock after a')} {division.toLowerCase()} {lt('and at least 4 pincode digits are entered.')}</p> :
          <div className="space-y-3">
            <Field label="PAN / IT No."><Input value={pan} maxLength={10} onChange={e => setPan(e.target.value.toUpperCase())} data-testid="party-pan" /></Field>
            <Field label="GST registration type *"><Select value={gstRegType} onChange={e => { setGstRegType(e.target.value); if (e.target.value === 'Unregistered/Consumer') setGstin(''); }} data-testid="party-gst-type">
              {['Regular', 'Composition', 'Unregistered/Consumer', 'SEZ'].map(x => <option key={x}>{x}</option>)}
            </Select></Field>
            {gstRegType !== 'Unregistered/Consumer' && <Field label="GSTIN / UIN"><Input value={gstin} maxLength={15} onChange={e => setGstin(e.target.value.toUpperCase())} data-testid="party-gstin" /></Field>}
            <ToggleRow label="VAT details" checked={vat} onChange={setVat} testid="party-vat-enabled" />
            {vat && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Type of dealer"><Select value={vatData.dealerType} onChange={e => setV('dealerType', e.target.value)} data-testid="party-vat-dealer"><option value="">Select</option>{['Regular', 'Composition', 'Unregistered'].map(x => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="VAT TIN No."><Input value={vatData.vatTin} onChange={e => setV('vatTin', e.target.value)} data-testid="party-vat-tin" /></Field>
              <Field label="CST No."><Input value={vatData.cstNo} onChange={e => setV('cstNo', e.target.value)} data-testid="party-cst-no" /></Field>
              <ToggleRow label="Sales / Purchase against Form C" checked={vatData.formCApplicable} onChange={v => setV('formCApplicable', v)} testid="party-form-c" />
            </div>}
          </div>}
      </FormSection>}
      <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="party-submit">{submit.saving ? lt('Saving…') : lt('Save ledger')}</Button>
    </div>
  );
}

export function LedgerForm({ kind, onClose, onCreated }) {
  const lt = useLabelT();
  const { company } = useCreateData([]);
  const submit = useSubmit();
  const isDuties = kind === 'duties-taxes';
  const [name, setName] = useState('');
  const [group, setGroup] = useState(isDuties ? DUTIES_GROUP : '');
  const [balance, setBalance] = useState('');
  const [isCr, setIsCr] = useState(false);
  const [bank, setBank] = useState({ accountNo: '', ifsc: '', branch: '', beneficiaryName: '', bankName: '' });
  const [duty, setDuty] = useState({ dutyCategory: '', taxType: '', percentage: '' });
  const [gst, setGst] = useState({ gstApplicable: '', taxability: '', hsnCode: '', rate: '', typeOfSupply: '' });
  const activeGroup = isDuties ? DUTIES_GROUP : group;
  const bankGroup = activeGroup === 'Bank Accounts' || activeGroup === 'Bank OD A/c';
  const gstGroup = GST_GROUPS.has(activeGroup);
  const supplyRequired = gstGroup && !activeGroup.includes('Expenses');
  const changeGroup = g => { setGroup(g); setIsCr(CREDIT_GROUPS.has(g)); };
  const save = async () => {
    if (!name.trim()) return submit.setError('Name is required.');
    if (!activeGroup) return submit.setError('Group is required.');
    if (activeGroup === DUTIES_GROUP && (!duty.dutyCategory || ((duty.dutyCategory === 'GST' || duty.dutyCategory === 'Others') && !duty.taxType))) return submit.setError('Complete the required duty and tax fields.');
    if (gstGroup && (!gst.gstApplicable || (gst.gstApplicable === 'Applicable' && (!gst.taxability || (supplyRequired && !gst.typeOfSupply))))) return submit.setError('Complete the required GST profile fields.');
    const rate = gst.gstApplicable === 'Applicable' ? num(gst.rate) : 0;
    const cleanBank = Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v || undefined]));
    const ledgerType = isDuties ? 'duties_taxes' : 'custom';
    const result = await submit.run(() => api.createPartyInTally({
      companyGuid: company?.guid, companyName: company?.name || '', name: name.trim(), parent: activeGroup,
      ledger_type: ledgerType, isBillWise: 'No',
      ...(!NO_BALANCE.has(activeGroup) ? { openingBalance: num(balance), isCr } : {}),
      ...(bankGroup ? { bankDetails: cleanBank } : {}),
      ...(activeGroup === DUTIES_GROUP ? { dutyCategory: duty.dutyCategory, taxType: duty.taxType || undefined, percentage: num(duty.percentage) } : {}),
      ...(gstGroup ? {
        gstApplicable: gst.gstApplicable,
        taxability: gst.gstApplicable === 'Applicable' ? gst.taxability : '',
        hsnCode: gst.gstApplicable === 'Applicable' ? gst.hsnCode : '',
        igstRate: rate, cgstRate: rate / 2, sgstRate: rate / 2,
        ...(supplyRequired ? { typeOfSupply: gst.gstApplicable === 'Applicable' ? gst.typeOfSupply : '' } : {}),
        ...((activeGroup === 'Sales Accounts' || activeGroup === 'Purchase Accounts') ? { inventoryValuesAffected: 'No' } : {}),
      } : {}),
    }));
    if (result) onCreated?.();
  };
  if (submit.done) return <Done done={submit.done} title={isDuties ? 'Duties and Taxes' : 'Custom Group'} onClose={onClose} />;
  const setB = (k, v) => setBank(x => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <FormError error={submit.error} testid="ledger-error" />
      <FormSection title="Ledger details"><div className="space-y-3">
        <Field label="Name *"><Input value={name} onChange={e => setName(e.target.value)} data-testid="ledger-name" /></Field>
        {isDuties ? (
          <p className="text-[13px] text-ink-soft" data-testid="ledger-group-locked">
            {lt('Under')}: <span className="font-semibold text-ink">{lt(DUTIES_GROUP)}</span>
          </p>
        ) : (
          <Field label="Group *"><SearchSelect value={group} onChange={changeGroup} options={GROUPS} required translateOptions testid="ledger-group" /></Field>
        )}
        {!NO_BALANCE.has(activeGroup) && <BalanceFields prefix="ledger" balance={balance} setBalance={setBalance} isCr={isCr} setIsCr={setIsCr} />}
      </div></FormSection>
      {bankGroup && <FormSection title="Bank details" defaultOpen={false}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ['accountNo', 'Account number'], ['ifsc', 'IFSC'], ['branch', 'Branch'],
          ['beneficiaryName', 'Account holder name'], ['bankName', 'Bank name'],
        ].map(([k, label]) => <Field label={label} key={k}><Input value={bank[k]} onChange={e => setB(k, k === 'ifsc' ? e.target.value.toUpperCase() : e.target.value)} data-testid={`ledger-bank-${k}`} /></Field>)}
      </div></FormSection>}
      {activeGroup === DUTIES_GROUP && <FormSection title="Duty / Tax profile"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type of duty / tax *"><Select value={duty.dutyCategory} onChange={e => setDuty({ ...duty, dutyCategory: e.target.value, taxType: '' })} data-testid="ledger-duty-category"><option value="">Select</option>{['GST', 'CST', 'VAT', 'Others'].map(x => <option key={x}>{x}</option>)}</Select></Field>
        {(duty.dutyCategory === 'GST' || duty.dutyCategory === 'Others') && <Field label="Tax type *"><Select value={duty.taxType} onChange={e => setDuty({ ...duty, taxType: e.target.value })} data-testid="ledger-tax-type"><option value="">Select</option>{(duty.dutyCategory === 'GST' ? ['IGST', 'CGST', 'SGST/UTGST', 'Cess'] : ['VAT', 'Not Applicable']).map(x => <option key={x}>{x}</option>)}</Select></Field>}
        <Field label="% of calculation"><Input type="number" step="any" value={duty.percentage} onChange={e => setDuty({ ...duty, percentage: e.target.value })} data-testid="ledger-tax-percentage" /></Field>
      </div></FormSection>}
      {gstGroup && <FormSection title="GST profile"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="GST applicability *"><Select value={gst.gstApplicable} onChange={e => setGst({ ...gst, gstApplicable: e.target.value, taxability: '', hsnCode: '', rate: '', typeOfSupply: '' })} data-testid="ledger-gst-applicable"><option value="">Select</option><option>Applicable</option><option>Not Applicable</option></Select></Field>
        {gst.gstApplicable === 'Applicable' && <>
          <Field label="Taxability *"><Select value={gst.taxability} onChange={e => setGst({ ...gst, taxability: e.target.value })} data-testid="ledger-taxability"><option value="">Select</option>{['Taxable', 'Exempt', 'Nil Rated'].map(x => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="HSN / SAC"><Input value={gst.hsnCode} onChange={e => setGst({ ...gst, hsnCode: e.target.value.toUpperCase() })} data-testid="ledger-hsn" /></Field>
          <Field label="GST rate %"><Input type="number" min="0" step="any" value={gst.rate} onChange={e => setGst({ ...gst, rate: e.target.value })} data-testid="ledger-gst-rate" /></Field>
          {supplyRequired && <Field label="Type of supply *"><Select value={gst.typeOfSupply} onChange={e => setGst({ ...gst, typeOfSupply: e.target.value })} data-testid="ledger-supply-type"><option value="">Select</option><option>Goods</option><option>Services</option></Select></Field>}
        </>}
      </div></FormSection>}
      <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="ledger-submit">{submit.saving ? lt('Saving…') : lt('Save ledger')}</Button>
    </div>
  );
}

export function StockItemForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['stockGroups', 'stockUnits', 'warehouses']);
  const submit = useSubmit();
  const [form, setForm] = useState({ group: '', name: '', unit: '', rate: '', purchase: '', warehouse: '', qty: '', sale: '' });
  const [barcode, setBarcode] = useState(false);
  const [labels, setLabels] = useState({ itemName: true, sku: false, salePrice: false });
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const save = async () => {
    if (!form.group) return submit.setError('Stock group is required.');
    if (!form.name.trim()) return submit.setError('Product name is required.');
    if (!form.unit) return submit.setError('Unit of measure is required.');
    const rate = num(form.rate);
    const result = await submit.run(() => api.createStockItemInTally({
      companyGuid: company?.guid, companyName: company?.name || '', groupName: form.group,
      name: form.name.trim(), unit: form.unit || 'Nos', hsnCode: '',
      igstRate: rate, cgstRate: rate / 2, sgstRate: rate / 2,
      openingRate: num(form.purchase), warehouse: form.warehouse || '',
      openingQty: num(form.qty), salePrice: num(form.sale),
      generateBarcode: barcode, barcodeLabel: labels,
    }));
    if (result) onCreated?.();
  };
  if (submit.done) return <Done done={submit.done} title="Stock item" onClose={onClose} />;
  return <div className="space-y-4">
    <FormError error={submit.error} testid="stock-item-error" />
    <FormSection title="Item details"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Group *"><SearchSelect value={form.group} onChange={v => set('group', v)} options={namesOf(opt.stockGroups)} required testid="stock-item-group" /></Field>
      <Field label="Product name *"><Input value={form.name} onChange={e => set('name', e.target.value)} data-testid="stock-item-name" /></Field>
      <Field label="Unit of measure *"><SearchSelect value={form.unit} onChange={v => set('unit', v)} options={namesOf(opt.stockUnits)} required testid="stock-item-unit" /></Field>
      <Field label="Tax rate %"><Input type="number" min="0" step="any" value={form.rate} onChange={e => set('rate', e.target.value)} data-testid="stock-item-tax-rate" /></Field>
    </div></FormSection>
    <FormSection title="Opening stock & pricing"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Purchase price"><Input type="number" min="0" step="any" value={form.purchase} onChange={e => set('purchase', e.target.value)} data-testid="stock-item-purchase-price" /></Field>
      <Field label="Warehouse placement"><SearchSelect value={form.warehouse} onChange={v => set('warehouse', v)} options={namesOf(opt.warehouses)} testid="stock-item-warehouse" /></Field>
      <Field label="Quantity"><Input type="number" min="0" step="any" value={form.qty} onChange={e => set('qty', e.target.value)} data-testid="stock-item-quantity" /></Field>
      <Field label="Default sale price"><Input type="number" min="0" step="any" value={form.sale} onChange={e => set('sale', e.target.value)} data-testid="stock-item-sale-price" /></Field>
    </div></FormSection>
    <FormSection title="Barcode" defaultOpen={false}><div className="space-y-3">
      <ToggleRow label="Generate barcode" checked={barcode} onChange={setBarcode} testid="stock-item-generate-barcode" />
      {barcode && Object.entries(labels).map(([k, v]) => <ToggleRow key={k} label={{ itemName: 'Item name', sku: 'SKU', salePrice: 'Sale price' }[k]} checked={v} onChange={x => setLabels(l => ({ ...l, [k]: x }))} testid={`stock-item-label-${k}`} />)}
    </div></FormSection>
    <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="stock-item-submit">{submit.saving ? lt('Saving…') : lt('Add item')}</Button>
  </div>;
}

export function WarehouseForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['warehouses']);
  const submit = useSubmit();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [address, setAddress] = useState('');
  const save = async () => {
    if (!name.trim()) return submit.setError('Warehouse name is required.');
    const result = await submit.run(() => api.createWarehouseInTally({
      companyGuid: company?.guid, companyName: company?.name || '', name: name.trim(),
      parentGodown: parent.trim(), address: address.trim() || undefined,
    }));
    if (result) onCreated?.();
  };
  if (submit.done) return <Done done={submit.done} title="Warehouse" onClose={onClose} />;
  return <div className="space-y-4">
    <FormError error={submit.error} testid="warehouse-error" />
    <FormSection title="Warehouse details"><div className="space-y-3">
      <Field label="Warehouse name *"><Input value={name} onChange={e => setName(e.target.value)} data-testid="warehouse-name" /></Field>
      <Field label="Parent godown"><SearchSelect value={parent} onChange={setParent} options={namesOf(opt.warehouses)} placeholder="None (top-level)" testid="warehouse-parent" /></Field>
      <Field label="Address"><Textarea value={address} onChange={e => setAddress(e.target.value)} data-testid="warehouse-address" /></Field>
    </div></FormSection>
    <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="warehouse-submit">{submit.saving ? lt('Saving…') : lt('Add warehouse')}</Button>
  </div>;
}

const GST_RATES = ['0', '5', '12', '18', '28'];

export function StockEditForm({ onClose, onCreated, prefill }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['items', 'stockGroups']);
  const submit = useSubmit();
  const [itemName, setItemName] = useState(prefill?.name || '');
  const [item, setItem] = useState(null);
  const [hsn, setHsn] = useState('');
  const [alias, setAlias] = useState('');
  const [gstRate, setGstRate] = useState('');
  const [group, setGroup] = useState('');
  const [reorder, setReorder] = useState('');
  const [note, setNote] = useState('');

  const pickItem = (name, row) => {
    const next = row || (opt.items || []).find(x => x.name === name) || null;
    setItemName(name);
    setItem(next);
    setHsn(next?.hsn || next?.sku || '');
    setAlias(next?.alias || '');
    const rate = next?.gst_rate ?? next?.igstRate ?? next?.taxRate;
    setGstRate(rate === 0 || rate ? String(rate) : '');
    setGroup(next?.group || next?.group_name || next?.category || '');
    setReorder(next?.reorder_level != null ? String(next.reorder_level) : '');
    setNote('');
  };

  useEffect(() => {
    if (prefill?.name && opt.items?.length && !item) {
      const row = opt.items.find(x => x.name === prefill.name || x.guid === prefill.guid);
      if (row) pickItem(row.name, row);
    }
  }, [prefill, opt.items, item]);

  const save = async () => {
    if (!item) return submit.setError('Select a stock item to edit.');
    const rate = gstRate === '' ? null : num(gstRate);
    const changes = {};
    if (hsn.trim() && hsn.trim() !== (item.hsn || item.sku || '')) changes.hsnCode = hsn.trim();
    if (alias.trim() && alias.trim() !== (item.alias || '')) changes.alias = alias.trim();
    if (group && group !== (item.group || item.group_name || item.category || '')) changes.groupName = group;
    if (reorder !== '' && num(reorder) !== num(item.reorder_level)) changes.reorderLevel = num(reorder);
    if (rate != null && rate !== num(item.gst_rate ?? item.igstRate ?? item.taxRate)) {
      changes.taxRate = rate;
      changes.igstRate = rate;
      changes.cgstRate = rate / 2;
      changes.sgstRate = rate / 2;
    }
    if (!Object.keys(changes).length) return submit.setError('Change at least one field.');
    const result = await submit.run(() => api.alterStockItemInTally({
      companyGuid: company?.guid,
      companyName: company?.name || '',
      stockGuid: item.guid || item.id || item.stock_guid,
      existingName: item.name,
      name: item.name,
      alias: alias.trim() || undefined,
      hsnCode: hsn.trim() || undefined,
      igstRate: rate ?? undefined,
      cgstRate: rate != null ? rate / 2 : undefined,
      sgstRate: rate != null ? rate / 2 : undefined,
      notes: note.trim() || undefined,
      changes,
    }));
    if (result) onCreated?.();
  };

  if (submit.done) return <Done done={submit.done} title="Stock edit" onClose={onClose} />;
  return (
    <div className="space-y-4">
      <FormError error={submit.error} testid="stock-edit-error" />
      <FormSection title="Item to edit" sub="Queued alter of an existing Tally stock master">
        <Field label="Stock item *">
          <SearchSelect value={itemName} required onChange={pickItem} options={opt.items || []}
            placeholder="Select item…" testid="stock-edit-item"
            subOf={o => [o.sku || o.hsn, `${itemQty(o)} ${itemUnit(o)}`].filter(Boolean).join(' · ')} />
        </Field>
      </FormSection>
      {item && (
        <FormSection title="Alter fields">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Item name"><Input readOnly value={item.name} className="bg-cream/60" data-testid="stock-edit-name" /></Field>
            <Field label="Current qty"><Input readOnly value={`${itemQty(item)} ${itemUnit(item)}`} className="bg-cream/60" data-testid="stock-edit-qty" /></Field>
            <Field label="HSN / SAC"><Input value={hsn} onChange={e => setHsn(e.target.value.toUpperCase())} data-testid="stock-edit-hsn" /></Field>
            <Field label="Alias"><Input value={alias} onChange={e => setAlias(e.target.value)} data-testid="stock-edit-alias" /></Field>
            <Field label="GST rate %">
              <Select value={gstRate} onChange={e => setGstRate(e.target.value)} data-testid="stock-edit-gst">
                <option value="">No change</option>
                {GST_RATES.map(r => <option key={r} value={r}>{r === '0' ? 'None (0%)' : `${r}%`}</option>)}
              </Select>
            </Field>
            <Field label="Stock group">
              <SearchSelect value={group} onChange={setGroup} options={namesOf(opt.stockGroups)} testid="stock-edit-group" placeholder="Select group…" />
            </Field>
            <Field label="Reorder level"><Input type="number" min="0" step="any" value={reorder} onChange={e => setReorder(e.target.value)} data-testid="stock-edit-reorder" /></Field>
            <Field label="Notes / reference" className="sm:col-span-2"><Textarea value={note} onChange={e => setNote(e.target.value)} data-testid="stock-edit-note" /></Field>
          </div>
        </FormSection>
      )}
      <Button variant="primary" className="w-full" disabled={submit.saving || !item} onClick={save} data-testid="stock-edit-submit">
        {submit.saving ? lt('Saving…') : lt('Update in Tally')}
      </Button>
    </div>
  );
}

function parseGodowns(res, item) {
  const d = res?.data ?? res;
  const raw = Array.isArray(d?.warehouses) ? d.warehouses : Array.isArray(d) ? d : [];
  const rows = raw.map(g => typeof g === 'string' ? { name: g, qty: 0 } : { name: g.name || g.godown, qty: num(g.qty ?? g.quantity) }).filter(g => g.name);
  if (rows.length) return rows;
  return [{ name: item.warehouse_name || item.warehouse || 'Main Location', qty: num(item.closing_qty ?? item.qty ?? item.quantity) }];
}
const itemGuid = item => item.guid || item.id || item.stock_guid || item.name;
const itemQty = item => num(item.closing_qty ?? item.qty ?? item.quantity);
const itemUnit = item => item.unit || item.base_unit || 'pcs';
const rowAvailable = (row, key) => row.godowns.find(g => g.name === row[key])?.qty ?? itemQty(row.item);

function StockRows({ prefix, rows, setRows, items, warehouseKey, qtyLabel }) {
  const lt = useLabelT();
  const { company } = useCreateData([]);
  const selected = useMemo(() => new Set(rows.map(r => r.item?.name)), [rows]);
  const availableItems = (items || []).filter(x => !selected.has(x.name));
  const addItem = async (name, item) => {
    if (!name || !item) return;
    let gods;
    try { gods = parseGodowns(await api.fetchStockGodowns(company?.guid, itemGuid(item)), item); }
    catch { gods = parseGodowns(null, item); }
    setRows(rs => [...rs, { item, qty: 1, godowns: gods, [warehouseKey]: gods.length === 1 ? gods[0].name : (item.warehouse_name || item.warehouse || '') }]);
  };
  const update = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  return <div className="space-y-3">
    {rows.map((r, i) => {
      const avail = rowAvailable(r, warehouseKey);
      return <div key={itemGuid(r.item)} className="rounded-xl border border-line bg-cream p-3">
        <div className="mb-3 flex items-center justify-between"><p className="text-[13px] font-semibold text-ink">{r.item.name}</p><button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} data-testid={`${prefix}-remove-${i}`} className="text-ink-faint hover:text-neg"><Trash2 size={14} /></button></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={warehouseKey === 'source' ? 'Source warehouse *' : 'Warehouse *'}>
            <SearchSelect value={r[warehouseKey]} onChange={v => update(i, { [warehouseKey]: v })} options={r.godowns}
              subOf={g => `${g.qty} ${itemUnit(r.item)} ${lt('available')}`} required testid={`${prefix}-warehouse-${i}`} />
          </Field>
          <Field label={`${qtyLabel} *`} hint={`Available: ${avail} ${itemUnit(r.item)}`}>
            <Input type="number" min="1" step="any" value={r.qty} onChange={e => update(i, { qty: e.target.value })} data-testid={`${prefix}-qty-${i}`} />
          </Field>
        </div>
      </div>;
    })}
    <Field label="Add stock item">
      <SearchSelect value="" onChange={addItem} options={availableItems} subOf={o => [o.sku, `${itemQty(o)} ${itemUnit(o)}`].filter(Boolean).join(' · ')} testid={`${prefix}-add-item`} placeholder="Search and add item…" />
    </Field>
  </div>;
}

export function StockTransferForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['items', 'warehouses']);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const submit = useSubmit();
  const [rows, setRows] = useState([]);
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const save = async () => {
    if (!rows.length) return submit.setError('Add at least one stock item.');
    if (rows.some(r => !r.source)) return submit.setError('Select a source warehouse for each item.');
    if (!destination) return submit.setError('Select a destination warehouse.');
    const same = rows.find(r => r.source === destination);
    if (same) return submit.setError(`${same.item.name}: source cannot match destination.`);
    const invalid = rows.find(r => num(r.qty) < 1);
    if (invalid) return submit.setError('Each item needs a quantity of at least 1.');
    const over = rows.find(r => num(r.qty) > rowAvailable(r, 'source'));
    if (over) return submit.setError(`${over.item.name}: maximum available is ${rowAvailable(over, 'source')} ${itemUnit(over.item)}.`);
    const result = await submit.run(() => api.createStockTransfer({
      companyGuid: company?.guid, companyName: company?.name || '', date: todayISO(),
      fromGodown: rows[0].source, toGodown: destination, note,
      narration: note || `Transfer ${rows.length} item(s) → ${destination}`,
      numbering_policy: numberingPolicy,
      items: rows.map(r => ({
        itemName: r.item.name, qty: num(r.qty),
        rate: num(r.item.closing_rate ?? r.item.rate),
        unit: itemUnit(r.item), fromGodown: r.source, availableQty: rowAvailable(r, 'source'),
      })),
    }));
    if (result) onCreated?.();
  };
  if (submit.done) return <Done done={submit.done} title="Stock transfer" onClose={onClose} />;
  return <div className="space-y-4">
    <FormError error={submit.error} testid="stock-transfer-error" />
    <FormSection title="Items to transfer"><StockRows prefix="stock-transfer" rows={rows} setRows={setRows} items={opt.items} warehouseKey="source" qtyLabel="Transfer quantity" /></FormSection>
    <FormSection title="Destination & note"><div className="space-y-3">
      <Field label="Destination warehouse *"><SearchSelect value={destination} onChange={setDestination} options={namesOf(opt.warehouses)} required testid="stock-transfer-destination" /></Field>
      <Field label="Note"><Textarea value={note} onChange={e => setNote(e.target.value)} data-testid="stock-transfer-note" /></Field>
    </div></FormSection>
    <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="stock-transfer-submit">{submit.saving ? lt('Saving…') : lt('Create stock transfer')}</Button>
  </div>;
}

const REDUCE_REASONS = new Set(['Damage', 'Shortage', 'Expired', 'Lost']);
export function StockAdjustmentForm({ onClose, onCreated }) {
  const lt = useLabelT();
  const { company, opt } = useCreateData(['items']);
  const numberingPolicy = useNumberingPolicy(company?.guid);
  const submit = useSubmit();
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState('');
  const [note, setNote] = useState('');
  const reducing = REDUCE_REASONS.has(reason) || (reason === 'Correction' && direction === 'Reduce');
  const save = async () => {
    if (!rows.length) return submit.setError('Add at least one stock item.');
    if (rows.some(r => !r.warehouse)) return submit.setError('Select a warehouse for each item.');
    if (rows.some(r => num(r.qty) < 1)) return submit.setError('Each item needs a quantity of at least 1.');
    if (!reason) return submit.setError('Select an adjustment reason.');
    if (reason === 'Correction' && !direction) return submit.setError('Select Add or Reduce for Correction.');
    const over = reducing && rows.find(r => num(r.qty) > rowAvailable(r, 'warehouse'));
    if (over) return submit.setError(`${over.item.name}: maximum available is ${rowAvailable(over, 'warehouse')} ${itemUnit(over.item)}.`);
    let saved = 0;
    const failures = [];
    await submit.run(async () => {
      let last = null;
      for (const row of rows) {
        try {
          const res = await api.createStockAdjustment({
            companyGuid: company?.guid, companyName: company?.name || '',
            stockGuid: itemGuid(row.item), stockName: row.item.name, warehouse: row.warehouse,
            adjustmentQty: num(row.qty), adjustmentReason: reason,
            adjustmentDirection: reason === 'Correction' ? direction : null,
            qtyBefore: rowAvailable(row, 'warehouse'), unit: itemUnit(row.item),
            note, date: todayISO(), numbering_policy: numberingPolicy,
          });
          if (res?.status === false || res?.success === false) throw new Error(res?.message || 'Tally rejected the entry');
          saved += 1; last = res;
        } catch (e) { failures.push(`${row.item.name}: ${e?.message || 'failed'}`); }
      }
      if (failures.length) throw new Error(`${saved} of ${rows.length} saved — ${failures.length} failed: ${failures.join('; ')}`);
      return last || { success: true };
    });
    if (saved > 0) onCreated?.();
  };
  if (submit.done) return <Done done={submit.done} title="Stock adjustment" onClose={onClose} />;
  return <div className="space-y-4">
    <FormError error={submit.error} testid="stock-adjustment-error" />
    <FormSection title="Items to adjust"><StockRows prefix="stock-adjustment" rows={rows} setRows={setRows} items={opt.items} warehouseKey="warehouse" qtyLabel="Adjust quantity" /></FormSection>
    <FormSection title="Reason & note"><div className="space-y-3">
      <Field label="Adjustment reason *"><Select value={reason} onChange={e => { setReason(e.target.value); setDirection(''); }} data-testid="stock-adjustment-reason"><option value="">Select reason</option>{['Damage', 'Shortage', 'Expired', 'Lost', 'Excess', 'Correction'].map(x => <option key={x}>{x}</option>)}</Select></Field>
      {reason === 'Correction' && <Field label="Direction *"><Select value={direction} onChange={e => setDirection(e.target.value)} data-testid="stock-adjustment-direction"><option value="">Select direction</option><option value="Add">+ Add stock</option><option value="Reduce">− Reduce stock</option></Select></Field>}
      <Field label="Note"><Textarea value={note} onChange={e => setNote(e.target.value)} data-testid="stock-adjustment-note" /></Field>
    </div></FormSection>
    <Button variant="primary" className="w-full" disabled={submit.saving} onClick={save} data-testid="stock-adjustment-submit">{submit.saving ? lt('Saving…') : lt('Save adjustments')}</Button>
  </div>;
}