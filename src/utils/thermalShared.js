/**
 * Shared thermal PDF helpers — 80mm / 58mm roll profiles (mobile Spec parity).
 * Not a scaled A4 page: fixed narrow width + long height.
 */

export const DEFAULT_THERMAL_PAPER_WIDTH = 80;

export function normalizeThermalWidth(v) {
  return v === 58 || v === '58' ? 58 : DEFAULT_THERMAL_PAPER_WIDTH;
}

/** PDF page size in points (~72pt/inch) for jsPDF / print. */
export function thermalPageSize(width = 80) {
  if (width === 58) return { width: 164, height: 2400 };
  return { width: 226, height: 2400 };
}

/** CSS body width in mm (printable area). */
export function thermalCssWidthMm(width = 80) {
  return width === 58 ? 48 : 72;
}

export function thermalDash(width = 80) {
  return width === 58 ? '------------------------' : '--------------------------------';
}

export function thermalDouble(width = 80) {
  return width === 58 ? '========================' : '================================';
}

export function isThermalTemplateId(id) {
  if (!id) return false;
  const s = String(id);
  return (
    s === 'td_thermal_v1'
    || s === 'td_thermal_commercial_v1'
    || s === 'td_ledger_v1'
    || s === 'td_ledger_commercial_v1'
    || s === 'modern_a'
  );
}

export function wrapThermalHtml(body, opts = {}) {
  const w = normalizeThermalWidth(opts.paperWidth);
  const mm = thermalCssWidthMm(w);
  const page = thermalPageSize(w);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Thermal</title>
<style>
  @page { size: ${page.width}pt ${page.height}pt; margin: 2mm; }
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family: Arial, Helvetica, "Noto Sans", "DejaVu Sans", sans-serif;
    color:#000; background:#fff;
    width:${mm}mm; max-width:100%;
    padding:2mm;
    font-size:${w === 58 ? '9px' : '10px'};
    line-height:1.35;
  }
  .c{text-align:center}
  .r{text-align:right}
  .b{font-weight:bold}
  .sep{white-space:pre;font-size:${w === 58 ? '8px' : '9px'};letter-spacing:0;margin:4px 0;overflow:hidden}
  .row{display:flex;justify-content:space-between;gap:6px;margin:1px 0}
  .muted{color:#222}
</style></head><body data-pdf-format="td_thermal_v1" data-thermal-width="${w}">${body}
<div class="c muted" style="margin-top:8px;font-size:8px">Layout: TallyDekho Thermal · ${w}mm</div>
</body></html>`;
}
