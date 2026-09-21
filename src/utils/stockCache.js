/** Per-workspace + per-company stock list cache — invalidated on WS sync (mobile stockCache parity). */
import { getWorkspaceId } from '../services/api';

const PREFIX = 'td_stock_cache_';

/** A Tally GUID is only unique inside one workspace, so the workspace has to be in the key. */
export function stockCacheKey(companyGuid, fy, workspaceId) {
  const ws = workspaceId ?? getWorkspaceId();
  return `${PREFIX}${ws || 'nows'}_${companyGuid || 'none'}_${fy || 'fy'}`;
}

export function readStockCache(companyGuid, fy) {
  try {
    const raw = localStorage.getItem(stockCacheKey(companyGuid, fy));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.items || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeStockCache(companyGuid, fy, items) {
  if (!companyGuid || !Array.isArray(items)) return;
  try {
    localStorage.setItem(stockCacheKey(companyGuid, fy), JSON.stringify({ items, savedAt: Date.now() }));
  } catch { /* quota */ }
}

export function invalidateStockCache(companyGuid, workspaceId) {
  const ws = workspaceId ?? getWorkspaceId() ?? 'nows';
  const guid = companyGuid || 'none';
  const scoped = `${PREFIX}${ws}_${guid}_`;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(scoped))
    .forEach((k) => localStorage.removeItem(k));
}
