/** Backend `companies.is_demo` is the only Demo authority. Names and GUIDs never decide. */
export function isDemoCompany(c) {
  if (!c) return false;
  return c.is_demo === true || c.isDemo === true;
}

export function filterCompaniesForPairing(list, pairingStatus) {
  const rows = Array.isArray(list) ? list : [];
  const status = String(pairingStatus || '').toUpperCase();
  const unpaired = status === 'UNPAIRED' || status === '' || status === 'PENDING';
  return rows.filter((c) => {
    if (c.is_active === false) return false;
    return unpaired ? isDemoCompany(c) : !isDemoCompany(c);
  });
}

/** Demo Mode = unpaired workspace only. RECONNECTING stays on real books. */
export function isDemoMode(pairingStatus) {
  const status = String(pairingStatus || '').toUpperCase();
  return status === 'UNPAIRED' || status === '' || status === 'PENDING';
}

export function isLiveBooksStatus(pairingStatus) {
  const status = String(pairingStatus || '').toUpperCase();
  return status === 'CONNECTED' || status === 'RECONNECTING';
}
