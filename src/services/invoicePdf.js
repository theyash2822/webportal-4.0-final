// Invoice PDF generation for bulk share/download (jsPDF + autotable).
// Builds one printable invoice page per voucher, merged into a single PDF.
// Uses the company's print profile (bank details, declaration) and logo when set.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from './api';

const INR = n => {
  const num = Number(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = d => {
  if (!d) return '—';
  const s = String(d);
  // Handles YYYYMMDD and ISO dates.
  const iso = /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

async function fetchLogo(companyGuid) {
  try {
    const res = await api.fetchCompanyLogo(companyGuid);
    const logo = res?.data?.logo_url;
    return logo && logo.startsWith('data:image/') ? logo : null;
  } catch { return null; }
}

async function fetchPrintProfile(companyGuid) {
  try {
    const res = await api.fetchPrintProfile(companyGuid);
    return res?.data || {};
  } catch { return {}; }
}

/** Draws one invoice on the current page of `doc`. Returns nothing. */
function drawInvoice(doc, { voucher, items, ledgerEntries, company, profile, logo }) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // ── Header: logo + company identity ──
  if (logo) {
    try {
      const type = /data:image\/(png|jpeg|jpg|webp)/i.exec(logo)?.[1]?.toUpperCase() || 'PNG';
      doc.addImage(logo, type === 'JPG' ? 'JPEG' : type, margin, y, 22, 22);
    } catch { /* corrupt logo — skip */ }
  }
  const headX = logo ? margin + 27 : margin;
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(24, 24, 24);
  doc.text(company?.name || '', headX, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90, 90, 90);
  const addrLines = [
    company?.address,
    [company?.state, company?.country].filter(Boolean).join(', '),
    profile?.gstin || company?.gstin ? `GSTIN: ${profile?.gstin || company?.gstin}` : null,
    [profile?.phone && `Ph: ${profile.phone}`, profile?.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  addrLines.forEach((l, i) => doc.text(String(l), headX, y + 11 + i * 4, { maxWidth: pageW - headX - margin }));

  y += Math.max(24, 12 + addrLines.length * 4) + 4;
  doc.setDrawColor(24, 24, 24).setLineWidth(0.5).line(margin, y, pageW - margin, y);
  y += 7;

  // ── Title + voucher meta ──
  const isCancelled = voucher.is_cancelled === true || voucher.is_cancelled === 1 || voucher.is_cancelled === 'true';
  const title = (voucher.voucher_type || 'Invoice').toUpperCase();
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(24, 24, 24);
  doc.text(title, margin, y);
  if (isCancelled) {
    doc.setTextColor(180, 60, 60).setFontSize(10);
    doc.text('CANCELLED', pageW - margin, y, { align: 'right' });
    doc.setTextColor(24, 24, 24);
  }
  y += 6;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60, 60, 60);
  const metaLeft = [
    `Invoice No: ${voucher.voucher_number || '—'}`,
    `Date: ${fmtDate(voucher.date)}`,
    voucher.reference ? `Reference: ${voucher.reference}` : null,
  ].filter(Boolean);
  const metaRight = [
    'Bill To:',
    voucher.party_name || '—',
  ];
  metaLeft.forEach((l, i) => doc.text(l, margin, y + i * 4.5));
  doc.setFont('helvetica', 'bold');
  doc.text(metaRight[0], pageW / 2 + 10, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(metaRight[1]), pageW / 2 + 10, y + 4.5, { maxWidth: pageW / 2 - 10 - margin });
  y += Math.max(metaLeft.length, 2) * 4.5 + 5;

  // ── Line items table ──
  const stockRows = (items || []).filter(it => it.item_name);
  const body = stockRows.length
    ? stockRows.map((it, i) => [
        i + 1,
        it.item_name + (it.hsn ? `\nHSN: ${it.hsn}` : ''),
        it.qty ? `${Number(it.qty)}${it.unit ? ` ${it.unit}` : ''}` : '—',
        it.rate ? INR(it.rate) : '—',
        INR(Math.abs(Number(it.amount) || 0)),
      ])
    : (items || []).filter(it => it.ledger_name).map((it, i) => [
        i + 1, it.ledger_name, '—', '—', INR(Math.abs(Number(it.amount) || 0)),
      ]);
  const total = Number(voucher.party_amount ?? voucher.amount) || 0;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: body.length ? body : [['—', 'As per voucher', '—', '—', INR(total)]],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, textColor: [40, 40, 40] },
    headStyles: { fillColor: [24, 24, 24], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 4;

  // ── Tax / ledger summary (GST-style entries) ──
  const taxEntries = (ledgerEntries || []).filter(e =>
    /gst|cgst|sgst|igst|cess|tax/i.test(e.ledger_name || '') && e.ledger_name !== voucher.party_name);
  if (taxEntries.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: pageW / 2, right: margin },
      body: taxEntries.map(e => [e.ledger_name, INR(Math.abs(Number(e.amount) || 0))]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [60, 60, 60] },
      columnStyles: { 1: { halign: 'right' } },
      theme: 'plain',
    });
    y = doc.lastAutoTable.finalY + 2;
  }

  // ── Grand total ──
  doc.setDrawColor(24, 24, 24).setLineWidth(0.4).line(pageW / 2, y, pageW - margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(24, 24, 24);
  doc.text('Total', pageW / 2, y);
  doc.text(`Rs. ${INR(total)}`, pageW - margin, y, { align: 'right' });
  y += 10;

  // ── Footer: bank details + declaration + signature ──
  const pageH = doc.internal.pageSize.getHeight();
  const footY = Math.max(y, pageH - 52);
  const bank = [
    profile?.bankName && `Bank: ${profile.bankName}${profile.bankBranch ? `, ${profile.bankBranch}` : ''}`,
    profile?.bankAccountNo && `A/c No: ${profile.bankAccountNo}`,
    profile?.bankIfsc && `IFSC: ${profile.bankIfsc}`,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 90, 90);
  if (bank.length) {
    doc.setFont('helvetica', 'bold').text('Bank Details', margin, footY);
    doc.setFont('helvetica', 'normal');
    bank.forEach((l, i) => doc.text(l, margin, footY + 4 + i * 3.8));
  }
  const decl = profile?.declarationText;
  if (decl) {
    doc.text(doc.splitTextToSize(`Declaration: ${decl}`, pageW - 2 * margin - 60), margin, footY + (bank.length ? 4 + bank.length * 3.8 + 4 : 0));
  }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(60, 60, 60);
  doc.text(`For ${company?.name || ''}`, pageW - margin, footY + 2, { align: 'right' });
  doc.text('Authorised Signatory', pageW - margin, footY + 22, { align: 'right' });
  if (profile?.jurisdiction) {
    doc.setFontSize(7.5).setTextColor(120, 120, 120);
    doc.text(`Subject to ${profile.jurisdiction} jurisdiction. This is a computer-generated document.`, margin, pageH - 8);
  } else {
    doc.setFontSize(7.5).setTextColor(120, 120, 120);
    doc.text('This is a computer-generated document.', margin, pageH - 8);
  }
}

/**
 * Builds one merged PDF for the given register rows (one page per voucher).
 * Fetches voucher details, print profile, and logo. Returns { blob, filename, failures }.
 */
export async function buildInvoicesPdf({ rows, companyGuid, docLabel = 'invoices', onProgress }) {
  if (!rows?.length) throw new Error('No vouchers selected');
  const [profile, logo] = await Promise.all([fetchPrintProfile(companyGuid), fetchLogo(companyGuid)]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let pages = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    onProgress?.(i + 1, rows.length);
    try {
      const res = await api.fetchVoucherDetail({ companyGuid, voucherId: row.id ?? row.guid });
      const payload = res?.data || {};
      const voucher = { ...row, ...(payload.voucher || {}) };
      if (pages > 0) doc.addPage();
      drawInvoice(doc, {
        voucher,
        items: payload.items || [],
        ledgerEntries: payload.ledger_entries || [],
        company: payload.company,
        profile,
        logo,
      });
      pages++;
    } catch (e) {
      failures.push(row.voucher_number || String(row.id ?? row.guid ?? i));
    }
  }
  if (!pages) throw new Error('Could not load any of the selected vouchers');

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = rows.length === 1
    ? `Invoice-${(rows[0].voucher_number || 'voucher').replace(/[^\w.-]+/g, '_')}.pdf`
    : `${(docLabel || 'invoices').replace(/\s+/g, '-')}-${stamp}.pdf`;
  return { blob: doc.output('blob'), filename, failures };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Shares the PDF as a real file via the Web Share API when available
 * (mobile → user picks WhatsApp and the PDF is attached). Falls back to
 * downloading the PDF and opening WhatsApp with the text summary so the
 * user can attach the just-downloaded file.
 * Returns 'shared' | 'downloaded'.
 */
export async function sharePdfOrDownload({ blob, filename, text }) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'shared'; // user closed the sheet
      // fall through to download
    }
  }
  downloadBlob(blob, filename);
  if (text) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  return 'downloaded';
}
