// Invoice PDF — 3 professional templates: TallyClassic (default), Modern, Minimal
import { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { formatAmount as _formatAmount, formatAmountCompact as _formatAmountCompact, DEFAULT_FORMAT_SETTINGS } from '../utils/format';

const fmt  = n => '₹' + (Math.abs(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (qty, unit) => `${qty || 0}${unit ? ' ' + unit : ''}`;

export function getPDFTemplate(companyGuid) {
  try {
    return localStorage.getItem(`pdf_template_${companyGuid}`) || 'tally_classic';
  } catch { return 'tally_classic'; }
}
export function setPDFTemplate(companyGuid, tpl) {
  try { localStorage.setItem(`pdf_template_${companyGuid}`, tpl); } catch {}
}

// ─── Template: TallyClassic ───────────────────────────────────────────────────
function buildTallyClassicHTML(inv) {
  const items = inv.items || [];
  const rows = items.map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td><strong>${item.name || '—'}</strong></td>
      <td style="text-align:center">${item.hsn || '—'}</td>
      <td style="text-align:center">${fmtQ(item.qty, item.unit)}</td>
      <td style="text-align:right">${fmt(item.rate)}</td>
      <td style="text-align:center">${item.tax || '0'}%</td>
      <td style="text-align:right"><strong>${fmt(item.amount)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${inv.ref || 'Invoice'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#1A1A1A;background:#fff}
    .wrap{max-width:800px;margin:0 auto;padding:28px 32px}
    .top-bar{background:#1A1A1A;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;margin:-28px -32px 24px}
    .top-bar .co{font-size:16px;font-weight:700;letter-spacing:.5px}
    .top-bar .title{font-size:13px;font-weight:600;opacity:.8;letter-spacing:2px}
    .inv-meta{display:flex;justify-content:space-between;margin-bottom:20px}
    .inv-meta .box{border:1px solid #D0D5DD;padding:12px 16px;border-radius:4px;min-width:200px}
    .inv-meta .box .lbl{font-size:9px;text-transform:uppercase;color:#787774;letter-spacing:.8px;margin-bottom:3px}
    .inv-meta .box .val{font-size:13px;font-weight:700;color:#1A1A1A}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;padding:14px 16px;border:1px solid #D0D5DD;border-radius:4px;background:#F9FAFB}
    .party-lbl{font-size:9px;text-transform:uppercase;color:#787774;letter-spacing:.8px;margin-bottom:5px}
    .party-name{font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:3px}
    .party-sub{font-size:10px;color:#787774;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#1A1A1A;color:#fff}
    th{padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
    td{padding:8px 10px;border-bottom:1px solid #F0F0F0;font-size:11px;vertical-align:middle}
    tbody tr:nth-child(even){background:#F9FAFB}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:20px}
    .totals{width:260px}
    .t-row{display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid #F0F0F0}
    .t-row.grand{font-size:14px;font-weight:700;color:#1A1A1A;border-top:2px solid #1A1A1A;border-bottom:none;padding-top:8px;margin-top:4px}
    .footer-bar{background:#F9FAFB;border:1px solid #D0D5DD;border-radius:4px;padding:12px 16px;display:flex;justify-content:space-between;font-size:10px;color:#787774}
    .sign-box{text-align:right}
    .sign-line{border-top:1px solid #1A1A1A;width:160px;margin:28px 0 4px auto}
    .stamp{text-align:center;margin-top:16px;font-size:9px;color:#AEACA8;padding-top:10px;border-top:1px solid #E8E7E3}
    @media print{@page{size:A4;margin:10mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="wrap">
    <div class="top-bar">
      <div class="co">${inv.companyName || 'Your Company'}</div>
      <div class="title">TAX INVOICE</div>
    </div>
    <div class="inv-meta">
      <div class="box"><div class="lbl">Invoice No.</div><div class="val">${inv.ref || '—'}</div></div>
      <div class="box"><div class="lbl">Date</div><div class="val">${inv.date || '—'}</div></div>
      <div class="box"><div class="lbl">Payment Terms</div><div class="val">${inv.mode || 'Credit'}</div></div>
      ${inv.companyGstin ? `<div class="box"><div class="lbl">Supplier GSTIN</div><div class="val">${inv.companyGstin}</div></div>` : ''}
    </div>
    <div class="parties">
      <div>
        <div class="party-lbl">Billed From</div>
        <div class="party-name">${inv.companyName || '—'}</div>
        <div class="party-sub">${inv.companyAddress || ''}<br>${inv.companyGstin ? 'GSTIN: ' + inv.companyGstin : ''}</div>
      </div>
      <div>
        <div class="party-lbl">Billed To</div>
        <div class="party-name">${inv.customer || '—'}</div>
        <div class="party-sub">${inv.address || ''}${inv.gstin ? '<br>GSTIN: ' + inv.gstin : ''}${inv.phone ? '<br>Ph: ' + inv.phone : ''}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th>Item / Service</th>
        <th style="width:64px;text-align:center">HSN</th>
        <th style="width:72px;text-align:center">Qty</th>
        <th style="width:80px;text-align:right">Rate</th>
        <th style="width:52px;text-align:center">GST</th>
        <th style="width:90px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals-wrap"><div class="totals">
      <div class="t-row"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>
      ${inv.discount > 0 ? `<div class="t-row"><span>Discount</span><span style="color:#C0392B">– ${fmt(inv.discount)}</span></div>` : ''}
      ${inv.cgst > 0 ? `<div class="t-row"><span>CGST</span><span>${fmt(inv.cgst)}</span></div>` : ''}
      ${inv.sgst > 0 ? `<div class="t-row"><span>SGST</span><span>${fmt(inv.sgst)}</span></div>` : ''}
      ${inv.igst > 0 ? `<div class="t-row"><span>IGST</span><span>${fmt(inv.igst)}</span></div>` : ''}
      <div class="t-row grand"><span>Grand Total</span><span>${fmt(inv.total)}</span></div>
    </div></div>
    ${inv.narration ? `<div style="margin-bottom:16px;padding:10px 14px;background:#FFF9EC;border:1px solid #FDE68A;border-radius:4px;font-size:10px;color:#92400E"><strong>Narration:</strong> ${inv.narration}</div>` : ''}
    <div class="footer-bar">
      <div><strong>Terms &amp; Conditions:</strong><br>${inv.terms || 'Payment due within 30 days of invoice date.'}</div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div><strong>${inv.companyName || 'Authorised Signatory'}</strong></div>
        <div style="font-size:9px;color:#AEACA8">Authorised Signatory</div>
      </div>
    </div>
    <div class="stamp">Computer generated invoice · TallyDekho · ${inv.companyName || ''}</div>
  </div></body></html>`;
}

// ─── Template: Modern ─────────────────────────────────────────────────────────
function buildModernHTML(inv) {
  const items = inv.items || [];
  const rows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div style="font-weight:600;color:#111">${item.name || '—'}</div>${item.hsn ? `<div style="font-size:9px;color:#787774">HSN: ${item.hsn}</div>` : ''}</td>
      <td style="text-align:center">${fmtQ(item.qty, item.unit)}</td>
      <td style="text-align:right">${fmt(item.rate)}</td>
      <td style="text-align:center">${item.tax || '0'}%</td>
      <td style="text-align:right;font-weight:700">${fmt(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${inv.ref || 'Invoice'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#1A1A1A;background:#fff}
    .wrap{max-width:800px;margin:0 auto;padding:40px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px}
    .brand{width:48px;height:48px;background:#0D9488;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800;margin-bottom:8px;text-align:center;line-height:48px}
    .co-name{font-size:14px;font-weight:700;color:#1A1A1A}
    .co-sub{font-size:10px;color:#787774;margin-top:2px;line-height:1.5}
    .inv-title{text-align:right}
    .inv-title h1{font-size:32px;font-weight:800;color:#0D9488;letter-spacing:-1px}
    .inv-title .inv-num{font-size:13px;font-weight:600;color:#1A1A1A;margin-top:4px}
    .inv-title .inv-date{font-size:11px;color:#787774;margin-top:2px}
    .divider{height:3px;background:linear-gradient(90deg,#0D9488,#2563EB);border-radius:2px;margin-bottom:28px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .party-card{padding:16px;border-radius:8px;background:#F9FAFB;border:1px solid #E5E7EB}
    .party-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#0D9488;font-weight:700;margin-bottom:6px}
    .party-name{font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:4px}
    .party-sub{font-size:10px;color:#787774;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead tr{border-bottom:2px solid #0D9488}
    th{padding:10px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#787774;font-weight:600}
    td{padding:10px 8px;border-bottom:1px solid #F0F0F0;font-size:11px}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:24px}
    .totals{width:240px}
    .t-row{display:flex;justify-content:space-between;padding:5px 0;font-size:11px;color:#787774}
    .t-grand{display:flex;justify-content:space-between;padding:10px 12px;background:#0D9488;color:#fff;border-radius:6px;font-size:14px;font-weight:700;margin-top:8px}
    .footer{display:grid;grid-template-columns:1fr auto;gap:24px;padding-top:20px;border-top:1px solid #E5E7EB;margin-top:8px}
    .sign-area{text-align:right}
    .sign-line{height:1px;background:#1A1A1A;width:140px;margin:24px 0 4px auto}
    .stamp{text-align:center;font-size:9px;color:#AEACA8;margin-top:16px}
    @media print{@page{size:A4;margin:8mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="wrap">
    <div class="header">
      <div>
        <div class="brand">${(inv.companyName || 'T').charAt(0)}</div>
        <div class="co-name">${inv.companyName || 'Your Company'}</div>
        <div class="co-sub">${inv.companyAddress || ''}${inv.companyGstin ? '<br>GSTIN: ' + inv.companyGstin : ''}</div>
      </div>
      <div class="inv-title">
        <h1>INVOICE</h1>
        <div class="inv-num">${inv.ref || '—'}</div>
        <div class="inv-date">${inv.date || '—'}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="parties">
      <div class="party-card">
        <div class="party-lbl">From</div>
        <div class="party-name">${inv.companyName || '—'}</div>
        <div class="party-sub">${inv.companyAddress || ''}${inv.companyGstin ? '<br>GSTIN: ' + inv.companyGstin : ''}</div>
      </div>
      <div class="party-card">
        <div class="party-lbl">To</div>
        <div class="party-name">${inv.customer || '—'}</div>
        <div class="party-sub">${inv.address || ''}${inv.gstin ? '<br>GSTIN: ' + inv.gstin : ''}${inv.phone ? '<br>Ph: ' + inv.phone : ''}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th>Item / Service</th>
        <th style="width:80px;text-align:center">Qty</th>
        <th style="width:80px;text-align:right">Rate</th>
        <th style="width:52px;text-align:center">GST</th>
        <th style="width:90px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals-wrap"><div class="totals">
      <div class="t-row"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>
      ${inv.discount > 0 ? `<div class="t-row"><span>Discount</span><span style="color:#C0392B">– ${fmt(inv.discount)}</span></div>` : ''}
      ${inv.cgst > 0 ? `<div class="t-row"><span>CGST</span><span>${fmt(inv.cgst)}</span></div>` : ''}
      ${inv.sgst > 0 ? `<div class="t-row"><span>SGST</span><span>${fmt(inv.sgst)}</span></div>` : ''}
      ${inv.igst > 0 ? `<div class="t-row"><span>IGST</span><span>${fmt(inv.igst)}</span></div>` : ''}
      <div class="t-grand"><span>Grand Total</span><span>${fmt(inv.total)}</span></div>
    </div></div>
    ${inv.narration ? `<div style="margin-bottom:20px;padding:10px 14px;background:#E8F5ED;border-left:3px solid #0D9488;font-size:10px;color:#065F46"><strong>Note:</strong> ${inv.narration}</div>` : ''}
    <div class="footer">
      <div style="font-size:10px;color:#787774"><strong style="color:#1A1A1A">Terms:</strong><br>${inv.terms || 'Payment due within 30 days.'}</div>
      <div class="sign-area">
        <div class="sign-line"></div>
        <div style="font-size:10px;font-weight:600">${inv.companyName || ''}</div>
        <div style="font-size:9px;color:#787774">Authorised Signatory</div>
      </div>
    </div>
    <div class="stamp">Generated by TallyDekho · ${inv.companyName || ''}</div>
  </div></body></html>`;
}

// ─── Template: Minimal ────────────────────────────────────────────────────────
function buildMinimalHTML(inv) {
  const items = inv.items || [];
  const rows = items.map((item, i) => `
    <tr>
      <td style="color:#787774">${i + 1}</td>
      <td>${item.name || '—'}${item.hsn ? `<span style="font-size:9px;color:#AEACA8;margin-left:8px">HSN ${item.hsn}</span>` : ''}</td>
      <td style="text-align:center;color:#787774">${fmtQ(item.qty, item.unit)}</td>
      <td style="text-align:right;color:#787774">${fmt(item.rate)}</td>
      <td style="text-align:center;color:#787774">${item.tax || '0'}%</td>
      <td style="text-align:right;font-weight:600">${fmt(item.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${inv.ref || 'Invoice'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#1A1A1A;background:#fff}
    .wrap{max-width:740px;margin:0 auto;padding:48px}
    .header{margin-bottom:40px}
    .header-top{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #1A1A1A;margin-bottom:24px}
    .co-name{font-size:18px;font-weight:700;letter-spacing:-.3px}
    .co-sub{font-size:9px;color:#787774;margin-top:4px;line-height:1.6}
    .inv-head h1{font-size:24px;font-weight:400;letter-spacing:2px;text-transform:uppercase;text-align:right;color:#1A1A1A}
    .inv-head .num{font-size:11px;color:#787774;text-align:right;margin-top:6px}
    .meta-row{display:flex;gap:32px;font-size:10px;color:#787774;margin-bottom:32px}
    .meta-row strong{color:#1A1A1A;display:block;font-size:10px;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead tr{border-bottom:1px solid #1A1A1A}
    th{padding:8px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;color:#787774;font-weight:600}
    td{padding:9px 6px;border-bottom:1px solid #F0F0F0;font-size:11px}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:32px}
    .totals{width:220px}
    .t-row{display:flex;justify-content:space-between;padding:4px 0;font-size:10px;color:#787774;font-family:Arial,sans-serif}
    .t-grand{display:flex;justify-content:space-between;padding:10px 0;font-size:14px;font-weight:700;border-top:1px solid #1A1A1A;margin-top:6px}
    .footer{display:flex;justify-content:space-between;padding-top:24px;border-top:1px solid #E0E0E0;font-size:10px;color:#787774}
    .sign-area{text-align:right}
    .sign-line{height:1px;background:#1A1A1A;width:120px;margin:28px 0 4px auto}
    .stamp{text-align:center;font-size:8px;color:#BDBDBD;margin-top:20px;font-family:Arial,sans-serif;letter-spacing:.5px}
    @media print{@page{size:A4;margin:12mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="wrap">
    <div class="header">
      <div class="header-top">
        <div>
          <div class="co-name">${inv.companyName || 'Your Company'}</div>
          <div class="co-sub">${inv.companyAddress || ''}${inv.companyGstin ? ' · GSTIN: ' + inv.companyGstin : ''}</div>
        </div>
        <div class="inv-head">
          <h1>Tax Invoice</h1>
          <div class="num">${inv.ref || '—'} &nbsp;·&nbsp; ${inv.date || '—'}</div>
        </div>
      </div>
      <div class="meta-row">
        <div><strong>Billed To</strong>${inv.customer || '—'}${inv.address ? '<br>' + inv.address : ''}${inv.gstin ? '<br>GSTIN: ' + inv.gstin : ''}</div>
        <div><strong>Payment</strong>${inv.mode || 'Credit'}</div>
        <div><strong>Due Date</strong>—</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:24px">#</th>
        <th>Description</th>
        <th style="width:72px;text-align:center">Qty</th>
        <th style="width:80px;text-align:right">Rate</th>
        <th style="width:48px;text-align:center">GST</th>
        <th style="width:88px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals-wrap"><div class="totals">
      <div class="t-row"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>
      ${inv.discount > 0 ? `<div class="t-row"><span>Discount</span><span>– ${fmt(inv.discount)}</span></div>` : ''}
      ${inv.cgst > 0 ? `<div class="t-row"><span>CGST</span><span>${fmt(inv.cgst)}</span></div>` : ''}
      ${inv.sgst > 0 ? `<div class="t-row"><span>SGST</span><span>${fmt(inv.sgst)}</span></div>` : ''}
      ${inv.igst > 0 ? `<div class="t-row"><span>IGST</span><span>${fmt(inv.igst)}</span></div>` : ''}
      <div class="t-grand"><span>Grand Total</span><span>${fmt(inv.total)}</span></div>
    </div></div>
    ${inv.narration ? `<div style="margin-bottom:24px;font-size:10px;color:#787774;font-style:italic">"${inv.narration}"</div>` : ''}
    <div class="footer">
      <div>${inv.terms || 'Payment due within 30 days of invoice date.'}</div>
      <div class="sign-area">
        <div class="sign-line"></div>
        <div style="font-weight:600">${inv.companyName || ''}</div>
        <div>Authorised Signatory</div>
      </div>
    </div>
    <div class="stamp">COMPUTER GENERATED INVOICE · TALLYDEKHO</div>
  </div></body></html>`;
}

export function buildInvoiceHTML(inv, template) {
  switch (template) {
    case 'modern':   return buildModernHTML(inv);
    case 'minimal':  return buildMinimalHTML(inv);
    default:         return buildTallyClassicHTML(inv);
  }
}

// ─── Preview component ────────────────────────────────────────────────────────
export default function InvoicePDF({ open, onClose, invoice, companyGuid }) {
  if (!open) return null;

  const template = getPDFTemplate(companyGuid);

  if (!invoice) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <p className="text-sm font-semibold text-[#1A1A1A]">No invoice selected</p>
          <p className="text-xs text-[#787774] mt-2">Open a real voucher to preview the PDF.</p>
          <button onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]">
            Close
          </button>
        </div>
      </div>
    );
  }

  const inv = invoice;

  const handlePrint = () => {
    const html = buildInvoiceHTML(inv, template);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const previewHtml = buildInvoiceHTML(inv, template);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col" style={{ maxWidth: 900, maxHeight: '94vh' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E7E3] flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Invoice Preview</p>
            <p className="text-xs text-[#787774] mt-0.5">
              {inv.ref && inv.ref !== 'Pending' ? inv.ref + ' · ' : ''}{inv.date}
              <span className="ml-2 px-1.5 py-0.5 rounded bg-[#F5F4EF] text-[#787774] text-[10px]">
                {template === 'modern' ? 'Modern' : template === 'minimal' ? 'Minimal' : 'Tally Classic'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors">
              <Printer size={14} /> Print / Download PDF
            </button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#787774] hover:bg-[#F1F0EC]">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* iframe preview */}
        <div className="flex-1 overflow-auto bg-[#F7F6F3] p-4" style={{ minHeight: 0 }}>
          <iframe
            srcDoc={previewHtml}
            className="w-full rounded-xl border border-[#E8E7E3] bg-white shadow-sm"
            style={{ height: '70vh', minHeight: 500 }}
            title="Invoice Preview"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
