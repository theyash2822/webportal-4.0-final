/** Barcode label HTML + print/PDF — web parity for mobile labelPrint.ts */
import { jsPDF } from 'jspdf';

export function buildLabelHTML({ itemName, barcode, barcodeType = 'CODE128', copies = 1, widthMm = 50, heightMm = 30 }) {
  const labels = Array.from({ length: Math.max(1, copies) }, (_, i) => `
    <div class="label" style="width:${widthMm}mm;height:${heightMm}mm;border:1px dashed #ccc;padding:3mm;box-sizing:border-box;page-break-inside:avoid;display:inline-block;margin:2mm;vertical-align:top;">
      <div style="font-size:8px;font-weight:600;line-height:1.2;max-height:8mm;overflow:hidden;">${escapeHtml(itemName || 'Item')}</div>
      <div style="font-family:monospace;font-size:11px;font-weight:700;margin:2mm 0;letter-spacing:1px;">${escapeHtml(barcode || '')}</div>
      <div style="font-size:7px;color:#666;">${escapeHtml(barcodeType)}</div>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    @page { size: auto; margin: 5mm; }
    body { font-family: system-ui, sans-serif; margin: 0; }
    @media print { .no-print { display: none; } }
  </style></head><body>${labels}
  <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
  </body></html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function printLabels(opts) {
  const html = buildLabelHTML(opts);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=640,height=480');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export async function downloadLabelsPdf({ itemName, barcode, copies = 1, widthMm = 50, heightMm = 30 }) {
  const pdf = new jsPDF({ orientation: widthMm > heightMm ? 'landscape' : 'portrait', unit: 'mm', format: [widthMm, heightMm] });
  const n = Math.max(1, copies);
  for (let i = 0; i < n; i += 1) {
    if (i > 0) pdf.addPage([widthMm, heightMm]);
    pdf.setFontSize(7);
    pdf.text(String(itemName || 'Item').slice(0, 28), 2, 6);
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(10);
    pdf.text(String(barcode || ''), 2, 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.text('CODE128', 2, heightMm - 3);
  }
  pdf.save(`${(itemName || 'label').replace(/\s+/g, '-').slice(0, 24)}-labels.pdf`);
}
