/**
 * Session token storage — avoids persisting bearer tokens in localStorage.
 * Memory + sessionStorage (tab lifetime) with BroadcastChannel multi-tab sync.
 * Full HttpOnly cookie auth still requires backend support.
 */
const TOKEN_KEY = 'authToken';
const REFRESH_KEY = 'authRefreshToken';
const CHANNEL = 'td-auth-token';
const EVENT = 'td-auth-token-changed';

let memoryToken = null;
let memoryRefresh = null;
let channel = null;

function notify() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

function readSession(key = TOKEN_KEY) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(token, key = TOKEN_KEY) {
  try {
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch { /* private mode */ }
}

function stripLegacyLocal() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch { /* ignore */ }
}

function getChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (ev) => {
      const msg = ev?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'set' && typeof msg.token === 'string') {
        memoryToken = msg.token;
        writeSession(msg.token);
        if (typeof msg.refresh === 'string' || msg.refresh === null) {
          memoryRefresh = msg.refresh || null;
          writeSession(memoryRefresh, REFRESH_KEY);
        }
        notify();
      } else if (msg.type === 'clear') {
        memoryToken = null;
        memoryRefresh = null;
        writeSession(null);
        writeSession(null, REFRESH_KEY);
        notify();
      } else if (msg.type === 'ask' && memoryToken) {
        channel.postMessage({ type: 'set', token: memoryToken, refresh: memoryRefresh });
      }
    };
  } catch {
    channel = null;
  }
  return channel;
}

/** One-time migrate: localStorage → sessionStorage, then delete local copy. */
function migrateFromLocalStorage() {
  try {
    const legacy = localStorage.getItem(TOKEN_KEY);
    if (!legacy) return null;
    if (legacy.startsWith('demo-token-')) {
      localStorage.clear();
      return null;
    }
    memoryToken = legacy;
    writeSession(legacy);
    stripLegacyLocal();
    return legacy;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  if (memoryToken) return memoryToken;
  const fromSession = readSession();
  if (fromSession) {
    memoryToken = fromSession;
    stripLegacyLocal();
    return fromSession;
  }
  return migrateFromLocalStorage();
}

export function setAuthToken(token) {
  memoryToken = token || null;
  writeSession(memoryToken);
  stripLegacyLocal();
  const bc = getChannel();
  if (bc) {
    try {
      bc.postMessage(memoryToken ? { type: 'set', token: memoryToken, refresh: memoryRefresh } : { type: 'clear' });
    } catch { /* ignore */ }
  }
  notify();
}

export function clearAuthToken() {
  memoryRefresh = null;
  writeSession(null, REFRESH_KEY);
  setAuthToken(null);
}

/**
 * Refresh token — same memory + sessionStorage lifetime as the access token.
 * An HttpOnly cookie is the safer home for this and needs backend support.
 */
export function getRefreshToken() {
  if (memoryRefresh) return memoryRefresh;
  const fromSession = readSession(REFRESH_KEY);
  if (fromSession) memoryRefresh = fromSession;
  return memoryRefresh;
}

export function setRefreshToken(token) {
  memoryRefresh = token || null;
  writeSession(memoryRefresh, REFRESH_KEY);
}

/** Ask other tabs for a live token (new tab after sessionStorage miss). */
export function requestAuthTokenFromPeers() {
  const bc = getChannel();
  if (!bc || getAuthToken()) return;
  try {
    bc.postMessage({ type: 'ask' });
  } catch { /* ignore */ }
}

export const AUTH_TOKEN_EVENT = EVENT;

// Init channel early so peer asks work.
getChannel();
requestAuthTokenFromPeers();
