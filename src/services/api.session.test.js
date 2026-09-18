/**
 * The access token lives 15 minutes. Without a central 401 handler every tab
 * silently breaks after that; without a single-flight guard a burst of parallel
 * requests would fire one refresh each and churn the session. A 403 is a
 * capability denial and must leave the session alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import api, {
  setUnauthorizedHandler,
  setWorkspaceId,
  getWorkspaceId,
  workspaceStamp,
  isWorkspaceCurrent,
} from './api';
import {
  getAuthToken,
  setAuthToken,
  getRefreshToken,
  setRefreshToken,
  clearAuthToken,
} from '../utils/authStorage';

const REFRESH_URL = '/api/auth/refresh';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

let refreshCalls;
let onUnauthorized;

beforeEach(() => {
  refreshCalls = 0;
  onUnauthorized = vi.fn();
  setUnauthorizedHandler(onUnauthorized);
  localStorage.clear();
  clearAuthToken();
  setWorkspaceId(null);
});

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

/** 401 for anything not presenting the post-refresh token. */
function stubBackend({ refreshStatus = 200, protectedStatus = null } = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.endsWith(REFRESH_URL)) {
      refreshCalls += 1;
      await tick();
      if (refreshStatus !== 200) {
        return jsonResponse(refreshStatus, { success: false, error: { code: 'SESSION_INVALID' } });
      }
      return jsonResponse(200, {
        success: true,
        data: { access_token: 'access-2', refresh_token: 'refresh-2', session_id: 's2', expires_in: 900 },
      });
    }
    if (protectedStatus) {
      return jsonResponse(protectedStatus, { success: false, error: { code: 'CAPABILITY_DENIED' } });
    }
    await tick();
    const auth = init?.headers?.Authorization;
    if (auth !== 'Bearer access-2') {
      return jsonResponse(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    }
    return jsonResponse(200, { success: true, data: { ok: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('refresh on 401', () => {
  it('refreshes once and replays the original request', async () => {
    const fetchMock = stubBackend();
    setAuthToken('access-1');
    setRefreshToken('refresh-1');

    const res = await api.fetchMe();

    expect(res).toEqual({ success: true, data: { ok: true } });
    expect(refreshCalls).toBe(1);
    expect(getAuthToken()).toBe('access-2');
    expect(getRefreshToken()).toBe('refresh-2');
    expect(onUnauthorized).not.toHaveBeenCalled();
    // original → refresh → replay, and no second replay
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('makes exactly one refresh call when several requests expire at once', async () => {
    stubBackend();
    setAuthToken('access-1');
    setRefreshToken('refresh-1');

    const results = await Promise.all([
      api.fetchMe(),
      api.fetchBillingOverview(),
      api.fetchMyInvitations(),
      api.fetchTallySyncStatus(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(4);
    results.forEach((r) => expect(r.success).toBe(true));
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('leaves workspace and company selection untouched', async () => {
    stubBackend();
    setWorkspaceId('ws-ABC');
    localStorage.setItem('selectedCompany', JSON.stringify({ guid: 'company-1' }));
    setAuthToken('access-1');
    setRefreshToken('refresh-1');

    await api.fetchMe();

    expect(getWorkspaceId()).toBe('ws-ABC');
    expect(JSON.parse(localStorage.getItem('selectedCompany'))).toEqual({ guid: 'company-1' });
  });

  it('signs out when the refresh is rejected', async () => {
    stubBackend({ refreshStatus: 401 });
    setAuthToken('access-1');
    setRefreshToken('revoked');

    await expect(api.fetchMe()).rejects.toThrow();

    expect(refreshCalls).toBe(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('signs out only once when several requests fail the same refresh', async () => {
    stubBackend({ refreshStatus: 401 });
    setAuthToken('access-1');
    setRefreshToken('revoked');

    await Promise.allSettled([api.fetchMe(), api.fetchBillingOverview(), api.fetchMyInvitations()]);

    expect(refreshCalls).toBe(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('signs out without a refresh attempt when no refresh token was stored', async () => {
    stubBackend();
    setAuthToken('access-1');

    await expect(api.fetchMe()).rejects.toThrow();

    expect(refreshCalls).toBe(0);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('403 is not session expiry', () => {
  it('never refreshes and never signs the user out', async () => {
    stubBackend({ protectedStatus: 403 });
    setAuthToken('access-1');
    setRefreshToken('refresh-1');

    await expect(api.fetchMe()).rejects.toThrow('Not allowed. Ask your Workspace administrator.');

    expect(refreshCalls).toBe(0);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getAuthToken()).toBe('access-1');
    expect(getRefreshToken()).toBe('refresh-1');
  });
});

describe('workspace stamp', () => {
  it('invalidates a stamp taken before a switch', () => {
    setWorkspaceId('ws-ABC');
    const stamp = workspaceStamp();
    expect(isWorkspaceCurrent(stamp)).toBe(true);
    setWorkspaceId('ws-XYZ');
    expect(isWorkspaceCurrent(stamp)).toBe(false);
  });

  it('stays invalid after switching away and back', () => {
    setWorkspaceId('ws-ABC');
    const stamp = workspaceStamp();
    setWorkspaceId('ws-XYZ');
    setWorkspaceId('ws-ABC');
    expect(isWorkspaceCurrent(stamp)).toBe(false);
  });
});
