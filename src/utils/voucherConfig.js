/** Voucher PDF config — mirrors mobile `app/settings/voucher-config.tsx`. */
import QRCode from 'qrcode';
import {
  DEFAULT_THERMAL_PAPER_WIDTH,
  isThermalTemplateId,
  normalizeThermalWidth,
} from './thermalShared';
import { sanitizeImageSrc } from './sanitizeImageSrc';

export { isThermalTemplateId, normalizeThermalWidth, DEFAULT_THERMAL_PAPER_WIDTH };

export const VOUCHER_TYPES = [
  { id: 'sales_inv', label: 'Sales Invoice' },
  { id: 'purchase_inv', label: 'Purchase Invoice' },
  { id: 'sales_order', label: 'Sales Order' },
  { id: 'purchase_order', label: 'Purchase Order' },
  { id: 'credit_note', label: 'Credit Note' },
  { id: 'debit_note', label: 'Debit Note' },
  { id: 'delivery_note', label: 'Delivery Note' },
  { id: 'payment', label: 'Payment Voucher' },
  { id: 'receipt', label: 'Receipt Voucher' },
  { id: 'expense', label: 'Expense Voucher' },
  { id: 'journal', label: 'Journal Voucher' },
  { id: 'contra', label: 'Contra Voucher' },
];

/** Mobile Spec format ids (PDF only — cream on-screen sheet is fixed). Thermal replaced Ledger. */
export const FORMAT_OPTIONS = [
  { id: 'tally_classic_v1', label: 'Tally Classic' },
  { id: 'td_thermal_v1', label: 'TallyDekho Thermal' },
  { id: 'td_executive_v1', label: 'TallyDekho Executive' },
];

/** Same default terms as mobile (accounting vouchers start with empty terms). */
export const DEFAULT_TERMS = {
  sales_inv: ['Payment due within 30 days of invoice date.', 'Goods once sold will not be returned without prior approval.'],
  purchase_inv: ['All payments subject to receipt and verification of goods.', 'Disputes must be raised within 7 days of receipt.'],
  sales_order: ['Order confirmation required within 48 hours.', 'Prices are valid for 7 days from order date.'],
  purchase_order: ['Delivery must match PO specifications exactly.', 'Advance payment required before dispatch.'],
  credit_note: ['Credit to be adjusted against next invoice.', 'Credit is non-refundable and non-transferable.'],
  debit_note: ['Debit note raised against purchase invoice reference.', 'Amount payable within 15 days of issue.'],
  delivery_note: ['Goods dispatched as per order specifications.', 'Recipient must verify quantity and condition on delivery.'],
};

/** Map voucher_type / document type → voucher_config key (mobile DOC_TYPE_TO_CONFIG_ID). */
export function configIdFromVoucherType(voucherType = '') {
  const s = String(voucherType || '').toLowerCase();
  if (s.includes('proforma')) return 'sales_inv';
  if (s.includes('credit')) return 'credit_note';
  if (s.includes('debit')) return 'debit_note';
  if (s.includes('delivery')) return 'delivery_note';
  if (s.includes('sales order')) return 'sales_order';
  if (s.includes('purchase order')) return 'purchase_order';
  if (s.includes('purchase')) return 'purchase_inv';
  if (s.includes('sales') || s.includes('invoice') || s.includes('quotation')) return 'sales_inv';
  if (s.includes('expense')) return 'expense';
  if (s.includes('receipt')) return 'receipt';
  if (s.includes('payment')) return 'payment';
  if (s.includes('journal')) return 'journal';
  if (s.includes('contra')) return 'contra';
  return 'sales_inv';
}

export function defaultVoucherConfig(id) {
  return {
    format: 'tally_classic_v1',
    bank: 'Cash',
    qrEnabled: false,
    /** Upload image vs generate QR from UPI ID (mobile parity). */
    qrMode: 'generate',
    qrImage: null,
    terms: [...(DEFAULT_TERMS[id] || [])],
    qrUpiId: '',
    thermalPaperWidth: DEFAULT_THERMAL_PAPER_WIDTH,
  };
}

export function defaultAllVoucherConfigs() {
  return Object.fromEntries(VOUCHER_TYPES.map(t => [t.id, defaultVoucherConfig(t.id)]));
}

/** Infer qrMode for configs saved before this field existed. */
export function resolveQrMode(cfg) {
  if (cfg?.qrMode === 'upload' || cfg?.qrMode === 'generate') return cfg.qrMode;
  if (cfg?.qrImage) return 'upload';
  // Legacy qrType: uploaded image wins; otherwise treat as generate-from-UPI.
  if (cfg?.qrType === 'url' || cfg?.qrType === 'bank') return 'generate';
  return 'generate';
}

/** Drop removed Website / Bank Details QR fields from saved configs. */
export function sanitizeVoucherConfig(raw, fallback) {
  const base = fallback && typeof fallback === 'object' ? fallback : defaultVoucherConfig('sales_inv');
  const merged = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    format: resolveDocumentFormat(merged.format),
    thermalPaperWidth: normalizeThermalWidth(merged.thermalPaperWidth ?? base.thermalPaperWidth),
    bank: typeof merged.bank === 'string' && merged.bank ? merged.bank : 'Cash',
    qrEnabled: !!merged.qrEnabled,
    qrMode: resolveQrMode(merged),
    qrImage: merged.qrImage || null,
    terms: Array.isArray(merged.terms) ? merged.terms : base.terms,
    qrUpiId: typeof merged.qrUpiId === 'string' ? merged.qrUpiId : '',
    ...(merged._updatedAt != null ? { _updatedAt: merged._updatedAt } : {}),
  };
}

/** Merge server/local configs onto defaults (mobile applyParsed / sanitizeVConfig). */
export function mergeVoucherConfigs(parsed) {
  const merged = defaultAllVoucherConfigs();
  if (!parsed || typeof parsed !== 'object') return merged;
  Object.keys(parsed).forEach(k => {
    if (!merged[k]) return;
    merged[k] = sanitizeVoucherConfig(parsed[k], merged[k]);
  });
  return merged;
}

const VOUCHER_CONFIG_LOCAL_KEY = 'td_voucher_config';

/** Only non-sensitive layout prefs belong in localStorage (no bank/UPI/QR). */
export function toLocalVoucherConfigCache(configs) {
  if (!configs || typeof configs !== 'object') return {};
  const out = {};
  Object.keys(configs).forEach(k => {
    const c = configs[k];
    if (!c || typeof c !== 'object') return;
    out[k] = {
      format: resolveDocumentFormat(c.format),
      thermalPaperWidth: normalizeThermalWidth(c.thermalPaperWidth),
      ...(c._updatedAt != null ? { _updatedAt: c._updatedAt } : {}),
    };
  });
  return out;
}

export function readLocalVoucherConfig() {
  try {
    const raw = localStorage.getItem(VOUCHER_CONFIG_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const cleaned = toLocalVoucherConfigCache(parsed);
    // Rewrite if legacy cache still held bank/UPI/QR fields.
    if (JSON.stringify(parsed) !== JSON.stringify(cleaned)) {
      writeLocalVoucherConfig(cleaned);
    }
    return cleaned;
  } catch {
    return null;
  }
}

export function writeLocalVoucherConfig(configs) {
  try {
    localStorage.setItem(
      VOUCHER_CONFIG_LOCAL_KEY,
      JSON.stringify(toLocalVoucherConfigCache(configs)),
    );
  } catch { /* quota / private mode */ }
}

export function resolveVoucherConfigSource(serverVc) {
  let parsed = serverVc;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  const serverEmpty = !parsed || typeof parsed !== 'object' || !Object.keys(parsed).length;
  if (serverEmpty) {
    const local = readLocalVoucherConfig();
    if (local) return mergeVoucherConfigs(local);
  }
  const merged = mergeVoucherConfigs(parsed || {});
  const local = readLocalVoucherConfig();
  if (local) {
    Object.keys(local).forEach(k => {
      if (!merged[k] || !local[k]) return;
      const localFmt = resolveDocumentFormat(local[k].format);
      const serverFmt = resolveDocumentFormat(merged[k].format);
      if (localFmt !== 'tally_classic_v1' && serverFmt === 'tally_classic_v1') {
        merged[k] = {
          ...merged[k],
          ...local[k],
          format: localFmt,
          thermalPaperWidth: normalizeThermalWidth(local[k].thermalPaperWidth ?? merged[k].thermalPaperWidth),
        };
      } else if (localFmt !== serverFmt && local[k]._updatedAt > (merged[k]._updatedAt || 0)) {
        merged[k] = {
          ...merged[k],
          ...local[k],
          format: localFmt,
          thermalPaperWidth: normalizeThermalWidth(local[k].thermalPaperWidth ?? merged[k].thermalPaperWidth),
        };
      } else if (isThermalTemplateId(serverFmt) && local[k].thermalPaperWidth != null) {
        // Prefer newer local paper width when formats already match thermal.
        if ((local[k]._updatedAt || 0) >= (merged[k]._updatedAt || 0)) {
          merged[k].thermalPaperWidth = normalizeThermalWidth(local[k].thermalPaperWidth);
        }
      }
    });
  }
  return merged;
}

/**
 * Normalize legacy + mobile format ids → Spec id.
 * Ledger / modern_a / 2 → Thermal (mobile migration).
 */
export function resolveDocumentFormat(format) {
  if (typeof format === 'number') {
    if (format === 2) return 'td_thermal_v1';
    if (format === 3) return 'td_executive_v1';
    return 'tally_classic_v1';
  }
  if (
    format === 'td_thermal_v1'
    || format === 'td_ledger_v1'
    || format === 'modern_a'
    || format === '2'
    || format === 'tallydekho_ledger'
    || format === 'tallydekho_thermal'
  ) {
    return 'td_thermal_v1';
  }
  if (format === 'td_executive_v1' || format === 'modern_b' || format === '3' || format === 'tallydekho_executive') {
    return 'td_executive_v1';
  }
  return 'tally_classic_v1';
}

export function bankInfoFromConfig(cfg, bankRows = []) {
  if (!cfg?.bank) return null;
  const name = cfg.bank || 'Cash';
  const row = bankRows.find(b => (b.name || b) === name);
  const mode = resolveQrMode(cfg);
  const upiId =
    cfg?.qrEnabled && mode === 'generate' && String(cfg.qrUpiId || '').trim()
      ? String(cfg.qrUpiId).trim()
      : null;

  if (name === 'Cash') {
    return {
      bankName: null,
      // A/C + IFSC come from Default Bank ledger only
      accountNo: null,
      ifsc: null,
      upiId,
    };
  }
  return {
    bankName: name,
    accountNo: row?.account_number || row?.accountNo || null,
    ifsc: row?.ifsc || row?.ifsc_code || null,
    upiId,
  };
}

/** Mask account number for list/cards — same idea as mobile `maskAccountNo`. */
export function maskBankAccountNo(raw) {
  const ac = String(raw || '').trim();
  if (!ac) return '';
  if (ac.length < 4) return `•••• ${ac}`;
  return `•••• ${ac.slice(-4)}`;
}

/** Credit-card style mask — mobile `formatCardNumber`. */
export function formatBankCardNumber(raw) {
  const ac = String(raw || '').trim();
  if (!ac) return '';
  const last4 = ac.slice(-4);
  const masked = ac.slice(0, -4).replace(/./g, '•');
  const groups = [];
  for (let i = 0; i < masked.length; i += 4) groups.push(masked.slice(i, i + 4));
  groups.push(last4);
  return groups.join(' ');
}

/** @deprecated Use resolveQrMode — kept for any leftover callers. */
export function normalizeQrType(qrType) {
  if (qrType === 'upload') return 'upload';
  if (qrType === 'generate' || qrType === 'upi' || qrType === 'url' || qrType === 'bank') return 'generate';
  return 'generate';
}

function qrPayloadFromConfig(cfg) {
  if (!cfg?.qrEnabled) return null;
  // Upload mode never auto-generates
  if (resolveQrMode(cfg) === 'upload') return null;
  const upi = String(cfg.qrUpiId || '').trim();
  if (!upi) return null;
  return `upi://pay?pa=${upi}`;
}

/** Public helper for live UI preview. */
export function getQrPayloadFromConfig(cfg) {
  return qrPayloadFromConfig(cfg);
}

/** Client-side QR data URL — never sends UPI/bank data to third parties. */
export async function qrDataUrlFromConfig(cfg) {
  if (!cfg?.qrEnabled) return null;

  const mode = resolveQrMode(cfg);
  if (mode === 'upload') {
    return sanitizeImageSrc(cfg.qrImage);
  }

  const payload = qrPayloadFromConfig({ ...cfg, qrMode: 'generate', qrImage: null });
  if (!payload) return null;
  try {
    return await QRCode.toDataURL(payload, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}
