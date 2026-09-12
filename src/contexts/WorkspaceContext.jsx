import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchMyWorkspaces,
  fetchWorkspaceContext,
  setWorkspaceId,
  getWorkspaceId,
} from '../services/api';
import { flag } from '../config/featureFlags.js';
import wsService from '../services/websocket';

const WorkspaceContext = createContext(null);

function unwrap(res) {
  return res?.data ?? res;
}

export function WorkspaceProvider({ children }) {
  const {
    token,
    companies,
    selectedCompany,
    selectedFY,
    isPaired,
    selectCompany,
    selectFY,
    loadCompanies,
    clearCompaniesState,
    markPaired,
    markUnpaired,
    showToast,
  } = useAuth();

  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [membershipType, setMembershipType] = useState(null);
  const [role, setRole] = useState(null);
  const [capabilities, setCapabilities] = useState([]);
  const [entryMode, setEntryMode] = useState('BOTH');
  const [sensitivePolicies, setSensitivePolicies] = useState({});
  const [scopes, setScopes] = useState(null);
  const [pairing, setPairing] = useState(null);
  const [wsBootstrapping, setWsBootstrapping] = useState(false);
  const [wsError, setWsError] = useState(null);
  const capSet = useMemo(() => new Set(capabilities || []), [capabilities]);

  const applyContext = useCallback((ctx) => {
    if (!ctx?.workspace) return;
    setCurrentWorkspace(ctx.workspace);
    setMembershipType(ctx.access?.membershipType || null);
    setRole(ctx.access?.role || null);
    setCapabilities(ctx.access?.capabilities || []);
    setEntryMode(ctx.access?.entryMode || 'BOTH');
    setSensitivePolicies(ctx.access?.sensitivePolicies || {});
    setScopes(ctx.access?.scopes || null);
    setPairing(ctx.pairing || null);
    setWorkspaceId(ctx.workspace.id);
    wsService.registerWorkspace(ctx.workspace.id);
  }, []);

  /** Sync Auth isPaired from workspace pairing.status. markUnpaired only on switch (avoids wipe on soft refresh). */
  const syncPairingFromCtx = useCallback((ctx, { allowUnpair = false } = {}) => {
    const status = String(ctx?.pairing?.status || '').toUpperCase();
    if (status === 'CONNECTED' || status === 'RECONNECTING') {
      markPaired?.();
    } else if (allowUnpair && status === 'UNPAIRED') {
      markUnpaired?.();
    }
  }, [markPaired, markUnpaired]);

  const loadWorkspaceContext = useCallback(async (workspaceId) => {
    const res = await fetchWorkspaceContext(workspaceId);
    const ctx = unwrap(res);
    if (ctx?.denied) {
      setWsError('MEMBERSHIP_SUSPENDED');
      throw Object.assign(new Error('Membership suspended'), { code: 'MEMBERSHIP_SUSPENDED' });
    }
    applyContext(ctx);
    return ctx;
  }, [applyContext]);

  const bootstrap = useCallback(async () => {
    if (!token || !flag('workspace_model_enabled')) return;
    setWsBootstrapping(true);
    setWsError(null);
    try {
      const listRes = await fetchMyWorkspaces();
      const list = unwrap(listRes) || [];
      const arr = Array.isArray(list) ? list : [];
      setWorkspaces(arr);

      const remembered = getWorkspaceId();
      let target = remembered && arr.find((w) => w.id === remembered && w.membershipStatus !== 'SUSPENDED');
      if (!target) target = arr.find((w) => w.isBase) || arr[0];
      if (!target) {
        setCurrentWorkspace(null);
        return;
      }
      const ctx = await loadWorkspaceContext(target.id);
      syncPairingFromCtx(ctx, { allowUnpair: false });
      await loadCompanies?.({ forceDefaultFY: false });
    } catch (err) {
      console.warn('[Workspace] bootstrap failed:', err.message);
      setWsError(err.message);
      // Fallback: keep remembered id for header so mobile-compat personal WS can still resolve server-side
    } finally {
      setWsBootstrapping(false);
    }
  }, [token, loadWorkspaceContext, syncPairingFromCtx, loadCompanies]);

  useEffect(() => {
    if (!token) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setCapabilities([]);
      setWorkspaceId(null);
      return;
    }
    bootstrap();
  }, [token, bootstrap]);

  // MD §39 — refresh workspaces / soft tally status on membership & sync events
  useEffect(() => {
    if (!token || !flag('workspace_model_enabled')) return undefined;

    const refreshList = () => { bootstrap().catch(() => {}); };
    const softTally = (evt, data) => {
      console.info(`[Workspace] ${evt}`, data);
      if (currentWorkspace?.id) {
        loadWorkspaceContext(currentWorkspace.id)
          .then((ctx) => syncPairingFromCtx(ctx, { allowUnpair: false }))
          .catch(() => {});
      }
    };

    const unInvitation = wsService.on('invitation', (data) => {
      showToast?.(data?.message || 'New workspace invitation', 'info');
      refreshList();
    });
    const unMembership = wsService.on('membership_changed', () => {
      showToast?.('Workspace membership updated', 'info');
      refreshList();
    });
    const unRevoked = wsService.on('membership_revoked', (data) => {
      showToast?.(data?.message || 'Your membership was revoked', 'warning');
      refreshList();
    });
    const unAccess = wsService.on('access_revoked', (data) => {
      showToast?.(data?.message || 'Workspace access revoked', 'warning');
      refreshList();
    });
    const unHardReq = wsService.on('hard_sync_request', (data) => softTally('hard_sync_request', data));
    const unHardStatus = wsService.on('hard_sync_status', (data) => softTally('hard_sync_status', data));
    const unRestoreReq = wsService.on('restore_request', (data) => softTally('restore_request', data));
    const unRestoreStatus = wsService.on('restore_status', (data) => softTally('restore_status', data));
    const unBilling = wsService.on('billing_updated', () => {
      console.info('[Workspace] billing_updated');
    });

    return () => {
      unInvitation(); unMembership(); unRevoked(); unAccess();
      unHardReq(); unHardStatus(); unRestoreReq(); unRestoreStatus(); unBilling();
    };
  }, [token, bootstrap, currentWorkspace?.id, loadWorkspaceContext, syncPairingFromCtx, showToast]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    if (!workspaceId || workspaceId === currentWorkspace?.id) return;
    // Clear Company/FY before loading target (LOCKED web doc §7)
    clearCompaniesState?.();
    setWorkspaceId(workspaceId);
    const ctx = await loadWorkspaceContext(workspaceId);
    syncPairingFromCtx(ctx, { allowUnpair: true });
    await loadCompanies?.({ forceDefaultFY: true });
    showToast?.('Workspace switched', 'success');
  }, [currentWorkspace?.id, loadWorkspaceContext, syncPairingFromCtx, clearCompaniesState, loadCompanies, showToast]);

  const can = useCallback((capabilityKey) => {
    if (!flag('rbas_enabled')) return true;
    if (membershipType === 'OWNER') return true;
    if (!capabilityKey) return false;
    if (!capabilities?.length && membershipType === 'OWNER') return true;
    return capSet.has(capabilityKey);
  }, [capSet, capabilities, membershipType]);

  const canCreate = useCallback((createKey, { optional = false } = {}) => {
    if (!can(createKey)) return false;
    if (createKey !== 'sales_invoice.create' && createKey !== 'sales_order.create') return true;
    if (entryMode === 'BOTH') return true;
    if (optional) return entryMode === 'OPTIONAL' || entryMode === 'BOTH';
    return entryMode === 'REGULAR' || entryMode === 'BOTH';
  }, [can, entryMode]);

  const value = {
    workspaces,
    currentWorkspace,
    membershipType,
    role,
    capabilities,
    entryMode,
    sensitivePolicies,
    scopes,
    pairing,
    wsBootstrapping,
    wsError,
    can,
    canCreate,
    switchWorkspace,
    reloadWorkspaces: bootstrap,
    loadWorkspaceContext,
    // Company / FY / pairing surface (MD §5) — Auth remains source of truth for backward compat
    companies,
    selectedCompany,
    selectedFY,
    isPaired,
    selectCompany,
    selectFY,
    loadCompanies,
    clearCompaniesState,
    markPaired,
    markUnpaired,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Safe no-op when provider missing (tests / partial trees)
    return {
      workspaces: [],
      currentWorkspace: null,
      membershipType: null,
      role: null,
      capabilities: [],
      entryMode: 'BOTH',
      sensitivePolicies: {},
      scopes: null,
      pairing: null,
      wsBootstrapping: false,
      wsError: null,
      can: () => true,
      canCreate: () => true,
      switchWorkspace: async () => {},
      reloadWorkspaces: async () => {},
      loadWorkspaceContext: async () => null,
      companies: [],
      selectedCompany: null,
      selectedFY: null,
      isPaired: false,
      selectCompany: async () => {},
      selectFY: () => {},
      loadCompanies: async () => {},
      clearCompaniesState: () => {},
      markPaired: () => {},
      markUnpaired: () => {},
    };
  }
  return ctx;
}
