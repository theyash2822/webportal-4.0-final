/**
 * Workspace bleed regression suite.
 *
 * The user owns an unpaired workspace and is a member of a paired one. Two
 * things used to leak between them: socket events applied without checking
 * which workspace raised them, and responses that landed after the user had
 * already switched. Both are pinned here against the real providers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, act, waitFor, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const socket = vi.hoisted(() => {
  const handlers = new Map();
  return {
    handlers,
    emit(event, data) {
      [...(handlers.get(event) || [])].forEach((h) => h(data));
    },
    service: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      registerCompany: vi.fn(),
      registerWorkspace: vi.fn(),
      leaveWorkspace: vi.fn(),
      on(event, handler) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(handler);
        return () => handlers.get(event)?.delete(handler);
      },
    },
  };
});

const net = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  fetchMeWithToken: vi.fn(),
  fetchCompaniesHydrated: vi.fn(),
  fetchCompanyYears: vi.fn(),
  fetchTallySyncStatus: vi.fn(),
  resolveActiveCompanyGuid: vi.fn(),
  unpairWorkspaceTally: vi.fn(),
  fetchMyWorkspaces: vi.fn(),
  fetchWorkspaceContext: vi.fn(),
  fetchMyInvitations: vi.fn(),
}));

vi.mock('../services/websocket', () => ({ default: socket.service }));
vi.mock('../services/push', () => ({
  tryAutoRegisterPush: vi.fn().mockResolvedValue(null),
  registerWebPushToken: vi.fn(),
  getPushPermissionStatus: vi.fn(),
}));
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    ...net,
    default: { ...actual.default, ...net, logoutApi: vi.fn().mockResolvedValue({}) },
  };
});

import { setWorkspaceId, getWorkspaceId } from '../services/api';
import { setAuthToken, clearAuthToken } from '../utils/authStorage';
import { AuthProvider, useAuth } from './AuthContext';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';

/** Latest committed context values, so assertions read what the UI would render. */
const latest = { auth: null, workspace: null };
const auth = () => latest.auth;
const workspace = () => latest.workspace;

function AuthProbe() {
  const value = useAuth();
  useEffect(() => { latest.auth = value; });
  return null;
}

function WorkspaceProbe() {
  const authValue = useAuth();
  const workspaceValue = useWorkspace();
  useEffect(() => {
    latest.auth = authValue;
    latest.workspace = workspaceValue;
  });
  return null;
}

/** A never-settling promise stands in for a request still in flight. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  socket.handlers.clear();
  localStorage.clear();
  latest.auth = null;
  latest.workspace = null;
  Object.values(net).forEach((fn) => fn.mockReset());
  net.fetchMe.mockResolvedValue({ data: { id: 'user-1' } });
  net.fetchMeWithToken.mockResolvedValue({ data: { id: 'user-1' } });
  net.fetchCompaniesHydrated.mockResolvedValue([]);
  net.fetchCompanyYears.mockResolvedValue({ data: [] });
  net.resolveActiveCompanyGuid.mockResolvedValue(null);
  net.fetchTallySyncStatus.mockResolvedValue({
    data: { is_paired: false, workspace_status: 'UNPAIRED', desktop_online: false },
  });
  net.fetchMyWorkspaces.mockResolvedValue({ data: [] });
  net.fetchMyInvitations.mockResolvedValue({ data: [] });
  net.fetchWorkspaceContext.mockResolvedValue({ data: null });
  setAuthToken('access-1');
  setWorkspaceId('ws-ABC');
});

afterEach(() => {
  cleanup();
  clearAuthToken();
  setWorkspaceId(null);
});

async function mountAuth() {
  await act(async () => {
    render(<AuthProvider><AuthProbe /></AuthProvider>);
  });
  await waitFor(() => expect(net.fetchTallySyncStatus).toHaveBeenCalled());
  await act(async () => {});
  net.fetchCompaniesHydrated.mockClear();
  net.resolveActiveCompanyGuid.mockClear();
}

describe('the user-global pairing flag is gone', () => {
  const SRC_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

  function sourceFiles(dir = SRC_DIR) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('no source file reads or writes localStorage isPaired', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      // removeItem is the one-time cleanup of the retired key.
      if (/(getItem|setItem)\(\s*['"]isPaired['"]/.test(src)) {
        offenders.push(path.relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('socket events are scoped to the selected workspace', () => {
  it('ignores a tally_connection raised by another workspace', async () => {
    await mountAuth();

    await act(async () => {
      socket.emit('tally_connection', { status: 'CONNECTED', workspaceId: 'ws-XYZ' });
    });

    expect(auth().isWorkspacePaired('ws-XYZ')).toBe(false);
    expect(auth().isWorkspacePaired('ws-ABC')).toBe(false);
    expect(net.fetchCompaniesHydrated).not.toHaveBeenCalled();
  });

  it('ignores an event that names no workspace', async () => {
    await mountAuth();

    await act(async () => {
      socket.emit('tally_connection', { status: 'CONNECTED' });
      socket.emit('paired', { deviceName: 'Desktop' });
      socket.emit('synced', {});
    });

    expect(auth().isWorkspacePaired('ws-ABC')).toBe(false);
    expect(net.fetchCompaniesHydrated).not.toHaveBeenCalled();
  });

  it('still applies an event raised by the selected workspace', async () => {
    await mountAuth();

    await act(async () => {
      socket.emit('tally_connection', { status: 'CONNECTED', workspaceId: 'ws-ABC' });
    });

    await waitFor(() => expect(auth().isWorkspacePaired('ws-ABC')).toBe(true));
    expect(net.fetchCompaniesHydrated).toHaveBeenCalled();
  });

  it('does not unpair the selected workspace when another one unpairs', async () => {
    await mountAuth();
    await act(async () => {
      socket.emit('tally_connection', { status: 'CONNECTED', workspaceId: 'ws-ABC' });
    });
    await waitFor(() => expect(auth().isWorkspacePaired('ws-ABC')).toBe(true));

    await act(async () => {
      socket.emit('unpaired', { workspaceId: 'ws-XYZ' });
    });

    expect(auth().isWorkspacePaired('ws-ABC')).toBe(true);
  });
});

describe('late responses cannot overwrite the current workspace', () => {
  it('drops a company list that arrives after the user switched away', async () => {
    await mountAuth();

    const persistedBefore = localStorage.getItem('companies');
    const pendingCompanies = deferred();
    net.fetchCompaniesHydrated.mockImplementation(() => pendingCompanies.promise);

    let inFlight;
    await act(async () => {
      inFlight = auth().loadCompanies({ demoOnly: false });
    });
    await waitFor(() => expect(net.fetchCompaniesHydrated).toHaveBeenCalled());

    // User switches to the other workspace while ABC's list is still in flight.
    act(() => { setWorkspaceId('ws-XYZ'); });

    await act(async () => {
      pendingCompanies.resolve([{ guid: 'abc-company', name: 'ABC Books', years: [] }]);
      await inFlight;
    });

    expect(auth().companies).toEqual([]);
    expect(localStorage.getItem('companies')).toBe(persistedBefore);
    expect(localStorage.getItem('selectedCompany')).toBeNull();
  });

  it('does not let a late bootstrap context drag the selection back', async () => {
    net.fetchMyWorkspaces.mockResolvedValue({
      data: [{ id: 'ws-ABC', isBase: true }, { id: 'ws-XYZ' }],
    });
    const pendingContext = deferred();
    net.fetchWorkspaceContext.mockImplementation(() => pendingContext.promise);

    await act(async () => {
      render(
        <AuthProvider>
          <WorkspaceProvider><WorkspaceProbe /></WorkspaceProvider>
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(net.fetchWorkspaceContext).toHaveBeenCalledWith('ws-ABC'));

    act(() => { setWorkspaceId('ws-XYZ'); });

    await act(async () => {
      pendingContext.resolve({
        data: {
          workspace: { id: 'ws-ABC', name: 'ABC' },
          access: { membershipType: 'OWNER', capabilities: ['sales_invoice.create'] },
          pairing: { status: 'CONNECTED' },
        },
      });
    });
    await act(async () => {});

    expect(getWorkspaceId()).toBe('ws-XYZ');
    expect(workspace().currentWorkspace).toBeNull();
    expect(workspace().capabilities).toEqual([]);
    expect(auth().isWorkspacePaired('ws-ABC')).toBe(false);
  });
});

describe('switching workspaces drops the previous permissions', () => {
  async function mountWithWorkspaces() {
    net.fetchMyWorkspaces.mockResolvedValue({
      data: [{ id: 'ws-ABC', isBase: true }, { id: 'ws-XYZ' }],
    });
    net.fetchWorkspaceContext.mockResolvedValue({
      data: {
        workspace: { id: 'ws-ABC', name: 'ABC' },
        access: { membershipType: 'MEMBER', capabilities: ['sales_invoice.create'] },
        pairing: { status: 'UNPAIRED' },
      },
    });
    await act(async () => {
      render(
        <AuthProvider>
          <WorkspaceProvider><WorkspaceProbe /></WorkspaceProvider>
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(workspace().capabilities).toEqual(['sales_invoice.create']));
  }

  it('installs the new workspace capabilities and never keeps the old ones', async () => {
    await mountWithWorkspaces();

    net.fetchWorkspaceContext.mockResolvedValue({
      data: {
        workspace: { id: 'ws-XYZ', name: 'XYZ' },
        access: { membershipType: 'MEMBER', capabilities: ['reports.view'] },
        pairing: { status: 'CONNECTED' },
      },
    });

    await act(async () => { await workspace().switchWorkspace('ws-XYZ'); });

    expect(workspace().capabilities).toEqual(['reports.view']);
    expect(workspace().can('sales_invoice.create')).toBe(false);
    expect(getWorkspaceId()).toBe('ws-XYZ');
  });

  it('restores the previous workspace when the new context cannot be fetched', async () => {
    await mountWithWorkspaces();

    net.fetchWorkspaceContext.mockRejectedValue(new Error('network down'));

    await act(async () => { await workspace().switchWorkspace('ws-XYZ'); });

    expect(workspace().currentWorkspace?.id).toBe('ws-ABC');
    expect(workspace().capabilities).toEqual(['sales_invoice.create']);
    expect(getWorkspaceId()).toBe('ws-ABC');
  });
});
