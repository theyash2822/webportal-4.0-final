/** Local draft auto-save for create forms (mobile AsyncStorage parity, 30 min TTL).
 * Phase 3: workspace-scoped keys — same tallyGuid must not collide across workspaces.
 */
const TTL_MS = 30 * 60 * 1000;

export function draftKey(prefix, companyGuid, workspaceId = null) {
  const g = companyGuid || 'none';
  if (workspaceId) return `td_draft_${workspaceId}_${prefix}_${g}`;
  return `td_draft_${prefix}_${g}`;
}

function legacyDraftKey(prefix, companyGuid) {
  return `td_draft_${prefix}_${companyGuid || 'none'}`;
}

export function loadDraft(prefix, companyGuid, workspaceId = null) {
  try {
    const key = draftKey(prefix, companyGuid, workspaceId);
    // Ambiguous GUID-only drafts cannot prove which workspace created them.
    if (workspaceId && companyGuid) {
      const legacy = legacyDraftKey(prefix, companyGuid);
      if (localStorage.getItem(legacy)) localStorage.removeItem(legacy);
    }
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d?.savedAt || Date.now() - d.savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(prefix, companyGuid, payload, workspaceId = null) {
  if (!companyGuid) return;
  try {
    localStorage.setItem(
      draftKey(prefix, companyGuid, workspaceId),
      JSON.stringify({ ...payload, savedAt: Date.now() })
    );
  } catch { /* quota */ }
}

export function clearDraft(prefix, companyGuid, workspaceId = null) {
  localStorage.removeItem(draftKey(prefix, companyGuid, workspaceId));
  if (workspaceId) localStorage.removeItem(legacyDraftKey(prefix, companyGuid));
}
