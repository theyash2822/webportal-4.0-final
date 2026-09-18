import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchMyWorkspaces,
  fetchWorkspaceContext,
  fetchMyInvitations,
  setWorkspaceId,
  getWorkspaceId,
} from '../services/api';
import { flag } from '../config/featureFlags.js';
import { canCreateWithEntryMode } from '../utils/entryMode.js';
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
  const [invitations, setInvitations] = useState([]);
  const [wsBootstrapping, setWsBootstrapping] = useState(false);
  const [wsError, setWsError] = useState(null);
  const capSet = useMemo(() => new Set(capabilities || []), [capabilities]);

  const pairingStatus = useMemo(
    () => String(pairing?.status || '').toUpperCase() || null,
    [pairing],
  );
  // Mobile SoT: demoMode = UNPAIRED || RECONNECTING; CONNECTED never Demo
  const demoMode = pairingStatus
    ? (pairingStatus === 'UNPAIRED' || pairingStatus === 'RECONNECTING')
    : true; // fail-closed Demo when status unknown — never use isPaired for live eligibility
  const roleSystemKey = role?.systemKey || role?.system_key || null;
  const isOwnerOrAdmin = membershipType === 'OWNER' || roleSystemKey === 'ADMIN';

  const applyContext = useCallback((ctx) => {
    if (!ctx?.workspace) return;
    setCurrentWorkspace(ctx.workspace);
    setMembershipType(ctx.access?.membershipType || ctx.access?.membership_type || null);
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

  const refreshInvitations = useCallback(async () => {
    if (!token) {
      setInvitations([]);
      return [];
    }
    try {
      const res = await fetchMyInvitations();
      const list = unwrap(res);
      const arr = Array.isArray(list) ? list : (list?.invitations || []);
      setInvitations(arr);
      return arr;
    } catch (err) {
      setInvitations([]);
      throw err;
    }
  }, [token]);

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
      const status = String(ctx?.pairing?.status || '').toUpperCase();
      // Align Auth isPaired with server pairing. CONNECTED never demoOnly; UNPAIRED|RECONNECTING → Demo.
      const inDemo = status === 'UNPAIRED' || status === 'RECONNECTING'
        || (!status && localStorage.getItem('isPaired') !== 'true');
      if (status === 'CONNECTED' || status === 'RECONNECTING') markPaired?.();
      else if (status === 'UNPAIRED') markUnpaired?.();
      await loadCompanies?.({
        forceDefaultFY: inDemo,
        demoOnly: status === 'CONNECTED' ? false : inDemo,
      });
      await refreshInvitations().catch((e) => {
        console.warn('[Workspace] invitations refresh:', e?.message);
      });
    } catch (err) {
      console.warn('[Workspace] bootstrap failed:', err.message);
      setWsError(err.message);
      // Fallback: keep remembered id for header so mobile-compat personal WS can still resolve server-side
    } finally {
      setWsBootstrapping(false);
    }
  }, [token, loadWorkspaceContext, loadCompanies, markPaired, markUnpaired, refreshInvitations]);

  useEffect(() => {
    if (!token) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setCapabilities([]);
      setInvitations([]);
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
          .then(async (ctx) => {
            const fromEvt = String(data?.status || '').toUpperCase();
            const fromCtx = String(ctx?.pairing?.status || '').toUpperCase();
            const status = evt === 'unpaired' ? 'UNPAIRED' : (fromEvt || fromCtx);
            syncPairingFromCtx(ctx, { allowUnpair: status === 'UNPAIRED' });
            if (status === 'CONNECTED') {
              await loadCompanies?.({ demoOnly: false, forceDefaultFY: true });
            } else if (status === 'UNPAIRED' || status === 'RECONNECTING') {
              await loadCompanies?.({ demoOnly: true, forceDefaultFY: true });
            }
          })
          .catch(() => {});
      }
    };

    const unInvitation = wsService.on('invitation', (data) => {
      showToast?.(data?.message || 'New workspace invitation', 'info');
      refreshInvitations();
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
    const unSynced = wsService.on('synced', (data) => softTally('synced', data));
    const unTallyConn = wsService.on('tally_connection', (data) => softTally('tally_connection', data));
    const unUnpaired = wsService.on('unpaired', (data) => softTally('unpaired', data));
    const unBilling = wsService.on('billing_updated', () => {
      console.info('[Workspace] billing_updated');
    });

    return () => {
      unInvitation(); unMembership(); unRevoked(); unAccess();
      unHardReq(); unHardStatus(); unRestoreReq(); unRestoreStatus();
      unSynced(); unTallyConn(); unUnpaired(); unBilling();
    };
  }, [token, bootstrap, currentWorkspace?.id, loadWorkspaceContext, syncPairingFromCtx, showToast, refreshInvitations, loadCompanies]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    if (!workspaceId || workspaceId === currentWorkspace?.id) return;
    // Clear Company/FY before loading target (LOCKED web doc §7)
    clearCompaniesState?.();
    setWorkspaceId(workspaceId);
    const ctx = await loadWorkspaceContext(workspaceId);
    syncPairingFromCtx(ctx, { allowUnpair: true });
    const status = String(ctx?.pairing?.status || '').toUpperCase();
    const inDemo = status === 'UNPAIRED' || status === 'RECONNECTING' || !status;
    await loadCompanies?.({
      forceDefaultFY: true,
      demoOnly: status === 'CONNECTED' ? false : inDemo,
    });
    showToast?.('Workspace switched', 'success');
  }, [currentWorkspace?.id, loadWorkspaceContext, syncPairingFromCtx, clearCompaniesState, loadCompanies, showToast]);

  const can = useCallback((capabilityKey) => {
    // Fail closed: empty/unknown caps never elevate (OWNER always allowed)
    if (membershipType === 'OWNER') return true;
    if (!capabilityKey) return false;
    return capSet.has(capabilityKey);
  }, [capSet, membershipType]);

  const canCreate = useCallback((createKey, { optional = false } = {}) => {
    if (!can(createKey)) return false;
    return canCreateWithEntryMode(entryMode, createKey, { optional });
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
    pairingStatus: pairingStatus || 'UNPAIRED',
    demoMode,
    isOwnerOrAdmin,
    invitations,
    refreshInvitations,
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
      pairingStatus: 'UNPAIRED',
      demoMode: true,
      isOwnerOrAdmin: false,
      invitations: [],
      refreshInvitations: async () => [],
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
