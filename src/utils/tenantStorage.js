/**
 * Tenant-owned localStorage keys.
 * A Tally GUID is unique only inside a workspace — never key business data by GUID alone.
 */

export function tenantKey({ userId, workspaceId, companyGuid, feature }) {
  const u = userId != null && String(userId) !== '' ? String(userId) : 'anon';
  const w = workspaceId ? String(workspaceId) : 'no-ws';
  const c = companyGuid ? String(companyGuid) : 'no-co';
  return `td:u:${u}:ws:${w}:co:${c}:${feature}`;
}

export const LEGACY_GLOBAL_TENANT_KEYS = ['selectedCompany', 'selectedFY', 'companies'];

export function userIdOf(user) {
  if (!user) return null;
  return user.id ?? user.userId ?? user.user_id ?? null;
}

export function companySelectionKey(userId, workspaceId) {
  return tenantKey({ userId, workspaceId, companyGuid: null, feature: 'selected_company' });
}

export function fySelectionKey(userId, workspaceId, companyGuid) {
  return tenantKey({ userId, workspaceId, companyGuid, feature: 'selected_fy' });
}

export function readScopedCompany(userId, workspaceId) {
  if (!userId || !workspaceId) return null;
  try {
    const raw = localStorage.getItem(companySelectionKey(userId, workspaceId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeScopedCompany(userId, workspaceId, company) {
  if (!userId || !workspaceId || !company) return;
  try {
    localStorage.setItem(companySelectionKey(userId, workspaceId), JSON.stringify(company));
  } catch { /* quota */ }
}

export function readScopedFY(userId, workspaceId, companyGuid) {
  if (!userId || !workspaceId || !companyGuid) return null;
  try {
    const raw = localStorage.getItem(fySelectionKey(userId, workspaceId, companyGuid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeScopedFY(userId, workspaceId, companyGuid, fy) {
  if (!userId || !workspaceId || !companyGuid || !fy) return;
  try {
    localStorage.setItem(fySelectionKey(userId, workspaceId, companyGuid), JSON.stringify(fy));
  } catch { /* quota */ }
}

export function clearScopedSelection(userId, workspaceId, companyGuid) {
  try {
    if (userId && workspaceId) {
      localStorage.removeItem(companySelectionKey(userId, workspaceId));
      if (companyGuid) localStorage.removeItem(fySelectionKey(userId, workspaceId, companyGuid));
    }
  } catch { /* ignore */ }
}

/** Ambiguous pre-workspace keys. Never adopt them as the current tenant. */
export function dropLegacyGlobalTenantKeys() {
  try {
    LEGACY_GLOBAL_TENANT_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function dropAuthNavigationResidue() {
  try {
    sessionStorage.removeItem('td.postAuthPath');
  } catch { /* ignore */ }
}
