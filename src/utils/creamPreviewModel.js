/**
 * Normalize Tally preview / voucher-full payloads into a cream-sheet model
 * (visual parity with mobile CommercialDocumentPreview / AccountingVoucherPreview).
 */
import { amountInWords } from './invoicePrint';

const first = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');

export function docTitleFromType(voucherType = '') {
  const vt = String(voucherType || '').toLowerCase();
  if (vt.includes('proforma')) return 'PROFORMA INVOICE';
  if (vt.includes('sales order')) return 'SALES ORDER';
  if (vt.includes('purchase order')) return 'PURCHASE ORDER';
  if (vt.includes('quotation')) return 'QUOTATION';
  if (vt.includes('credit note')) return 'CREDIT NOTE';
  if (vt.includes('debit note')) return 'DEBIT NOTE';
  if (vt.includes('delivery')) return 'DELIVERY NOTE';
  if (vt.includes('receipt')) return 'RECEIPT';
  if (vt.includes('payment')) return 'PAYMENT VOUCHER';
  if (vt.includes('journal')) return 'JOURNAL';
  if (vt.includes('contra')) return 'CONTRA';
  if (vt.includes('expense')) return 'EXPENSE';
  if (vt.includes('purchase')) return 'PURCHASE INVOICE';
  if (vt.includes('sales')) return 'TAX INVOICE';
  return voucherType ? String(voucherType).toUpperCase() : 'VOUCHER';
}

function joinAddr(...parts) {
  return parts.flat().filter(Boolean).map(String).join(', ');
}

/**
 * Build cream sheet model from:
 * - Tally preview snapshot (GET /tally/invoice/:ref/preview), and/or
 * - list row + optional voucher-full payload.
 */
export function buildCreamModel({ doc, row, full, company: selectedCompany, formatDate }) {
  const snapshot = doc || {};
  const voucher = full?.voucher || row || {};
  const company = snapshot.company || full?.company || selectedCompany || {};
  const partyInfo = snapshot.party || snapshot.billing || full?.party || {};

  const voucherType = first(
    snapshot.tallyVoucherType, snapshot.documentTitle, voucher.voucher_type, row?.voucher_type, 'Voucher'
  );
  const number = first(
    snapshot.documentNumber, snapshot.voucherNumber, voucher.voucher_number, row?.voucher_number, ''
  );
  const dateRaw = first(snapshot.date, voucher.date, row?.date, '');
  const dateLabel = formatDate ? formatDate(dateRaw) : String(dateRaw || '').slice(0, 10);

  const companyName = first(company.name, company.formal_name, selectedCompany?.name, '');
  const companyAddr = first(
    company.address,
    joinAddr(company.addressLine1, company.addressLine2, company.city, company.state, company.pincode),
    ''
  );
  const partyName = first(
    partyInfo.name, partyInfo.ledgerName, voucher.party_name, row?.party_name, snapshot.partyName, ''
  );
  const partyAddr = first(
    partyInfo.address,
    joinAddr(partyInfo.addressLine1, partyInfo.addressLine2, partyInfo.city, partyInfo.state, partyInfo.pincode),
    ''
  );

  const itemsSrc = (snapshot.items?.length ? snapshot.items : null)
    || (full?.items?.length ? full.items : null)
    || row?.items
    || [];
  const items = (itemsSrc || []).map((it, i) => ({
    id: it.id || i,
    name: first(it.name, it.itemName, it.item_name, it.stock_item_name, it.ledger_name, '—'),
    hsn: it.hsn || '',
    qty: it.qty ?? it.billedQty ?? it.billed_qty ?? it.actual_qty,
    unit: it.unit || '',
    rate: it.rate,
    discount: it.discount,
    amount: Math.abs(Number(it.amount ?? it.lineTotal) || 0),
  })).filter(it => it.name && it.name !== '—');

  const ledgers = (snapshot.ledgerEntries || full?.ledger_entries || row?.ledger_entries || []).map(e => ({
    name: first(e.ledgerName, e.ledger_name, e.name, ''),
    amount: Math.abs(Number(e.amount) || 0),
  })).filter(e => e.name);

  const taxes = snapshot.taxes || [];
  const gst = full?.gst || {
    cgst_amount: taxes.find(t => /cgst/i.test(t.name || t.ledgerName || ''))?.amount,
    sgst_amount: taxes.find(t => /sgst/i.test(t.name || t.ledgerName || ''))?.amount,
    igst_amount: taxes.find(t => /igst/i.test(t.name || t.ledgerName || ''))?.amount,
    taxable_amount: snapshot.totals?.taxable ?? snapshot.totals?.subtotal,
    place_of_supply: snapshot.metadata?.placeOfSupply || snapshot.tallyMeta?.placeOfSupply,
  };

  const total = Math.abs(Number(
    first(snapshot.totals?.grandTotal, snapshot.totals?.total, voucher.party_amount, voucher.amount, row?.party_amount, row?.amount, 0)
  ) || 0);

  const totRows = [];
  const taxable = Math.abs(Number(gst?.taxable_amount) || items.reduce((s, it) => s + it.amount, 0));
  if (taxable) totRows.push({ label: 'Taxable Value', value: taxable });
  if (Number(gst?.cgst_amount)) totRows.push({ label: 'Output CGST', value: Math.abs(Number(gst.cgst_amount)) });
  if (Number(gst?.sgst_amount)) totRows.push({ label: 'Output SGST', value: Math.abs(Number(gst.sgst_amount)) });
  if (Number(gst?.igst_amount)) totRows.push({ label: 'Output IGST', value: Math.abs(Number(gst.igst_amount)) });
  taxes.filter(t => !/cgst|sgst|igst/i.test(t.name || t.ledgerName || '')).forEach(t => {
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt) totRows.push({ label: t.name || t.ledgerName || 'Tax', value: amt });
  });

  const meta = [
    { label: 'No.', value: number },
    { label: 'Dated', value: dateLabel },
    { label: 'Place of Supply', value: gst?.place_of_supply },
    { label: 'Reference', value: first(snapshot.reference, voucher.reference, row?.reference) },
    { label: 'Narration', value: first(snapshot.narration, voucher.narration, row?.narration) },
  ].filter(m => m.value);

  const isAccounting = /payment|receipt|journal|contra|expense/i.test(String(voucherType));

  return {
    ribbon: docTitleFromType(voucherType),
    voucherType,
    number,
    dateLabel,
    companyName,
    companyAddr,
    companyGstin: company.gstin || '',
    companyPan: company.pan || '',
    companyPhone: company.phone || company.mobile || '',
    companyEmail: company.email || '',
    partyLabel: /purchase|debit/i.test(String(voucherType)) ? 'Supplier (Bill from)' : 'Buyer (Bill to)',
    partyName,
    partyAddr,
    partyGstin: partyInfo.gstin || '',
    partyState: partyInfo.state || partyInfo.state_name || '',
    meta,
    items,
    ledgers,
    isAccounting,
    totRows,
    total,
    words: amountInWords(total),
    cancelled: !!(voucher.is_cancelled || row?.is_cancelled),
  };
}

/** Map cream/snapshot inputs into buildInvoiceHTML args. */
export function toPrintPayload({ cream, doc, row, full, company: selectedCompany, formatDate, profile = {}, logoUrl = '', format }) {
  const snapshot = doc || {};
  const voucher = full?.voucher || row || {};
  const company = snapshot.company || full?.company || selectedCompany || {};
  const partyInfo = snapshot.party || snapshot.billing || full?.party || {};
  const items = cream?.items?.length
    ? cream.items
    : (snapshot.items || full?.items || []);
  const taxes = snapshot.taxes || [];
  const gst = full?.gst || {
    cgst_amount: taxes.find(t => /cgst/i.test(t.name || t.ledgerName || ''))?.amount,
    sgst_amount: taxes.find(t => /sgst/i.test(t.name || t.ledgerName || ''))?.amount,
    igst_amount: taxes.find(t => /igst/i.test(t.name || t.ledgerName || ''))?.amount,
    taxable_amount: snapshot.totals?.taxable ?? snapshot.totals?.subtotal,
    place_of_supply: snapshot.metadata?.placeOfSupply,
  };
  return {
    voucher: {
      voucher_number: cream?.number || snapshot.documentNumber || voucher.voucher_number || row?.voucher_number,
      voucher_type: cream?.voucherType || snapshot.tallyVoucherType || voucher.voucher_type || row?.voucher_type,
      date: snapshot.date || voucher.date || row?.date,
      amount: cream?.total ?? snapshot.totals?.grandTotal ?? voucher.amount,
      party_amount: cream?.total ?? snapshot.totals?.grandTotal ?? voucher.party_amount ?? voucher.amount,
      party_name: cream?.partyName || partyInfo.name || voucher.party_name || row?.party_name,
      reference: snapshot.reference || voucher.reference || row?.reference,
      narration: snapshot.narration || voucher.narration || row?.narration,
      is_cancelled: cream?.cancelled,
    },
    company: {
      ...company,
      name: cream?.companyName || company.name || selectedCompany?.name,
      address: cream?.companyAddr || company.address,
      gstin: cream?.companyGstin || company.gstin,
      pan: cream?.companyPan || company.pan,
      phone: cream?.companyPhone || company.phone,
      email: cream?.companyEmail || company.email,
    },
    party: {
      ...partyInfo,
      name: cream?.partyName || partyInfo.name,
      address: cream?.partyAddr || partyInfo.address,
      gstin: cream?.partyGstin || partyInfo.gstin,
    },
    gst,
    items,
    ledgerEntries: (snapshot.ledgerEntries || full?.ledger_entries || []).map(e => ({
      ledger_name: e.ledgerName || e.ledger_name || e.name,
      amount: e.amount,
    })),
    eInvoice: snapshot.eInvoice || full?.e_invoice || null,
    eWayBill: snapshot.eWayBill || full?.e_way_bill || null,
    profile,
    logoUrl,
    formatDate: formatDate || (d => String(d || '').slice(0, 10)),
    format,
  };
}
