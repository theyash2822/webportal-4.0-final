import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api, {
  fetchMe,
  fetchMeWithToken,
  fetchCompaniesHydrated,
  fetchCompanyYears,
  normalizeCompanyYears,
  fetchTallySyncStatus,
  resolveActiveCompanyGuid,
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

(function cleanStaleToken() {
  const t = getAuthToken();
  if (t && t.startsWith('demo-token-')) {
    clearAuthToken();
    localStorage.clear();
  }
})();

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
      const prev = selectedFYRef.current;
      if (prev?.uniqueId !== fy.uniqueId || prev?.startDate !== fy.startDate) {
        localStorage.setItem('selectedFY', JSON.stringify(fy));
        setSelectedFY(fy);
      }
    } else {
      localStorage.removeItem('selectedFY');
      setSelectedFY(null);
    }
  }, []);

  const showToast = (message, type = 'info') => {
    setSyncToast({ message, type });
    setTimeout(() => setSyncToast(null), 4000);
  };

  const loadCompanies = useCallback(async ({ forceDefaultFY = false } = {}) => {
    if (!token) return [];
    try {
      const activeGuid = await resolveActiveCompanyGuid();
      const preserve = selectedCompanyRef.current?.guid;
      const arr = await fetchCompaniesHydrated({ forGuid: preserve || activeGuid || undefined });
      const stillValid = !!(preserve && arr.some(c => c.guid === preserve));
      applyCompanies(arr, {
        preserveGuid: stillValid ? preserve : (activeGuid || undefined),
        activeGuid,
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
      loadCompanies();
      setSyncVersion(v => v + 1);
    });
    const unUnpaired = wsService.on('unpaired', () => {
      setIsPaired(false);
      localStorage.setItem('isPaired', 'false');
      clearCompaniesRef.current();
      showToast('⚠️ Tally unpaired', 'warning');
    });
    const unLogout   = wsService.on('logout',   () => logout());
    const unPaired   = wsService.on('paired', async (d) => {
      localStorage.setItem('isPaired', 'true');
      setIsPaired(true);
      showToast(`✅ Paired with ${d?.deviceName || 'Desktop App'}! Loading your data...`, 'success');
      await loadCompaniesRef.current();
    });

    return () => { unSynced(); unUnpaired(); unLogout(); unPaired(); wsService.disconnect(); };
  }, [token]);

  const refreshPairingStatus = useCallback(async ({ hydrateCompanies = false } = {}) => {
    if (!token) return false;
    try {
      const res = await fetchTallySyncStatus();
      const data = res?.data ?? res;
      const paired = !!(data?.is_paired ?? data?.isPaired);
      const wasPaired = localStorage.getItem('isPaired') === 'true';
      localStorage.setItem('isPaired', paired ? 'true' : 'false');
      setIsPaired(paired);
      setIsDesktopOnline(!!data?.desktop_online);
      if (!paired) {
        clearCompaniesState();
      } else if (hydrateCompanies || !wasPaired) {
        await loadCompaniesRef.current();
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
    if (token && !authBootstrapping && isPaired) loadCompanies();
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

      let companiesArr = [];
      if (paired) {
        try {
          const activeGuid = await resolveActiveCompanyGuid(authToken);
          companiesArr = await fetchCompaniesHydrated({ bearer: authToken, forGuid: activeGuid || undefined });
          if (companiesArr.length) {
            applyCompanies(companiesArr, { activeGuid, forceDefaultFY: true });
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
    clearCompaniesState();
  }, [clearCompaniesState]);

  const unpairFromTally = useCallback(async () => {
    await api.unpairTally();
    localStorage.setItem('isPaired', 'false');
    setIsPaired(false);
    setIsDesktopOnline(false);
    clearCompaniesState();
    showToast('⚠️ Tally unpaired', 'warning');
  }, [clearCompaniesState]);

  return (
    <AuthContext.Provider value={{
      token, user, companies, selectedCompany, selectedFY, isPaired, isDesktopOnline, authBootstrapping, syncToast, syncVersion,
      login, logout, selectCompany, selectFY, loadCompanies, markPaired, markUnpaired, unpairFromTally, refreshPairingStatus, showToast,
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
