/** Voucher PDF config — mirrors mobile settings/voucher-config.tsx defaults. */
export const VOUCHER_TYPES = [
  { id: 'sales_inv', label: 'Sales Invoice' },
  { id: 'purchase_inv', label: 'Purchase Invoice' },
  { id: 'sales_order', label: 'Sales Order' },
  { id: 'purchase_order', label: 'Purchase Order' },
  { id: 'credit_note', label: 'Credit Note' },
  { id: 'debit_note', label: 'Debit Note' },
  { id: 'delivery_note', label: 'Delivery Note' },
];

export const FORMAT_OPTIONS = [
  { id: 'tally', label: 'Tally' },
  { id: 'modern_a', label: 'Modern A' },
  { id: 'modern_b', label: 'Modern B' },
];

export const DEFAULT_TERMS = {
  sales_inv: ['Payment due within 30 days of invoice date.', 'Goods once sold will not be returned without prior approval.'],
  purchase_inv: ['All payments subject to receipt and verification of goods.', 'Disputes must be raised within 7 days of receipt.'],
  sales_order: ['Order confirmation required within 48 hours.', 'Prices are valid for 7 days from order date.'],
  purchase_order: ['Delivery must match PO specifications exactly.', 'Advance payment required before dispatch.'],
  credit_note: ['Credit to be adjusted against next invoice.', 'Credit is non-refundable and non-transferable.'],
  debit_note: ['Debit note raised against purchase invoice reference.', 'Amount payable within 15 days of issue.'],
  delivery_note: ['Goods dispatched as per order specifications.', 'Recipient must verify quantity and condition on delivery.'],
};

export function defaultVoucherConfig(id) {
  return {
    format: 'tally',
    bank: 'Cash',
    qrEnabled: false,
    qrImage: null,
    terms: [...(DEFAULT_TERMS[id] || [])],
    qrType: 'upi',
    qrUpiId: '',
    qrUrl: '',
    qrIfsc: '',
    qrAccount: '',
  };
}

export function defaultAllVoucherConfigs() {
  return Object.fromEntries(VOUCHER_TYPES.map(t => [t.id, defaultVoucherConfig(t.id)]));
}

export function resolveDocumentFormat(format) {
  if (format === 'modern_a' || format === 'modern_b') return format;
  if (format === 2 || format === '2') return 'modern_a';
  if (format === 3 || format === '3') return 'modern_b';
  return 'tally';
}

export function bankInfoFromConfig(cfg, bankRows = []) {
  const name = cfg?.bank || 'Cash';
  const row = bankRows.find(b => (b.name || b) === name);
  if (name === 'Cash') return { bankName: 'Cash' };
  return {
    bankName: name,
    accountNo: row?.account_number || row?.accountNo || '',
    ifsc: row?.ifsc || row?.ifsc_code || '',
    upiId: cfg?.qrType === 'upi' ? cfg?.qrUpiId : '',
  };
}

export function qrDataUrlFromConfig(cfg) {
  if (cfg?.qrImage) return cfg.qrImage;
  if (!cfg?.qrEnabled) return null;
  if (cfg.qrType === 'url' && cfg.qrUrl) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(cfg.qrUrl)}`;
  }
  if (cfg.qrType === 'upi' && cfg.qrUpiId) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${cfg.qrUpiId}`)}`;
  }
  return null;
}
