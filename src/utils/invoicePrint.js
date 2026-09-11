// Branded invoice print template — parity with the mobile app's PDF layouts.
// Renders company header + logo, party & GST details, itemized table, tax
// breakdown, totals in words, bank details and declaration/terms from the
// company print profile, then opens the browser print dialog.

import { sanitizeImageSrc } from './sanitizeImageSrc';

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
  format = 'tally_classic_v1',
  qrImage = null,
}) {
  const safeLogo = sanitizeImageSrc(logoUrl) || '';
  const safeQr = sanitizeImageSrc(qrImage) || '';
  const title = docTitle(voucher.voucher_type);
  const grandTotal = Math.abs(Number(voucher.party_amount ?? voucher.amount) || 0);
  const fmt = String(format || 'tally_classic_v1');
  // Thermal is rendered by buildThermalHTML — if it reaches here, treat as classic.
  const isLedger = false;
  const isExec = fmt === 'td_executive_v1' || fmt === 'modern_b';
  // Classic: black ruled Tally look · Executive: cream shell + charcoal
  const accent = isExec ? '#3D3A34' : '#000000';
  const thBg = isExec ? '#3D3A34' : '#000000';
  const grandBg = isExec ? '#3D3A34' : '#000000';
  const r = isExec ? '6px' : '0';
  const borderStyle = isExec ? '1px solid #ddd' : '1px solid #000';
  const wordsBg = isExec ? '#F4F1E9' : '#f5f5f5';

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
    ['UPI', profile.bankUpi],
    ['Branch', profile.bankBranch],
  ].filter(([, v]) => v);

  const terms = (profile.declarationText || '').trim();
  const formatLabel = isExec ? 'TallyDekho Executive' : isLedger ? 'TallyDekho Ledger' : 'Tally Classic';

  const companyBlock = `
    ${safeLogo ? `<img class="logo" src="${esc(safeLogo)}" alt="logo">` : ''}
    <div>
      <h1>${esc(company.name || company.formal_name || '')}</h1>
      ${compAddr.map(l => `<div class="muted">${esc(l)}</div>`).join('')}
      <div class="muted">${[company.state, company.pincode].filter(Boolean).map(esc).join(' - ')}</div>
      <div class="muted">${[gstin && `GSTIN: ${gstin}`, pan && `PAN: ${pan}`].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="muted">${[phone, email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>`;

  const partyBlock = `
    <h3>${esc(partyHeading(voucher.voucher_type))}</h3>
    <b>${esc(voucher.party_name || party.name || '')}</b>
    ${partyAddr.map(l => `<div class="muted">${esc(l)}</div>`).join('')}
    <div class="muted">${[party.state_name, party.pincode].filter(Boolean).map(esc).join(' - ')}</div>
    <div class="muted">${[party.gstin && `GSTIN: ${party.gstin}`, party.pan && `PAN: ${party.pan}`].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="muted">${[party.phone || party.mobile, party.email].filter(Boolean).map(esc).join(' · ')}</div>`;

  const detailsBlock = `
    <h3>Details</h3>
    <table class="kv">${metaRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;

  const itemsTable = `
<table class="items">
  <thead><tr>
    <th class="c" style="width:34px">#</th><th>${useLedgerRows ? 'Particulars' : 'Item'}</th>
    ${hasHsn ? '<th class="c" style="width:80px">HSN/SAC</th>' : ''}
    <th class="r" style="width:90px">Qty</th><th class="r" style="width:90px">Rate</th>
    ${hasDisc ? '<th class="r" style="width:80px">Disc.</th>' : ''}
    <th class="r" style="width:110px">Amount</th>
  </tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="${colCount}" class="c muted">No line items</td></tr>`}</tbody>
</table>`;

  const footBlocks = `
<div class="foot">
  ${bankRows.length || safeQr ? `<div class="box"><h3>Bank Details</h3>${bankRows.length ? `<table class="kv">${bankRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}${safeQr ? `<div style="margin-top:8px"><img src="${esc(safeQr)}" alt="QR" style="width:72px;height:72px;object-fit:contain"/></div>` : ''}</div>` : ''}
  ${terms ? `<div class="box"><h3>Terms &amp; Conditions</h3><div class="terms">${esc(terms)}</div></div>` : ''}
  <div class="box sign"><div class="muted">For ${esc(company.name || '')}</div><div class="line">Authorised Signatory</div></div>
</div>`;

  // Three structurally different chrome layouts (not just color swaps).
  let bodyHtml;
  if (isLedger) {
    bodyHtml = `
<div class="ledger-banner">
  <div class="co">${companyBlock}</div>
  <div class="ledger-title">${esc(title)}</div>
</div>
<div class="cols">
  <div class="col">${partyBlock}</div>
  <div class="col">${detailsBlock}</div>
</div>
${itemsTable}
<div class="bottom"><table class="totals">${totalsHtml}</table></div>
<div class="words"><b>Amount in words:</b> ${esc(amountInWords(grandTotal))}</div>
${voucher.narration ? `<div class="words"><b>Narration:</b> ${esc(voucher.narration)}</div>` : ''}
${footBlocks}`;
  } else if (isExec) {
    bodyHtml = `
<div class="exec-shell">
  <div class="exec-top">
    <div class="exec-left">${companyBlock}</div>
    <div class="exec-right">
      <div class="exec-doc">${esc(title)}</div>
      <table class="kv">${metaRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    </div>
  </div>
  <div class="exec-party">${partyBlock}</div>
  ${itemsTable}
  <div class="bottom"><table class="totals">${totalsHtml}</table></div>
  <div class="words"><b>Amount in words:</b> ${esc(amountInWords(grandTotal))}</div>
  ${voucher.narration ? `<div class="words"><b>Narration:</b> ${esc(voucher.narration)}</div>` : ''}
  ${footBlocks}
</div>`;
  } else {
    bodyHtml = `
<div class="ribbon">${esc(title)}</div>
<div class="head classic-head">
  <div class="co classic-co">${companyBlock}</div>
  <div class="doc-meta"><b># ${esc(voucher.voucher_number || '')}</b> · ${esc(formatDate(voucher.date))}</div>
</div>
<div class="cols">
  <div class="col">${partyBlock}</div>
  <div class="col">${detailsBlock}</div>
</div>
${itemsTable}
<div class="bottom"><table class="totals">${totalsHtml}</table></div>
<div class="words"><b>Amount in words:</b> ${esc(amountInWords(grandTotal))}</div>
${voucher.narration ? `<div class="words" style="background:#fafafa;border-color:#bbb"><b>Narration:</b> ${esc(voucher.narration)}</div>` : ''}
${footBlocks}`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(voucher.voucher_number || title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 12mm; }
  body { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 16px 18px;
         background: ${isExec ? '#F7F4EC' : '#fff'}; }
  .ribbon { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .6px;
            padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
            background: #fff; color: #1a1a1a; margin-bottom: 8px; }
  .classic-head { text-align: center; padding-bottom: 10px; border-bottom: 1px solid #000; margin-bottom: 10px; }
  .classic-co { display: block; }
  .classic-co .logo { display: block; margin: 0 auto 6px; }
  .ledger-banner { background: #1B3A5C; color: #fff; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
  .ledger-banner .muted { color: rgba(255,255,255,.78) !important; }
  .ledger-banner h1 { color: #fff; font-size: 16px; }
  .ledger-banner .co { display: flex; gap: 12px; align-items: flex-start; }
  .ledger-title { margin-top: 10px; text-align: center; font-size: 13px; font-weight: 700;
                  letter-spacing: .8px; border-top: 1px solid rgba(255,255,255,.25); padding-top: 8px; }
  .exec-shell { border: 1px solid #C9C2B4; border-left: 6px solid #3D3A34; background: #FFFEFA;
                border-radius: 4px; padding: 14px; }
  .exec-top { display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 2px solid #3D3A34; }
  .exec-left { flex: 1.2; } .exec-right { flex: 1; }
  .exec-doc { font-size: 15px; font-weight: 800; color: #3D3A34; margin-bottom: 8px; letter-spacing: .3px; }
  .exec-party { border: 1px solid #D9D2C4; background: #F4F1E9; border-radius: 4px; padding: 10px; margin-bottom: 12px; }
  .co { display: flex; gap: 12px; align-items: flex-start; }
  .logo { max-height: 48px; max-width: 110px; object-fit: contain; }
  h1 { font-size: ${isExec ? '15px' : '14px'}; letter-spacing: .2px; }
  .muted { color: #555; font-size: 10px; }
  .doc-meta { margin-top: 6px; font-size: 10px; }
  .cols { display: flex; gap: 12px; margin: 10px 0; }
  .col { flex: 1; border: ${borderStyle}; border-radius: ${r}; padding: 8px 10px;
         background: ${isLedger ? '#F7FAFC' : '#fff'}; }
  .col h3 { font-size: 9px; text-transform: uppercase; letter-spacing: .7px; color: ${accent}; margin-bottom: 4px; }
  .col b { font-size: 12px; }
  .kv td { padding: 1.5px 0; font-size: 10.5px; vertical-align: top; }
  .kv td:first-child { color: #666; padding-right: 10px; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items th { background: ${thBg}; color: #fff; font-size: 9.5px; text-transform: uppercase;
                   letter-spacing: .4px; padding: 6px 7px; text-align: left;
                   border: ${(!isLedger && !isExec) ? '1px solid #000' : 'none'}; }
  table.items td { border: ${(!isLedger && !isExec) ? '1px solid #000' : 'none'};
                   border-bottom: 1px solid #e5e5e5; padding: 5px 7px; font-size: 10.5px;
                   background: ${isExec ? '#FFFEFA' : '#fff'}; }
  table.items .sub { font-size: 9px; color: #777; }
  .r { text-align: right; } .c { text-align: center; }
  table.items th.r { text-align: right; } table.items th.c { text-align: center; }
  .bottom { display: flex; gap: 16px; margin-top: 10px; align-items: flex-start; }
  .totals { margin-left: auto; width: 240px; border-collapse: collapse; }
  .totals td { padding: 3px 7px; font-size: 11px; border-bottom: 1px solid #eee; }
  .totals .grand td { background: ${grandBg}; color: #fff; font-weight: 700; font-size: 12px; border: 0; }
  .words { margin-top: 8px; padding: 7px 9px; background: ${wordsBg}; border-left: 3px solid ${accent};
           font-size: 10.5px; font-style: italic; }
  .foot { display: flex; gap: 12px; margin-top: 12px; align-items: stretch; }
  .box { flex: 1; border: ${borderStyle}; border-radius: ${r}; padding: 8px 10px; background: #fff; }
  .box h3 { font-size: 9px; text-transform: uppercase; letter-spacing: .7px; color: ${accent}; margin-bottom: 4px; }
  .terms { white-space: pre-wrap; font-size: 10px; color: #444; }
  .sign { text-align: right; display: flex; flex-direction: column; justify-content: flex-end; }
  .sign .line { margin-top: 36px; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; }
  .cancel { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 64px;
            color: rgba(200,30,30,.18); font-weight: 800; transform: rotate(-18deg); letter-spacing: 6px; }
  .fmt-tag { text-align: right; font-size: 9px; color: #888; margin-top: 10px; letter-spacing: .2px; }
  @media print { body { padding: 0; } }
</style></head><body data-pdf-format="${esc(fmt)}">
${voucher.is_cancelled ? '<div class="cancel">CANCELLED</div>' : ''}
${bodyHtml}
<div class="fmt-tag">Layout: ${esc(formatLabel)}</div>
</body></html>`;
}

function mountHtmlFrame(html, { width = 794, height = 1123, visible = false } = {}) {
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'document-render');
  frame.style.cssText = visible
    ? 'border:0;width:100%;height:100%;background:#fff;'
    : `position:fixed;left:-12000px;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  return frame;
}

async function waitForFrameReady(frame) {
  const doc = frame.contentDocument || frame.contentWindow.document;
  const imgs = Array.from(doc.images || []);
  await Promise.all(imgs.map(img => (img.complete
    ? null
    : new Promise(r => { img.onload = r; img.onerror = r; }))));
  await new Promise(r => setTimeout(r, 80));
}

/**
 * Render settings-layout HTML to a real PDF blob (html2canvas + jsPDF).
 * @param {string} html
 * @param {{ thermalPaperWidth?: 80|58|null }} [opts]
 */
export async function htmlToPdfBlob(html, opts = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const thermalW = opts.thermalPaperWidth === 58 || opts.thermalPaperWidth === 80
    ? opts.thermalPaperWidth
    : null;
  const frameW = thermalW === 58 ? 220 : thermalW === 80 ? 300 : 794;
  const frame = mountHtmlFrame(html, { width: frameW, height: thermalW ? 2400 : 1123 });
  try {
    await waitForFrameReady(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    const target = doc.body || doc.documentElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(target.scrollWidth || frameW, frameW),
      windowHeight: Math.max(target.scrollHeight || 1123, thermalW ? 400 : 1123),
    });
    if (thermalW) {
      const pageW = thermalW;
      const imgW = pageW - 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const pageH = Math.min(Math.max(imgH + 4, 80), 2000);
      const pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: 'portrait' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      let heightLeft = imgH;
      let position = 1;
      pdf.addImage(imgData, 'JPEG', 1, position, imgW, imgH);
      heightLeft -= (pageH - 2);
      while (heightLeft > 2) {
        position = position - (pageH - 2);
        pdf.addPage([pageW, pageH]);
        pdf.addImage(imgData, 'JPEG', 1, position, imgW, imgH);
        heightLeft -= (pageH - 2);
      }
      return pdf.output('blob');
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * pageW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

/** @deprecated Prefer inline PdfHtmlPreviewOverlay — kept for rare fallbacks. */
export function openPdfPreview(html, title = 'Document preview') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error('Popup blocked — allow popups to preview the PDF');
  }
  try { w.document.title = title; } catch { /* ignore */ }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download HTML as a printable .html file (legacy fallback). */
export function downloadPdfHtml(html, filename = 'document.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ── Print runner: hidden iframe keeps the app page untouched ────────────── */
export function printInvoice(html) {
  const frame = mountHtmlFrame(html);
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow.onafterprint = cleanup;
  waitForFrameReady(frame).then(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { cleanup(); }
  });
  // Safety cleanup if afterprint never fires (some browsers).
  setTimeout(() => { if (document.body.contains(frame)) frame.remove(); }, 60000);
}
