/**
 * TallyDekho Thermal HTML — close port of mobile tdThermal / tdThermalCommercial.
 * Consumes the same print payload as buildInvoiceHTML (toPrintPayload shape).
 */
import { amountInWords } from './invoicePrint';
import { sanitizeImageSrc } from './sanitizeImageSrc';
import {
  DEFAULT_THERMAL_PAPER_WIDTH,
  normalizeThermalWidth,
  thermalDash,
  thermalDouble,
  wrapThermalHtml,
} from './thermalShared';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatInr = (n, withSymbol = false) => {
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `₹ ${s}` : s;
};

const GST_RE = /\b(gst|igst|cgst|sgst|utgst|cess)\b/i;

function sep(w) {
  return `<div class="sep">${thermalDash(w)}</div>`;
}
function dbl(w) {
  return `<div class="sep">${thermalDouble(w)}</div>`;
}

function addressLines(addr) {
  if (!addr) return [];
  if (Array.isArray(addr)) return addr.filter(Boolean);
  return String(addr).split(/\n|,\s*/).map(s => s.trim()).filter(Boolean);
}

function docTitle(voucherType = '') {
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

function isAccountingType(voucherType = '') {
  return /payment|receipt|journal|contra|expense/i.test(String(voucherType || ''));
}

function partyHeading(voucherType = '') {
  const vt = String(voucherType || '').toLowerCase();
  if (vt.includes('purchase') || vt.includes('debit note')) return 'Supplier (Bill From)';
  if (vt.includes('receipt') || vt.includes('payment')) return 'Party';
  return 'Buyer (Bill To)';
}

function kv(label, value) {
  if (value == null || value === '') return '';
  return `<div class="row"><span class="muted">${esc(label)}</span><span class="b">${esc(value)}</span></div>`;
}

/**
 * @param {object} payload — same shape as buildInvoiceHTML args
 * @param {{ paperWidth?: 80|58, qrImage?: string|null }} opts
 */
export function buildThermalHTML(payload = {}, opts = {}) {
  const w = normalizeThermalWidth(opts.paperWidth ?? DEFAULT_THERMAL_PAPER_WIDTH);
  const {
    voucher = {}, company = {}, party = {}, gst = null, items = [],
    ledgerEntries = [], eInvoice = null, eWayBill = null,
    profile = {}, formatDate = (d) => d || '',
  } = payload;

  if (isAccountingType(voucher.voucher_type)) {
    return wrapThermalHtml(renderAccounting(payload, w), { paperWidth: w });
  }
  return wrapThermalHtml(renderCommercial({
    voucher, company, party, gst, items, ledgerEntries, eInvoice, eWayBill, profile, formatDate,
    qrImage: sanitizeImageSrc(opts.qrImage),
  }, w), { paperWidth: w });
}

function companyHeader(company, profile, w) {
  const lines = [];
  lines.push(`<div class="c b" style="font-size:${w === 58 ? '11px' : '12px'}">${esc(company.name || company.formal_name || '')}</div>`);
  for (const a of addressLines(company.address)) {
    lines.push(`<div class="c muted">${esc(a)}</div>`);
  }
  if (company.state || company.pincode) {
    lines.push(`<div class="c muted">${esc([company.state, company.pincode].filter(Boolean).join(' - '))}</div>`);
  }
  const gstin = company.gstin || profile.gstin || '';
  const pan = company.pan || profile.pan || '';
  const phone = company.phone || company.mobile || profile.phone || '';
  const email = company.email || profile.email || '';
  if (gstin) lines.push(`<div class="c muted">GSTIN: ${esc(gstin)}</div>`);
  if (pan) lines.push(`<div class="c muted">PAN: ${esc(pan)}</div>`);
  if (email) lines.push(`<div class="c muted">E-Mail: ${esc(email)}</div>`);
  if (phone) lines.push(`<div class="c muted">Phone: ${esc(phone)}</div>`);
  return lines.join('\n');
}

function renderCommercial(p, w) {
  const {
    voucher, company, party, gst, items, ledgerEntries, eInvoice, eWayBill, profile, formatDate, qrImage,
  } = p;
  const title = docTitle(voucher.voucher_type);
  const grandTotal = Math.abs(Number(voucher.party_amount ?? voucher.amount) || 0);
  const hideAmt = /delivery/i.test(String(voucher.voucher_type || ''));

  const invRows = (items || []).filter(it =>
    (it.stock_item_name || it.item_name || it.name)
    && (it.type ? String(it.type).toLowerCase() !== 'ledger' : true));

  const meta = [
    kv('No.', voucher.voucher_number),
    kv('Date', formatDate(voucher.date)),
    kv('Reference', voucher.reference),
    kv('Place of Supply', gst?.place_of_supply || party.state_name),
    kv('IRN', eInvoice?.irn || gst?.irn),
    kv('e-Way Bill', eWayBill?.ewb_no),
  ].filter(Boolean).join('');

  const partyAddr = addressLines(party.address);
  const parties = `
<div style="margin:6px 0">
  <div class="b">${esc(partyHeading(voucher.voucher_type))}</div>
  <div class="b">${esc(voucher.party_name || party.name || '')}</div>
  ${partyAddr.map(a => `<div class="muted">${esc(a)}</div>`).join('')}
  ${party.state_name || party.pincode ? `<div class="muted">${esc([party.state_name, party.pincode].filter(Boolean).join(' - '))}</div>` : ''}
  ${party.gstin ? `<div class="muted">GSTIN: ${esc(party.gstin)}</div>` : ''}
  ${party.pan ? `<div class="muted">PAN: ${esc(party.pan)}</div>` : ''}
</div>`;

  const itemBlocks = invRows.map((it, i) => {
    const name = it.stock_item_name || it.item_name || it.name || '';
    const qty = it.billed_qty ?? it.actual_qty ?? it.qty;
    const amount = Math.abs(Number(it.amount) || 0);
    const bits = [`<div class="b">${i + 1}. ${esc(name)}</div>`];
    if (it.hsn) bits.push(`<div>HSN/SAC: ${esc(it.hsn)}</div>`);
    bits.push(`<div>Qty: ${qty != null && qty !== '' ? `${esc(String(qty))}${it.unit ? ` ${esc(it.unit)}` : ''}` : '—'}</div>`);
    if (!hideAmt) {
      if (it.rate != null && it.rate !== '') {
        bits.push(`<div>Rate: ${formatInr(it.rate)}${it.unit ? ` / ${esc(it.unit)}` : ''}</div>`);
      }
      if (Number(it.discount)) bits.push(`<div>Discount: ${formatInr(it.discount)}</div>`);
      bits.push(`<div class="row"><span>Amount</span><span class="b">${formatInr(amount)}</span></div>`);
    }
    return `<div style="margin:8px 0">${bits.join('')}${sep(w)}</div>`;
  }).join('');

  const taxLines = [];
  let taxable = 0;
  if (gst && (Number(gst.cgst_amount) || Number(gst.sgst_amount) || Number(gst.igst_amount))) {
    taxable = Math.abs(Number(gst.taxable_amount) || 0);
    if (taxable) taxLines.push(`<div class="row"><span>Taxable</span><span>${formatInr(taxable)}</span></div>`);
    if (Number(gst.cgst_amount)) taxLines.push(`<div class="row"><span>CGST</span><span>${formatInr(gst.cgst_amount)}</span></div>`);
    if (Number(gst.sgst_amount)) taxLines.push(`<div class="row"><span>SGST</span><span>${formatInr(gst.sgst_amount)}</span></div>`);
    if (Number(gst.igst_amount)) taxLines.push(`<div class="row"><span>IGST</span><span>${formatInr(gst.igst_amount)}</span></div>`);
  } else {
    (ledgerEntries || []).filter(e => GST_RE.test(e.ledger_name || '')).forEach(e => {
      taxLines.push(`<div class="row"><span>${esc(e.ledger_name)}</span><span>${formatInr(e.amount)}</span></div>`);
    });
  }

  const terms = (profile.declarationText || '').trim();
  const bankBits = [
    profile.bankName ? `<div>Bank: ${esc(profile.bankName)}</div>` : '',
    profile.bankAccountNo ? `<div>A/C: ${esc(profile.bankAccountNo)}</div>` : '',
    profile.bankIfsc ? `<div>IFSC: ${esc(profile.bankIfsc)}</div>` : '',
    profile.bankUpi ? `<div>UPI: ${esc(profile.bankUpi)}</div>` : '',
  ].filter(Boolean).join('');

  return `
${companyHeader(company, profile, w)}
${sep(w)}
<div class="c b" style="font-size:${w === 58 ? '11px' : '12px'};letter-spacing:0.4px">${esc(title)}</div>
${hideAmt ? `<div class="c muted">(Item amounts not applicable)</div>` : ''}
${sep(w)}
${meta}
${sep(w)}
${parties}
${sep(w)}
${itemBlocks || `<div class="c muted">No line items</div>${sep(w)}`}
${!hideAmt ? taxLines.join('') : ''}
${!hideAmt ? `<div class="row b" style="margin-top:4px"><span>TOTAL</span><span>${formatInr(grandTotal, true)}</span></div>` : ''}
${dbl(w)}
${!hideAmt ? `<div class="muted">Amount Chargeable (in words)</div><div class="b">${esc(amountInWords(grandTotal))}</div>` : ''}
${voucher.narration ? `<div style="margin-top:4px"><b>Narration:</b> ${esc(voucher.narration)}</div>` : ''}
${terms ? `<div style="margin-top:4px"><b>Terms:</b> ${esc(terms)}</div>` : ''}
${bankBits}
${qrImage ? `<div class="c" style="margin-top:8px"><img src="${esc(qrImage)}" style="width:72px;height:72px;object-fit:contain" alt="QR"/></div>` : ''}
<div style="margin-top:18px;text-align:right">
  <div>for <b>${esc(company.name || '')}</b></div>
  <div style="margin-top:20px;border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:120px">
    Authorised Signatory
  </div>
</div>
`;
}

function renderAccounting(payload, w) {
  const { voucher = {}, company = {}, party = {}, ledgerEntries = [], profile = {}, formatDate = d => d } = payload;
  const title = docTitle(voucher.voucher_type);
  const grandTotal = Math.abs(Number(voucher.party_amount ?? voucher.amount) || 0);
  const entries = (ledgerEntries || []).filter(e => e.ledger_name);

  const noDate = w === 58
    ? `<div>No: ${esc(voucher.voucher_number || '')}</div><div>Date: ${esc(formatDate(voucher.date))}</div>`
    : `<div class="row"><span>No: ${esc(voucher.voucher_number || '')}</span><span>Date: ${esc(formatDate(voucher.date))}</span></div>`;

  const isJournalLike = /journal|contra/i.test(String(voucher.voucher_type || ''));

  if (isJournalLike || entries.length > 1) {
    const blocks = entries.map((e) => {
      const amt = Math.abs(Number(e.amount) || 0);
      const side = Number(e.amount) < 0 ? 'Cr' : 'Dr';
      return `<div style="margin:6px 0">
  <div class="b">${esc(e.ledger_name)}</div>
  <div class="row"><span>${side}</span><span class="b">${formatInr(amt)}</span></div>
</div>`;
    }).join('');

    let dr = 0;
    let cr = 0;
    entries.forEach(e => {
      const amt = Math.abs(Number(e.amount) || 0);
      if (Number(e.amount) < 0) cr += amt;
      else dr += amt;
    });
    if (!dr && !cr) { dr = grandTotal; cr = grandTotal; }

    return `
${companyHeader(company, profile, w)}
${sep(w)}
<div class="c b" style="font-size:${w === 58 ? '11px' : '12px'};letter-spacing:0.5px">${esc(title)}</div>
${sep(w)}
${noDate}
${sep(w)}
<div class="b">PARTICULARS</div>
${sep(w)}
${blocks || `<div class="muted">No entries</div>`}
${sep(w)}
<div class="row"><span class="b">TOTAL DR</span><span class="b">${formatInr(dr)}</span></div>
<div class="row"><span class="b">TOTAL CR</span><span class="b">${formatInr(cr)}</span></div>
${dbl(w)}
<div class="b" style="margin-top:6px">Amount (in words)</div><div>${esc(amountInWords(grandTotal))}</div>
${voucher.narration ? `<div class="b" style="margin-top:6px">ON ACCOUNT OF</div><div>${esc(voucher.narration)}</div>` : ''}
${sep(w)}
<div class="c" style="margin-top:16px">Authorised Signatory</div>
`;
  }

  const partyName = voucher.party_name || party.name || '';
  const through = entries.find(e => e.ledger_name && e.ledger_name !== partyName);

  return `
${companyHeader(company, profile, w)}
${sep(w)}
<div class="c b" style="font-size:${w === 58 ? '11px' : '12px'};letter-spacing:0.5px">${esc(title)}</div>
${sep(w)}
${noDate}
${sep(w)}
<div class="b">Account :</div>
<div class="row" style="margin:4px 0 8px">
  <span class="b">${esc(partyName || '—')}</span>
  <span class="b">${formatInr(grandTotal)}</span>
</div>
${through ? `<div class="b" style="margin-top:8px">Through :</div><div>${esc(through.ledger_name)}</div>` : ''}
${voucher.narration ? `<div class="b" style="margin-top:8px">On Account of :</div><div>${esc(voucher.narration)}</div>` : ''}
<div class="b" style="margin-top:8px">Amount (in words) :</div><div>${esc(amountInWords(grandTotal))}</div>
${sep(w)}
<div class="r b" style="font-size:11px;margin:6px 0">${formatInr(grandTotal, true)}</div>
${dbl(w)}
<div style="display:flex;justify-content:space-between;margin-top:18px">
  <div style="font-size:9px">Receiver's Signature</div>
  <div style="font-size:9px;text-align:right">Authorised Signatory</div>
</div>
`;
}
