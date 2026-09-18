import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchMyWorkspaces,
  fetchWorkspaceContext,
  fetchMyInvitations,
  setWorkspaceId,
  getWorkspaceId,
  workspaceStamp,
  isWorkspaceCurrent,
} from '../services/api';
import { flag } from '../config/featureFlags.js';
import { canCreateWithEntryMode } from '../utils/entryMode.js';
import { isEventForActiveWorkspace } from '../utils/workspaceEvents';
import wsService from '../services/websocket';

const WorkspaceContext = createContext(null);

/** Access state a workspace switch must drop before the new context lands. */
const EMPTY_ACCESS = {
  membershipType: null,
  role: null,
  capabilities: [],
  entryMode: 'BOTH',
  sensitivePolicies: {},
  scopes: null,
  pairing: null,
};

function unwrap(res) {
  return res?.data ?? res;
}

export function WorkspaceProvider({ children }) {
  const {
    token,
    companies,
    selectedCompany,
    selectedFY,
    selectCompany,
    selectFY,
    loadCompanies,
    clearCompaniesState,
    markPaired,
    markUnpaired,
    setWorkspacePairingStatus,
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

  // Read synchronously when a switch snapshots the outgoing workspace's access.
  const membershipTypeRef = useRef(membershipType); membershipTypeRef.current = membershipType;
  const roleRef = useRef(role); roleRef.current = role;
  const capabilitiesRef = useRef(capabilities); capabilitiesRef.current = capabilities;
  const entryModeRef = useRef(entryMode); entryModeRef.current = entryMode;
  const sensitivePoliciesRef = useRef(sensitivePolicies); sensitivePoliciesRef.current = sensitivePolicies;
  const scopesRef = useRef(scopes); scopesRef.current = scopes;
  const pairingRef = useRef(pairing); pairingRef.current = pairing;

  const applyAccess = useCallback((access) => {
    setMembershipType(access.membershipType ?? null);
    setRole(access.role ?? null);
    setCapabilities(access.capabilities || []);
    setEntryMode(access.entryMode || 'BOTH');
    setSensitivePolicies(access.sensitivePolicies || {});
    setScopes(access.scopes ?? null);
    setPairing(access.pairing ?? null);
  }, []);

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
    applyAccess({
      membershipType: ctx.access?.membershipType || ctx.access?.membership_type || null,
      role: ctx.access?.role || null,
      capabilities: ctx.access?.capabilities || [],
      entryMode: ctx.access?.entryMode || 'BOTH',
      sensitivePolicies: ctx.access?.sensitivePolicies || {},
      scopes: ctx.access?.scopes || null,
      pairing: ctx.pairing || null,
    });
    setWorkspaceId(ctx.workspace.id);
    wsService.registerWorkspace(ctx.workspace.id);
  }, [applyAccess]);

  /** Record pairing against the workspace the context belongs to, never user-wide. */
  const syncPairingFromCtx = useCallback((ctx, { allowUnpair = false } = {}) => {
    const wsId = ctx?.workspace?.id;
    if (!wsId) return;
    const status = String(ctx?.pairing?.status || '').toUpperCase();
    if (status === 'CONNECTED' || status === 'RECONNECTING') {
      setWorkspacePairingStatus?.(wsId, status);
    } else if (allowUnpair && status === 'UNPAIRED') {
      markUnpaired?.(wsId);
    }
  }, [setWorkspacePairingStatus, markUnpaired]);

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

  /**
   * `stamp` pins the selection this call was started for. applyContext writes
   * setWorkspaceId, so a late reply would otherwise drag the selection back to
   * the workspace the user just left.
   */
  const loadWorkspaceContext = useCallback(async (workspaceId, { stamp } = {}) => {
    const pinned = stamp || workspaceStamp();
    const res = await fetchWorkspaceContext(workspaceId);
    if (!isWorkspaceCurrent(pinned)) return null;
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
    const stamp = workspaceStamp();
    try {
      const listRes = await fetchMyWorkspaces();
      if (!isWorkspaceCurrent(stamp)) return;
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
      // null → the user switched while this bootstrap was in flight; drop it.
      const ctx = await loadWorkspaceContext(target.id, { stamp });
      if (!ctx) return;
      const status = String(ctx?.pairing?.status || '').toUpperCase();
      // Pairing is recorded against this workspace only. CONNECTED never demoOnly;
      // UNPAIRED | RECONNECTING | unknown → Demo (fail closed).
      const inDemo = status !== 'CONNECTED';
      if (status === 'CONNECTED' || status === 'RECONNECTING') setWorkspacePairingStatus?.(target.id, status);
      else if (status === 'UNPAIRED') markUnpaired?.(target.id);
      await loadCompanies?.({
        forceDefaultFY: inDemo,
        demoOnly: inDemo,
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
  }, [token, loadWorkspaceContext, loadCompanies, setWorkspacePairingStatus, markUnpaired, refreshInvitations]);

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
      // Tally events for another workspace (or with no workspace at all) must not
      // reload this workspace's context or companies.
      if (!currentWorkspace?.id) return;
      if (!isEventForActiveWorkspace(data, currentWorkspace.id)) return;
      const stamp = workspaceStamp();
      loadWorkspaceContext(currentWorkspace.id, { stamp })
        .then(async (ctx) => {
          if (!ctx || !isWorkspaceCurrent(stamp)) return;
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
    // The previous workspace's permissions must not stay on screen while the new
    // context is in flight; snapshot them so a failed fetch can be undone.
    const previous = {
      workspaceId: currentWorkspace?.id || null,
      workspace: currentWorkspace,
      membershipType: membershipTypeRef.current,
      role: roleRef.current,
      capabilities: capabilitiesRef.current,
      entryMode: entryModeRef.current,
      sensitivePolicies: sensitivePoliciesRef.current,
      scopes: scopesRef.current,
      pairing: pairingRef.current,
    };
    applyAccess(EMPTY_ACCESS);
    setWorkspaceId(workspaceId);
    const stamp = workspaceStamp();
    let ctx = null;
    try {
      ctx = await loadWorkspaceContext(workspaceId, { stamp });
    } catch (err) {
      ctx = null;
      console.warn('[Workspace] switch failed:', err?.message || err);
    }
    if (!isWorkspaceCurrent(stamp)) return;
    if (!ctx) {
      // Never leave the shell with no permissions at all — put the old workspace back.
      setWorkspaceId(previous.workspaceId);
      setCurrentWorkspace(previous.workspace);
      applyAccess(previous);
      showToast?.('Could not switch workspace. Staying on the current one.', 'warning');
      return;
    }
    syncPairingFromCtx(ctx, { allowUnpair: true });
    const status = String(ctx?.pairing?.status || '').toUpperCase();
    await loadCompanies?.({
      forceDefaultFY: true,
      demoOnly: status !== 'CONNECTED',
    });
    showToast?.('Workspace switched', 'success');
  }, [currentWorkspace, applyAccess, loadWorkspaceContext, syncPairingFromCtx, clearCompaniesState, loadCompanies, showToast]);

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
    // Company / FY surface (MD §5) — Auth remains source of truth for backward compat.
    // Pairing is NOT re-exported as a boolean: use pairingStatus / demoMode, which
    // are scoped to the selected workspace.
    companies,
    selectedCompany,
    selectedFY,
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
