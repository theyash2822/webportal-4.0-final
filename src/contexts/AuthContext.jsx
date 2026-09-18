import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, {
  fetchMe,
  fetchMeWithToken,
  fetchCompaniesHydrated,
  fetchCompanyYears,
  normalizeCompanyYears,
  fetchTallySyncStatus,
  resolveActiveCompanyGuid,
  getWorkspaceId,
  unpairWorkspaceTally,
} from '../services/api';
import wsService from '../services/websocket';
import { invalidateStockCache } from '../utils/stockCache';
import { tryAutoRegisterPush } from '../services/push';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  requestAuthTokenFromPeers,
  AUTH_TOKEN_EVENT,
} from '../utils/authStorage';

const AuthContext = createContext(null);

// Company / FY / isPaired remain stored here for persistence, but the preferred
// consumer surface is WorkspaceContext (MD §5) which re-exports these fields.

(function cleanStaleToken() {
  const t = getAuthToken();
  if (t && t.startsWith('demo-token-')) {
    clearAuthToken();
    localStorage.clear();
  }
})();

function isDemoCompany(c) {
  const n = String(c?.name || '').toLowerCase();
  const g = String(c?.guid || '');
  return n.startsWith('demo') || g.startsWith('dddddddd') || g.toUpperCase().startsWith('DEMO');
}

/** Default FY — match mobile Header (company/years ORDER BY begin_date DESC → index 0). */
function pickDefaultFY(company) {
  if (!company?.years?.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const inRange = company.years.find(y => y.startDate <= today && y.endDate >= today);
  if (inRange) return inRange;
  return company.years[0];
}

export function AuthProvider({ children }) {
  const [token,     setToken]     = useState(() => getAuthToken());
  const [user,      setUser]      = useState(() => { try { return JSON.parse(localStorage.getItem('authUser')); } catch { return null; } });
  const [companies, setCompanies] = useState(() => { try { return JSON.parse(localStorage.getItem('companies')) || []; } catch { return []; } });
  const [selectedCompany, setSelectedCompany] = useState(() => { try { return JSON.parse(localStorage.getItem('selectedCompany')); } catch { return null; } });
  const [selectedFY, setSelectedFY] = useState(() => { try { return JSON.parse(localStorage.getItem('selectedFY')); } catch { return null; } });
  const [isPaired,  setIsPaired]  = useState(() => localStorage.getItem('isPaired') === 'true');
  const [isDesktopOnline, setIsDesktopOnline] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [syncVersion, setSyncVersion] = useState(0);

  const selectedFYRef = useRef(selectedFY);
  selectedFYRef.current = selectedFY;
  const selectedCompanyRef = useRef(selectedCompany);
  selectedCompanyRef.current = selectedCompany;
  const lastPairingStatusRef = useRef('');

  // Multi-tab / migration: pick up tokens written by authStorage (session + BroadcastChannel).
  useEffect(() => {
    requestAuthTokenFromPeers();
    const sync = () => {
      const next = getAuthToken();
      setToken(prev => (prev === next ? prev : next));
    };
    window.addEventListener(AUTH_TOKEN_EVENT, sync);
    const t = setTimeout(sync, 120);
    return () => {
      window.removeEventListener(AUTH_TOKEN_EVENT, sync);
      clearTimeout(t);
    };
  }, []);

  const clearCompaniesState = useCallback(() => {
    localStorage.removeItem('companies');
    localStorage.removeItem('selectedCompany');
    localStorage.removeItem('selectedFY');
    setCompanies([]);
    setSelectedCompany(null);
    setSelectedFY(null);
  }, []);

  const applyCompanies = useCallback((arr, { preserveGuid, activeGuid, forceDefaultFY } = {}) => {
    localStorage.setItem('companies', JSON.stringify(arr));
    setCompanies(arr);
    if (!arr.length) {
      localStorage.removeItem('selectedCompany');
      localStorage.removeItem('selectedFY');
      setSelectedCompany(null);
      setSelectedFY(null);
      return;
    }

    const preferredGuid = preserveGuid || activeGuid || selectedCompanyRef.current?.guid;
    const freshComp = preferredGuid
      ? (arr.find(c => c.guid === preferredGuid)
        || (activeGuid ? arr.find(c => c.guid === activeGuid) : null)
        || arr[0])
      : (activeGuid ? arr.find(c => c.guid === activeGuid) : null) || arr[0];
    localStorage.setItem('selectedCompany', JSON.stringify(freshComp));
    setSelectedCompany(freshComp);

    let fy = forceDefaultFY ? null : selectedFYRef.current;
    if (!forceDefaultFY && fy && freshComp?.years?.length) {
      const match = freshComp.years.find(
        y => y.uniqueId === fy.uniqueId
          || (y.finYear && fy.finYear && y.finYear === fy.finYear)
          || (y.startDate === fy.startDate && y.endDate === fy.endDate),
      );
      fy = match || fy;
    }
    if (!fy && freshComp?.years?.length) {
      fy = pickDefaultFY(freshComp);
    }
    if (fy) {
      localStorage.setItem('selectedFY', JSON.stringify(fy));
      setSelectedFY(fy);
    } else {
      localStorage.removeItem('selectedFY');
      setSelectedFY(null);
    }
  }, []);

  const showToast = (message, type = 'info') => {
    setSyncToast({ message, type });
    setTimeout(() => setSyncToast(null), 4000);
  };

  const loadCompanies = useCallback(async ({ forceDefaultFY = false, demoOnly = null } = {}) => {
    if (!token) return [];
    try {
      const activeGuid = await resolveActiveCompanyGuid();
      const preserve = selectedCompanyRef.current?.guid;
      let arr = await fetchCompaniesHydrated({ forGuid: preserve || activeGuid || undefined });
      // MD Demo Mode: when unpaired, show Demo company only (hide live Tally books)
      const unpaired = demoOnly === true || (demoOnly == null && localStorage.getItem('isPaired') !== 'true');
      if (unpaired) {
        const demos = arr.filter(isDemoCompany);
        // Fail closed: never show live Tally books while unpaired
        arr = demos;
      }
      const stillValid = !!(preserve && arr.some(c => c.guid === preserve));
      const preferDemoGuid = unpaired
        ? arr.find((c) => String(c.name || '').toLowerCase().startsWith('demo') || String(c.guid || '').startsWith('dddddddd'))?.guid
        : null;
      const hydrateGuid = stillValid ? preserve : (preferDemoGuid || arr[0]?.guid);
      if (hydrateGuid && arr.some((c) => c.guid === hydrateGuid && !(c.years || []).length)) {
        try {
          const yearsRes = await fetchCompanyYears(hydrateGuid);
          const years = normalizeCompanyYears(hydrateGuid, yearsRes);
          arr = arr.map((c) => (c.guid === hydrateGuid ? { ...c, years } : c));
        } catch (_) { /* keep company even if years fail */ }
      }
      applyCompanies(arr, {
        preserveGuid: stillValid ? preserve : (preferDemoGuid || undefined),
        activeGuid: preferDemoGuid || undefined,
        forceDefaultFY: forceDefaultFY || !stillValid,
      });
      return arr;
    } catch (err) {
      console.warn('fetchCompanies failed:', err.message);
      return [];
    }
  }, [token, applyCompanies]);

  const loadCompaniesRef = useRef(loadCompanies);
  loadCompaniesRef.current = loadCompanies;

  const clearCompaniesRef = useRef(clearCompaniesState);
  clearCompaniesRef.current = clearCompaniesState;

  // ── Connect WebSocket when token is available ─────────────────────────────
  useEffect(() => {
    if (!token) return;
    wsService.connect(token);

    const unSynced   = wsService.on('synced',   () => {
      showToast('✅ Tally data synced', 'success');
      invalidateStockCache(selectedCompanyRef.current?.guid);
      lastPairingStatusRef.current = 'CONNECTED';
      loadCompaniesRef.current?.({ forceDefaultFY: isDemoCompany(selectedCompanyRef.current), demoOnly: false });
      setSyncVersion(v => v + 1);
    });
    const unTallyConn = wsService.on('tally_connection', (data) => {
      const status = String(data?.status || '').toUpperCase();
      lastPairingStatusRef.current = status || lastPairingStatusRef.current;
      if (status === 'CONNECTED') {
        localStorage.setItem('isPaired', 'true');
        setIsPaired(true);
        loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: false });
        setSyncVersion(v => v + 1);
      } else if (status === 'UNPAIRED') {
        localStorage.setItem('isPaired', 'false');
        setIsPaired(false);
        setIsDesktopOnline(false);
        loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: true });
      } else if (status === 'RECONNECTING') {
        localStorage.setItem('isPaired', 'true');
        setIsPaired(true);
        loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: true });
      }
    });
    const unUnpaired = wsService.on('unpaired', () => {
      setIsPaired(false);
      localStorage.setItem('isPaired', 'false');
      lastPairingStatusRef.current = 'UNPAIRED';
      // Demo Mode: load Demo company data (do not leave the shell empty)
      loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: true });
      showToast('⚠️ Tally unpaired — Demo Mode', 'warning');
    });
    const unLogout   = wsService.on('logout',   () => logout());
    const unPaired   = wsService.on('paired', async (d) => {
      localStorage.setItem('isPaired', 'true');
      setIsPaired(true);
      lastPairingStatusRef.current = 'RECONNECTING';
      showToast(`✅ Paired with ${d?.deviceName || 'Desktop App'}! Waiting for first sync…`, 'success');
      await loadCompaniesRef.current({ forceDefaultFY: true, demoOnly: true });
    });

    return () => { unSynced(); unTallyConn(); unUnpaired(); unLogout(); unPaired(); wsService.disconnect(); };
  }, [token]);

  const refreshPairingStatus = useCallback(async ({ hydrateCompanies = false } = {}) => {
    if (!token) return false;
    try {
      const res = await fetchTallySyncStatus();
      const data = res?.data ?? res;
      const status = String(data?.workspace_status || data?.pairingStatus || data?.pairing_status || '').toUpperCase();
      const paired = !!(data?.is_paired ?? data?.isPaired);
      const wasPaired = localStorage.getItem('isPaired') === 'true';
      localStorage.setItem('isPaired', paired ? 'true' : 'false');
      setIsPaired(paired);
      setIsDesktopOnline(!!data?.desktop_online);
      // CONNECTED never demoOnly; UNPAIRED|RECONNECTING → Demo. Prefer backend status over is_paired alone.
      const demoOnly = status
        ? (status === 'UNPAIRED' || status === 'RECONNECTING')
        : !paired;
      const resolved = status || (paired ? 'RECONNECTING' : 'UNPAIRED');
      const prevStatus = lastPairingStatusRef.current;
      lastPairingStatusRef.current = resolved;
      const selectedIsDemo = isDemoCompany(selectedCompanyRef.current);
      // RECONNECTING → CONNECTED used to skip hydrate because isPaired was already true.
      if (demoOnly) {
        await loadCompaniesRef.current({ forceDefaultFY: true, demoOnly: true });
      } else if (hydrateCompanies || !wasPaired || prevStatus !== 'CONNECTED' || selectedIsDemo) {
        await loadCompaniesRef.current({
          forceDefaultFY: !wasPaired || selectedIsDemo || prevStatus !== 'CONNECTED',
          demoOnly: false,
        });
      }
      return paired;
    } catch {
      return localStorage.getItem('isPaired') === 'true';
    }
  }, [token, clearCompaniesState]);

  useEffect(() => {
    if (!token) return;
    fetchMe()
      .then(res => {
        if (res?.data) {
          const fresh = { ...user, ...res.data };
          localStorage.setItem('authUser', JSON.stringify(fresh));
          setUser(fresh);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    // Prefer refreshPairingStatus / Workspace bootstrap for CONNECTED vs RECONNECTING.
    // Only force Demo hydrate when clearly unpaired (never treat paired as live books).
    if (token && !authBootstrapping && !isPaired) {
      loadCompanies({ demoOnly: true });
    }
  }, [token, authBootstrapping, isPaired, loadCompanies]);

  useEffect(() => {
    if (!token) return;
    refreshPairingStatus({ hydrateCompanies: true });
    const id = setInterval(() => refreshPairingStatus(), 10000);
    return () => clearInterval(id);
  }, [token, refreshPairingStatus]);

  const login = async (authToken, userData) => {
    setAuthBootstrapping(true);
    try {
      let freshUser = userData;
      let paired = false;

      try {
        const meRes = await fetchMeWithToken(authToken);
        const me = meRes?.data;
        if (me) {
          freshUser = { ...userData, ...me };
          paired = !!(me.is_paired ?? me.isPaired);
        }
      } catch (e) {
        console.warn('fetchMe during login failed:', e.message);
      }

      // Do not hydrate live books from is_paired alone — RECONNECTING must stay Demo
      // until Workspace context confirms CONNECTED (refreshPairingStatus / bootstrap).
      let companiesArr = [];
      if (paired) {
        try {
          companiesArr = await fetchCompaniesHydrated({
            bearer: authToken,
            demoOnly: true,
          });
          if (companiesArr.length) {
            applyCompanies(companiesArr, { forceDefaultFY: true });
          }
        } catch (e) {
          console.warn('fetchCompanies during login failed:', e.message);
        }
      }

      setAuthToken(authToken);
      localStorage.setItem('authUser', JSON.stringify(freshUser));
      localStorage.setItem('isPaired', paired ? 'true' : 'false');

      setUser(freshUser);
      setIsPaired(paired);
      if (!paired || !companiesArr.length) {
        clearCompaniesState();
      }
      setToken(authToken);
      tryAutoRegisterPush().catch(() => {});

      return { paired, hasCompanies: companiesArr.length > 0 };
    } finally {
      setAuthBootstrapping(false);
    }
  };

  const logout = async () => {
    try {
      await api.logoutApi({});
    } catch (err) {
      console.warn('[auth] logout API failed:', err?.message || err);
    }
    const pairedState = localStorage.getItem('isPaired');
    clearAuthToken();
    localStorage.clear();
    if (pairedState) localStorage.setItem('isPaired', pairedState);
    setToken(null); setUser(null); setCompanies([]); setSelectedCompany(null); setSelectedFY(null);
    wsService.disconnect();
  };

  const selectCompany = useCallback(async (company) => {
    if (!company?.guid) return;
    let full = company;
    if (!company.years?.length) {
      try {
        const yearsRes = await fetchCompanyYears(company.guid);
        const years = normalizeCompanyYears(company.guid, yearsRes);
        full = { ...company, years };
        setCompanies(prev => prev.map(c => (c.guid === company.guid ? full : c)));
      } catch (err) {
        console.warn('fetchCompanyYears failed:', err.message);
      }
    }
    localStorage.setItem('selectedCompany', JSON.stringify(full));
    setSelectedCompany(full);
    wsService.registerCompany(full.guid);
    const fy = pickDefaultFY(full);
    if (fy) {
      localStorage.setItem('selectedFY', JSON.stringify(fy));
      setSelectedFY(fy);
    }
  }, []);

  const selectFY = useCallback((fy) => {
    if (!fy?.uniqueId) return;
    const prev = selectedFYRef.current;
    if (prev?.uniqueId === fy.uniqueId) return;
    localStorage.setItem('selectedFY', JSON.stringify(fy));
    setSelectedFY(fy);
  }, []);

  const markPaired = useCallback(() => {
    localStorage.setItem('isPaired', 'true');
    setIsPaired(true);
  }, []);

  const markUnpaired = useCallback(() => {
    localStorage.setItem('isPaired', 'false');
    setIsPaired(false);
    setIsDesktopOnline(false);
    loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: true });
  }, []);

  const unpairFromTally = useCallback(async () => {
    const wsId = getWorkspaceId();
    if (!wsId) {
      throw new Error('Workspace required to unpair. Refresh and try again.');
    }
    await unpairWorkspaceTally(wsId);
    localStorage.setItem('isPaired', 'false');
    setIsPaired(false);
    setIsDesktopOnline(false);
    lastPairingStatusRef.current = 'UNPAIRED';
    await loadCompaniesRef.current?.({ forceDefaultFY: true, demoOnly: true });
    showToast('⚠️ Tally unpaired — Demo Mode', 'warning');
  }, []);

  return (
    <AuthContext.Provider value={{
      token, user, companies, selectedCompany, selectedFY, isPaired, isDesktopOnline, authBootstrapping, syncToast, syncVersion,
      login, logout, selectCompany, selectFY, loadCompanies, clearCompaniesState, markPaired, markUnpaired, unpairFromTally, refreshPairingStatus, showToast,
    }}>
      {children}
      {syncToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all
          ${syncToast.type === 'success' ? 'bg-[#059669]' : syncToast.type === 'warning' ? 'bg-amber-500' : 'bg-[#1A1A1A]'}`}>
          {syncToast.message}
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
