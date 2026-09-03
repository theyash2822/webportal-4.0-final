// Branded invoice print template — parity with the mobile app's PDF layouts.
// Renders company header + logo, party & GST details, itemized table, tax
// breakdown, totals in words, bank details and declaration/terms from the
// company print profile, then opens the browser print dialog.

/* ── Amount in words (Indian grouping: Crore / Lakh / Thousand) ──────────── */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${h ? ONES[h] + ' Hundred' : ''}${h && rest ? ' ' : ''}${rest ? twoDigits(rest) : ''}`;
}
function integerWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}
export function amountInWords(value) {
  const num = Math.abs(Number(value) || 0);
  // Convert to total paise first so rounding carries into rupees (1.9999 → 2.00).
  const totalPaise = Math.round(num * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  let words = `Indian Rupees ${integerWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtMoney = (n) => {
  const v = Math.abs(Number(n) || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtQty = (n) => {
  const v = Math.abs(Number(n) || 0);
  return Number.isInteger(v) ? String(v) : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};

const GST_RE = /\b(gst|igst|cgst|sgst|utgst|cess)\b/i;

function docTitle(voucherType = '') {
  const vt = voucherType.toLowerCase();
  if (vt.includes('proforma')) return 'PROFORMA INVOICE';
  if (vt.includes('sales order')) return 'SALES ORDER';
  if (vt.includes('purchase order')) return 'PURCHASE ORDER';
  if (vt.includes('quotation')) return 'QUOTATION';
  if (vt.includes('credit note')) return 'CREDIT NOTE';
  if (vt.includes('debit note')) return 'DEBIT NOTE';
  if (vt.includes('delivery')) return 'DELIVERY NOTE';
  if (vt.includes('receipt')) return 'RECEIPT';
  if (vt.includes('payment')) return 'PAYMENT VOUCHER';
  if (vt.includes('purchase')) return 'PURCHASE INVOICE';
  if (vt.includes('sales')) return 'TAX INVOICE';
  return voucherType ? voucherType.toUpperCase() : 'VOUCHER';
}

const partyHeading = (voucherType = '') => {
  const vt = voucherType.toLowerCase();
  if (vt.includes('purchase') || vt.includes('debit note')) return 'Bill From';
  if (vt.includes('receipt') || vt.includes('payment')) return 'Party';
  return 'Bill To';
};

function addressLines(addr) {
  if (!addr) return [];
  if (Array.isArray(addr)) return addr.filter(Boolean);
  return String(addr).split(/\n|,\s*(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
}

/* ── Template ────────────────────────────────────────────────────────────── */
export function buildInvoiceHTML({
  voucher = {}, company = {}, party = {}, gst = null, items = [],
  ledgerEntries = [], eInvoice = null, eWayBill = null,
  profile = {}, logoUrl = '', formatDate = (d) => d || '',
}) {
  const title = docTitle(voucher.voucher_type);
  const grandTotal = Math.abs(Number(voucher.party_amount ?? voucher.amount) || 0);

  // Item rows (inventory) — fall back to non-party, non-tax ledger rows for
  // accounting-only vouchers so the table is never empty.
  const invRows = (items || []).filter(it =>
    (it.stock_item_name || it.item_name || it.name) &&
    (it.type ? String(it.type).toLowerCase() !== 'ledger' : true));
  const useLedgerRows = invRows.length === 0;
  const ledgerRows = useLedgerRows
    ? (ledgerEntries || []).filter(e => e.ledger_name && e.ledger_name !== voucher.party_name && !GST_RE.test(e.ledger_name))
    : [];

  const hasHsn = invRows.some(it => it.hsn);
  const hasDisc = invRows.some(it => Number(it.discount));

  let subtotal = 0;
  const rowsHtml = (useLedgerRows ? ledgerRows : invRows).map((it, i) => {
    const name = it.stock_item_name || it.item_name || it.name || it.ledger_name || '';
    const qty = it.billed_qty ?? it.actual_qty ?? it.qty;
    const amount = Math.abs(Number(it.amount) || 0);
    subtotal += amount;
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(name)}${it.batch_name ? `<div class="sub">Batch: ${esc(it.batch_name)}</div>` : ''}</td>
      ${hasHsn ? `<td class="c">${esc(it.hsn || '')}</td>` : ''}
      <td class="r">${qty != null && qty !== '' ? `${fmtQty(qty)} ${esc(it.unit || '')}` : '—'}</td>
      <td class="r">${it.rate != null && it.rate !== '' ? fmtMoney(it.rate) : '—'}</td>
      ${hasDisc ? `<td class="r">${Number(it.discount) ? fmtMoney(it.discount) : '—'}</td>` : ''}
      <td class="r">${fmtMoney(amount)}</td>
    </tr>`;
  }).join('');
  const colCount = 5 + (hasHsn ? 1 : 0) + (hasDisc ? 1 : 0);

  // Tax breakdown: prefer gst_voucher_details, fall back to GST ledger entries.
  const taxLines = [];
  if (gst && (Number(gst.cgst_amount) || Number(gst.sgst_amount) || Number(gst.igst_amount))) {
    if (Number(gst.cgst_amount)) taxLines.push(['CGST', Math.abs(Number(gst.cgst_amount))]);
    if (Number(gst.sgst_amount)) taxLines.push(['SGST', Math.abs(Number(gst.sgst_amount))]);
    if (Number(gst.igst_amount)) taxLines.push(['IGST', Math.abs(Number(gst.igst_amount))]);
  } else {
    (ledgerEntries || []).filter(e => GST_RE.test(e.ledger_name || ''))
      .forEach(e => taxLines.push([e.ledger_name, Math.abs(Number(e.amount) || 0)]));
  }
  const taxTotal = taxLines.reduce((s, [, v]) => s + v, 0);
  const roundOff = grandTotal - subtotal - taxTotal;
  const showRound = Math.abs(roundOff) >= 0.005 && Math.abs(roundOff) < 1;

  const taxable = gst && Number(gst.taxable_amount) ? Math.abs(Number(gst.taxable_amount)) : subtotal;
  const totalsHtml = `
    <tr><td>Taxable Amount</td><td class="r">${fmtMoney(taxable)}</td></tr>
    ${taxLines.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="r">${fmtMoney(v)}</td></tr>`).join('')}
    ${showRound ? `<tr><td>Round Off</td><td class="r">${roundOff < 0 ? '(-) ' : ''}${fmtMoney(roundOff)}</td></tr>` : ''}
    <tr class="grand"><td>Grand Total</td><td class="r">&#8377; ${fmtMoney(grandTotal)}</td></tr>`;

  // Company / party blocks
  const compAddr = addressLines(company.address);
  const partyAddr = addressLines(party.address);
  const gstin = company.gstin || profile.gstin || '';
  const pan = company.pan || profile.pan || '';
  const phone = company.phone || company.mobile || profile.phone || '';
  const email = company.email || profile.email || '';

  const metaRows = [
    ['Invoice No.', voucher.voucher_number],
    ['Date', formatDate(voucher.date)],
    ['Reference', voucher.reference],
    ['Place of Supply', gst?.place_of_supply || party.state_name],
    ['GST Reg. Type', gst?.gst_reg_type],
    ['IRN', eInvoice?.irn || gst?.irn],
    ['E-Way Bill No.', eWayBill?.ewb_no],
  ].filter(([, v]) => v);

  const bankRows = [
    ['Bank', profile.bankName],
    ['A/c No.', profile.bankAccountNo],
    ['IFSC', profile.bankIfsc],
    ['Branch', profile.bankBranch],
  ].filter(([, v]) => v);

  const terms = (profile.declarationText || '').trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(voucher.voucher_number || title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 12px/1.45 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 28px 32px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          border-bottom: 3px solid #16803c; padding-bottom: 14px; }
  .co { display: flex; gap: 14px; align-items: flex-start; }
  .logo { max-height: 64px; max-width: 120px; object-fit: contain; }
  h1 { font-size: 19px; letter-spacing: .2px; }
  .muted { color: #555; font-size: 11px; }
  .doc { text-align: right; }
  .doc .t { font-size: 16px; font-weight: 700; color: #16803c; letter-spacing: 1px; }
  .cols { display: flex; gap: 20px; margin: 14px 0; }
  .col { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .col h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #16803c; margin-bottom: 5px; }
  .col b { font-size: 13px; }
  .kv td { padding: 1.5px 0; font-size: 11.5px; vertical-align: top; }
  .kv td:first-child { color: #666; padding-right: 10px; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items th { background: #16803c; color: #fff; font-size: 10.5px; text-transform: uppercase;
                   letter-spacing: .5px; padding: 7px 8px; text-align: left; }
  table.items td { border-bottom: 1px solid #e5e5e5; padding: 6px 8px; font-size: 11.5px; }
  table.items .sub { font-size: 10px; color: #777; }
  .r { text-align: right; } .c { text-align: center; }
  table.items th.r { text-align: right; } table.items th.c { text-align: center; }
  .bottom { display: flex; gap: 20px; margin-top: 12px; align-items: flex-start; }
  .totals { margin-left: auto; width: 260px; border-collapse: collapse; }
  .totals td { padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
  .totals .grand td { background: #16803c; color: #fff; font-weight: 700; font-size: 13px; border: 0; }
  .words { margin-top: 10px; padding: 8px 10px; background: #f4f8f5; border-left: 3px solid #16803c;
           font-size: 11.5px; font-style: italic; }
  .foot { display: flex; gap: 20px; margin-top: 16px; align-items: stretch; }
  .box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #16803c; margin-bottom: 5px; }
  .terms { white-space: pre-wrap; font-size: 10.5px; color: #444; }
  .sign { text-align: right; display: flex; flex-direction: column; justify-content: flex-end; }
  .sign .line { margin-top: 42px; border-top: 1px solid #999; padding-top: 4px; font-size: 11px; }
  .cancel { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 64px;
            color: rgba(200,30,30,.18); font-weight: 800; transform: rotate(-18deg); letter-spacing: 6px; }
  @media print { body { padding: 0; } @page { margin: 14mm 12mm; } }
</style></head><body>
${voucher.is_cancelled ? '<div class="cancel">CANCELLED</div>' : ''}
<div class="head">
  <div class="co">
    ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="logo">` : ''}
    <div>
      <h1>${esc(company.name || company.formal_name || '')}</h1>
      ${compAddr.map(l => `<div class="muted">${esc(l)}</div>`).join('')}
      <div class="muted">${[company.state, company.pincode].filter(Boolean).map(esc).join(' - ')}</div>
      <div class="muted">${[gstin && `GSTIN: ${gstin}`, pan && `PAN: ${pan}`].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="muted">${[phone, email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
  </div>
  <div class="doc">
    <div class="t">${esc(title)}</div>
    <div class="muted"># ${esc(voucher.voucher_number || '')}</div>
    <div class="muted">${esc(formatDate(voucher.date))}</div>
  </div>
</div>
<div class="cols">
  <div class="col">
    <h3>${esc(partyHeading(voucher.voucher_type))}</h3>
    <b>${esc(voucher.party_name || party.name || '')}</b>
    ${partyAddr.map(l => `<div class="muted">${esc(l)}</div>`).join('')}
    <div class="muted">${[party.state_name, party.pincode].filter(Boolean).map(esc).join(' - ')}</div>
    <div class="muted">${[party.gstin && `GSTIN: ${party.gstin}`, party.pan && `PAN: ${party.pan}`].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="muted">${[party.phone || party.mobile, party.email].filter(Boolean).map(esc).join(' · ')}</div>
  </div>
  <div class="col">
    <h3>Details</h3>
    <table class="kv">${metaRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  </div>
</div>
<table class="items">
  <thead><tr>
    <th class="c" style="width:34px">#</th><th>${useLedgerRows ? 'Particulars' : 'Item'}</th>
    ${hasHsn ? '<th class="c" style="width:80px">HSN/SAC</th>' : ''}
    <th class="r" style="width:90px">Qty</th><th class="r" style="width:90px">Rate</th>
    ${hasDisc ? '<th class="r" style="width:80px">Disc.</th>' : ''}
    <th class="r" style="width:110px">Amount</th>
  </tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="${colCount}" class="c muted">No line items</td></tr>`}</tbody>
</table>
<div class="bottom"><table class="totals">${totalsHtml}</table></div>
<div class="words"><b>Amount in words:</b> ${esc(amountInWords(grandTotal))}</div>
${voucher.narration ? `<div class="words" style="background:#fafafa;border-color:#bbb"><b>Narration:</b> ${esc(voucher.narration)}</div>` : ''}
<div class="foot">
  ${bankRows.length ? `<div class="box"><h3>Bank Details</h3><table class="kv">${bankRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
  ${terms ? `<div class="box"><h3>Terms &amp; Conditions</h3><div class="terms">${esc(terms)}</div></div>` : ''}
  <div class="box sign"><div class="muted">For ${esc(company.name || '')}</div><div class="line">Authorised Signatory</div></div>
</div>
</body></html>`;
}

/* ── Print runner: hidden iframe keeps the app page untouched ────────────── */
export function printInvoice(html) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow.onafterprint = cleanup;
  // Wait for images (logo) to load before printing.
  const imgs = Array.from(doc.images || []);
  const ready = Promise.all(imgs.map(img => img.complete ? null
    : new Promise(r => { img.onload = r; img.onerror = r; })));
  ready.then(() => setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { cleanup(); }
  }, 50));
  // Safety cleanup if afterprint never fires (some browsers).
  setTimeout(() => { if (document.body.contains(frame)) frame.remove(); }, 60000);
}
