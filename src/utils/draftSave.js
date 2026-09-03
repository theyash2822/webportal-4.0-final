/** Local draft auto-save for create forms (mobile AsyncStorage parity, 30 min TTL). */
const TTL_MS = 30 * 60 * 1000;

export function draftKey(prefix, companyGuid) {
  return `td_draft_${prefix}_${companyGuid || 'none'}`;
}

export function loadDraft(prefix, companyGuid) {
  try {
    const raw = localStorage.getItem(draftKey(prefix, companyGuid));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d?.savedAt || Date.now() - d.savedAt > TTL_MS) {
      localStorage.removeItem(draftKey(prefix, companyGuid));
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(prefix, companyGuid, payload) {
  if (!companyGuid) return;
  try {
    localStorage.setItem(draftKey(prefix, companyGuid), JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch { /* quota */ }
}

export function clearDraft(prefix, companyGuid) {
  localStorage.removeItem(draftKey(prefix, companyGuid));
}
