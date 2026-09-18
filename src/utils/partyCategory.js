/** MD §21 — categorize by party parent/group for Sales / Purchase / Accountant. */
export function partyCategory(p) {
  const parent = String(p?.parent || p?.group || p?.type || '').toLowerCase();
  if (/sundry\s*debtor|customer|receivable/.test(parent)) return 'sales';
  if (/sundry\s*creditor|vendor|supplier|payable/.test(parent)) return 'purchase';
  if (/cash|bank|od\b|overdraft|loan|expense|indirect|direct expense|duties|tax|capital|current asset|current liabilit|deposit|branch|stock/.test(parent)) {
    return 'accountant';
  }
  const tip = String(p?.type || p?.party_type || '').toLowerCase();
  if (/customer|debtor/.test(tip)) return 'sales';
  if (/vendor|supplier|creditor/.test(tip)) return 'purchase';
  return 'other';
}
