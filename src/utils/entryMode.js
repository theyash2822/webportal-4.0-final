/**
 * Entry-mode gate for create actions (sales invoice / sales order).
 * Mirrors WorkspaceContext canCreate entry-mode logic (after capability check).
 */
export function canCreateWithEntryMode(entryMode, createKey, { optional = false } = {}) {
  if (createKey !== 'sales_invoice.create' && createKey !== 'sales_order.create') return true;
  if (entryMode === 'BOTH') return true;
  if (optional) return entryMode === 'OPTIONAL' || entryMode === 'BOTH';
  return entryMode === 'REGULAR' || entryMode === 'BOTH';
}
