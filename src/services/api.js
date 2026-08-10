// API Service — mirrors mobile app's apiService.js exactly
// Base URL: https://test.tallydekho.com/app

// Switch to your own backend when ready
// Local dev: http://localhost:3001/app
// Production AWS: https://your-domain.com/app
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/app';
const WS_URL   = import.meta.env.VITE_WS_URL  || 'http://localhost:3001';

// /api/* and /tally/* live on the host root — strip /app from VITE_API_URL
const API_ROOT = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/app\/?$/, '')
  : 'http://localhost:3001';
const TALLY_BASE = API_ROOT;

const getToken = () => localStorage.getItem('authToken');

// ─── Core request (/app/*) ───────────────────────────────────────────────────
async function request(method, endpoint, body = null, skipAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || `HTTP ${res.status}`), { status: res.status, data: err });
  }
  return res.json();
}

const get  = (ep, opts)    => request('GET',    ep, null, opts?.skipAuth);
const post = (ep, b, opts) => request('POST',   ep, b,    opts?.skipAuth);
const put  = (ep, b)       => request('PUT',    ep, b);
const del  = (ep)          => request('DELETE', ep);

// ─── Root GET (/api/*, /tally/*) ─────────────────────────────────────────────
async function apiGet(path) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_ROOT}${path}`, { headers });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw Object.assign(new Error(e.message || e?.error?.message || `HTTP ${res.status}`), { status: res.status, data: e });
  }
  return res.json();
}

async function apiRequest(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw Object.assign(new Error(e.message || e?.error?.message || `HTTP ${res.status}`), { status: res.status, data: e });
  }
  return res.json();
}

/** Find array in common mobile/backend response shapes */
export function unwrapList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  const d = res.data ?? res.result ?? res;
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  for (const key of ['items', 'rows', 'vouchers', 'entries', 'parties', 'warehouses', 'ledgers', 'stocks', 'list', 'data']) {
    if (Array.isArray(d[key])) return d[key];
  }
  return [];
}

function withCompany(path, companyGuid, params = {}) {
  const qs = new URLSearchParams();
  if (companyGuid) qs.set('companyGuid', companyGuid);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v));
  });
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

async function fetchRegisterOrVouchers(apiPath, companyGuid, params, voucherType) {
  // Backend voucherListHandler expects from/to/limit (not fromDate/toDate/pageSize)
  const apiParams = {
    from: params?.from || params?.fromDate,
    to: params?.to || params?.toDate,
    search: params?.search || params?.searchText,
    page: params?.page || 1,
    limit: params?.limit || params?.pageSize || 100,
    partyName: params?.partyName,
  };
  try {
    const res = await apiGet(withCompany(apiPath, companyGuid, apiParams));
    const items = unwrapList(res);
    if (items.length > 0 || res?.success !== false) {
      // Keep data as array — unwrapList + callers expect array or { vouchers: [] }
      return { success: true, data: items, meta: res?.meta };
    }
  } catch {
    // fall through to vouchers POST
  }
  return fetchVouchers({
    companyGuid,
    voucherType,
    page: params?.page || 1,
    pageSize: params?.pageSize || params?.limit || 100,
    searchText: params?.search || params?.searchText,
    fromDate: params?.fromDate || params?.from,
    toDate: params?.toDate || params?.to,
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const sendOtp  = (mobileNumber, countryCode = '+91') => post('/send-otp',  { mobileNumber, countryCode }, { skipAuth: true });
export const verifyOtp      = (mobileNumber, otp, countryCode = '+91', opts = {}) =>
  post('/verify-otp', { mobileNumber, otp, countryCode, ...opts }, { skipAuth: true });

// 2FA PIN endpoints
export const verifyPin  = (pin, preAuthToken) => {
  return fetch(`${BASE_URL}/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${preAuthToken}` },
    body: JSON.stringify({ pin }),
  }).then(r => r.json());
};
export const setPin     = (pin) => post('/set-pin', { pin });
export const removePin  = (pin) => request('DELETE', '/remove-pin', { pin });
export const resetPin   = (pin, preAuthToken) => {
  return fetch(`${BASE_URL}/reset-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${preAuthToken}` },
    body: JSON.stringify({ pin }),
  }).then(r => r.json());
};
export const setBiometric   = (enabled) => request('PATCH', '/set-biometric', { enabled });
export const get2FAStatus   = () => get('/two-fa-status');
export const verifyToken = (token)          => post('/verify',    { token }, { skipAuth: true });
export const submitOnboarding = (body)      => post('/onboarding', body);
export const fetchMe         = ()           => get('/me');
export const updateMe        = (body)       => post('/me', body);

// ─── Pairing ──────────────────────────────────────────────────────────────────
export const pairDevice        = (pairingCode) => post('/pairing',        { pairingCode });
export const fetchPairingDetails = ()          => get('/pairing-device');
export const updatePairing     = (body)        => put('/pairing',         body);

// ─── Companies ───────────────────────────────────────────────────────────────
export const fetchCompanies = () => get('/companies');

// ─── Ledgers ──────────────────────────────────────────────────────────────────
export const fetchLedgers        = (body) => post('/ledgers', body);
export const fetchLedgerDetails  = (body) => post('/ledger',  body);
export const fetchLedgerVouchers = (body) => post('/ledger-vouchers', body);
export const fetchLedgerTrend    = (body) => post('/ledger-trend', body);
export const fetchVoucherDetail  = (body) => post('/voucher-detail', body);  // { companyGuid, voucherId }

// ─── Stocks ───────────────────────────────────────────────────────────────────
export const fetchStockSummary = (companyGuid)       => post('/stock-dashboard', { companyGuid });
export const fetchStockFilters = (companyGuid)       => post('/stock-filters',   { companyGuid });
export const fetchParties      = (body)               => post('/parties',          body);
export const fetchStocks       = (body, signal)      => post('/stocks',          body);
export const fetchStockDetails = (body)              => post('/stock',           body);

// ─── Vouchers ─────────────────────────────────────────────────────────────────
export const fetchVouchers = (body) => post('/vouchers', body);

// Register helpers — GET /api/* first, fallback to POST /vouchers
export const fetchSalesOrders = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/orders', companyGuid, params, 'Sales Order');
export const fetchPurchaseOrders = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/purchase/orders', companyGuid, params, 'Purchase Order');
export const fetchCreditNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/credit-notes', companyGuid, params, 'Credit Note');
export const fetchDebitNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/purchase/debit-notes', companyGuid, params, 'Debit Note');
export const fetchDeliveryNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/delivery-notes', companyGuid, params, 'Delivery Note');

export const fetchMyEntries = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/vouchers/my-entries', companyGuid, params));
export const retryMyEntry = (id) =>
  apiRequest('POST', `/api/vouchers/my-entries/${id}/retry`, {});

export const fetchWarehouses = (companyGuid) =>
  apiGet(withCompany('/api/stocks/warehouses', companyGuid));

export const fetchPartiesList = async (companyGuid, params = {}) => {
  try {
    return await apiGet(withCompany('/api/parties', companyGuid, params));
  } catch {
    return fetchParties({ companyGuid, ...params });
  }
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const fetchDashboard = (body) => post('/dashboard', body);

// ─── Reports ──────────────────────────────────────────────────────────────────
export const fetchReportsPL = (body) => post('/reports/pl', body);
export const fetchReportsBS = (body) => post('/reports/balance-sheet', body);
export const fetchReportsTB = (body) => post('/reports/trial-balance', body);

// V2: FY-specific balance fetchers — pass fy= query param
// fyParam: '2025-2026' format (from selectedFY.startDate)
export const fyParamFromFY = (fy) => {
  if (!fy) return null;
  if (fy.startDate) {
    const y = parseInt(fy.startDate.slice(0, 4), 10);
    return `${y}-${y + 1}`;
  }
  return null;
};
export const fetchLedgerFyBalances = (companyGuid, fy) => {
  const fyParam = typeof fy === 'string' ? fy : fyParamFromFY(fy);
  const params = new URLSearchParams({ companyGuid });
  if (fyParam) params.set('fy', fyParam);
  return apiGet(`/api/ledgers/fy-balances?${params}`);
};
export const fetchLedgerStatement = (companyGuid, id, fy, extra = {}) => {
  const fyParam = typeof fy === 'string' ? fy : fyParamFromFY(fy);
  const params = new URLSearchParams({ companyGuid });
  if (fyParam) params.set('fy', fyParam);
  Object.entries(extra).forEach(([k, v]) => v && params.set(k, v));
  return apiGet(`/api/ledgers/${id}/statement?${params}`);
};
export const fetchCashBank            = (body) => post('/cash-bank', body);

// ─── User Settings / Company (root /api — not /app/api) ───────────────────────
export const getUserSettings    = () => apiGet('/api/auth/user-settings');
export const updateUserSettings = (data) => apiRequest('PATCH', '/api/auth/user-settings', data);

export const fetchCompanyLogo    = (companyGuid) => apiGet(`/api/company/${companyGuid}/logo`);
export const uploadCompanyLogo   = (companyGuid, logo) => apiRequest('POST', `/api/company/${companyGuid}/logo`, { logo });
export const updateCompanyProfile = (companyGuid, data) => apiRequest('PATCH', `/api/company/profile?companyGuid=${companyGuid}`, data);
export const fetchReceivablesPayables = (body) => post('/receivables-payables', body);
export const fetchExpenses            = (body) => post('/expenses', body);
export const fetchGSTSummary          = (body) => post('/gst-summary', body);

// ─── Tally Write API (creates vouchers/masters in Tally via desktop proxy) ────
async function tallyRequest(endpoint, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${TALLY_BASE}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw Object.assign(new Error(e.message||`HTTP ${res.status}`), { status: res.status }); }
  return res.json();
}

async function tallyGet(endpoint) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${TALLY_BASE}${endpoint}`, { headers });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw Object.assign(new Error(e.message||`HTTP ${res.status}`), { status: res.status }); }
  return res.json();
}

export const createSalesInvoice    = (b) => tallyRequest('/tally/voucher/sales',         b);
export const createSalesOrder      = (b) => tallyRequest('/tally/voucher/sales-order',    b);
export const createPurchaseInvoice = (b) => tallyRequest('/tally/voucher/purchase',       b);
export const createPurchaseOrder   = (b) => tallyRequest('/tally/voucher/purchase-order', b);
export const createPaymentVoucher  = (b) => tallyRequest('/tally/voucher/payment',        b);
export const createReceiptVoucher  = (b) => tallyRequest('/tally/voucher/receipt',        b);
export const createJournalVoucher  = (b) => tallyRequest('/tally/voucher/journal',        b);
export const createContraVoucher   = (b) => tallyRequest('/tally/voucher/contra',         b);
export const createCreditNote      = (b) => tallyRequest('/tally/voucher/credit-note',    b);
export const createDebitNote       = (b) => tallyRequest('/tally/voucher/debit-note',     b);
export const createDeliveryNote    = (b) => tallyRequest('/tally/voucher/delivery-note',  b);
export const fetchAuditTrail = ({ companyGuid, status, limit = 50, offset = 0 } = {}) =>
  tallyGet(`/tally/audit-trail?companyGuid=${companyGuid}${status ? '&status=' + status : ''}&limit=${limit}&offset=${offset}`);
export const retryAuditEntry = (id) => tallyRequest(`/tally/audit-trail/${id}/retry`, {});
export const cancelVoucher         = (b) => tallyRequest('/tally/voucher/cancel',         b);
export const createPartyInTally    = (b) => tallyRequest('/tally/master/party',           b);
export const createWarehouseInTally= (b) => tallyRequest('/tally/master/warehouse',       b);
export const createStockItemInTally= (b) => tallyRequest('/tally/master/stock-item',      b);

// ─── Default export (object style — matches mobile usage pattern) ─────────────
const api = {
  // Auth
  sendOtp, verifyOtp, verifyPin, setPin, removePin, resetPin, get2FAStatus, setBiometric, verifyToken, submitOnboarding, fetchMe, updateMe,
  // Pairing
  pairDevice, fetchPairingDetails, updatePairing,
  // Companies
  fetchCompanies,
  // Ledgers
  fetchLedgers, fetchLedgerDetails, fetchLedgerVouchers, fetchVoucherDetail,
  // Stocks
  fetchStockSummary, fetchStockFilters, fetchStocks, fetchStockDetails, fetchParties,
  fetchWarehouses, fetchPartiesList,
  // Vouchers & Reports
  fetchVouchers, fetchDashboard, fetchReportsPL, fetchReportsBS, fetchReportsTB, fyParamFromFY,
  fetchCashBank, fetchReceivablesPayables, fetchExpenses, fetchGSTSummary,
  fetchCompanyLogo, uploadCompanyLogo, updateCompanyProfile,
  getUserSettings, updateUserSettings,
  fetchLedgerFyBalances, fetchLedgerStatement,
  // Registers
  fetchSalesOrders, fetchPurchaseOrders, fetchCreditNotes, fetchDebitNotes, fetchDeliveryNotes,
  fetchMyEntries, retryMyEntry, fetchAuditTrail, retryAuditEntry,
  unwrapList,
  // Tally Write
  createSalesInvoice, createSalesOrder, createPurchaseInvoice, createPurchaseOrder,
  createPaymentVoucher, createReceiptVoucher, createJournalVoucher, createContraVoucher,
  createCreditNote, createDebitNote, createDeliveryNote, cancelVoucher,
  createPartyInTally, createWarehouseInTally, createStockItemInTally,
};

export { WS_URL, API_ROOT, TALLY_BASE, apiGet };
export default api;
