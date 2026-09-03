// API Service — mirrors mobile app's apiService.js exactly
// Auth + live reads: /api/* (mobile V2). Legacy writes: /app/*.

import { API_ROOT, BASE_URL, WS_URL } from './config.js';

const TALLY_BASE = API_ROOT;

const getToken = () => localStorage.getItem('authToken');

// ─── Core request (/app/*) ───────────────────────────────────────────────────
async function request(method, endpoint, body = null, skipAuth = false, bearer = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = bearer || (!skipAuth ? getToken() : null);
  if (token) headers['Authorization'] = `Bearer ${token}`;
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

const get  = (ep, opts)    => request('GET',    ep, null, opts?.skipAuth, opts?.bearer);
const post = (ep, b, opts) => request('POST',   ep, b,    opts?.skipAuth, opts?.bearer);
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

async function apiRequest(method, path, body = null, opts = {}) {
  const { skipAuth = false, bearer } = opts;
  const headers = { 'Content-Type': 'application/json' };
  const token = bearer || (!skipAuth ? getToken() : null);
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

/** Normalize mobile `/api/auth/*` envelopes (also accepts legacy /app field names). */
export function unwrapAuth(res) {
  const d = res?.data ?? {};
  return {
    success: typeof res?.success === 'boolean' ? res.success : res?.status !== false,
    access_token: d.access_token || d.token,
    requires_2fa: !!(d.requires_2fa || d.requires2FA),
    is_new_user: !!(d.is_new_user || d.isNewUser),
    is_paired: !!(d.is_paired ?? d.isPaired),
    pre_auth_token: d.pre_auth_token || d.preAuthToken,
    user: d.user,
    company: d.company,
    otp: d.otp,
    message: res?.message || d.message || d.masked_phone,
  };
}

function toE164(mobileOrPhone, countryCode = '+91') {
  const raw = String(mobileOrPhone || '').trim();
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  const code = String(countryCode || '+91').startsWith('+') ? countryCode : `+${countryCode}`;
  return `${code}${digits}`;
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

/** Charge ledger row → always has `name` + `ledgerName` for SearchSelect / payload. */
function chargeLedgerRow(x) {
  if (typeof x === 'string') return x ? { name: x, ledgerName: x } : null;
  if (!x || typeof x !== 'object') return null;
  const name = x.ledgerName || x.ledger_name || x.name || '';
  return name ? { ...x, name, ledgerName: name } : null;
}

/**
 * Same shape mobile create-invoice uses for GET /api/charge-ledgers:
 * { logisticsCharges, additionalCharges, roundOffLedgers }.
 * unwrapList alone returns [] for that nested object — break logistics pickers.
 */
export function normalizeChargeLedgers(res) {
  const d = res?.data ?? res ?? {};
  if (Array.isArray(d)) {
    return { chargeLedgers: d.map(chargeLedgerRow).filter(Boolean), roundOffLedgers: [] };
  }
  if (d && typeof d === 'object' && (d.logisticsCharges || d.additionalCharges || d.roundOffLedgers || d.chargeLedgers)) {
    const chargeLedgers = [
      ...(d.logisticsCharges || []),
      ...(d.additionalCharges || []),
      ...(d.chargeLedgers || []),
    ].map(chargeLedgerRow).filter(Boolean);
    const roundOffLedgers = (d.roundOffLedgers || []).map(chargeLedgerRow).filter(Boolean);
    return { chargeLedgers, roundOffLedgers };
  }
  return { chargeLedgers: unwrapList(res).map(chargeLedgerRow).filter(Boolean), roundOffLedgers: [] };
}

/**
 * Same as mobile getStockGodowns parse — prefers `data.warehouses[]` with { name, qty }.
 * Falls back to Main Location when empty (mobile parity).
 */
export function normalizeStockGodowns(res, fallbackQty = 0) {
  const d = res?.data ?? res ?? {};
  const list = Array.isArray(d?.warehouses) ? d.warehouses
    : Array.isArray(d) ? d
    : unwrapList(res);
  const gods = (list || []).map(g => {
    if (typeof g === 'string') return { name: g, qty: fallbackQty };
    const name = g?.godown || g?.name || g?.warehouse || g?.warehouse_name || '';
    if (!name) return null;
    return {
      name,
      qty: Number(g.qty ?? g.quantity ?? g.closing_qty ?? fallbackQty) || 0,
    };
  }).filter(Boolean);
  if (!gods.length) return [{ name: 'Main Location', qty: Number(fallbackQty) || 0 }];
  return gods;
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

function readParams(body = {}) {
  let fy = body.fy;
  if (fy && typeof fy === 'object') {
    fy = fyInfoToParam(fy);
  }
  if (typeof fy === 'string') fy = normalizeFinYearLabel(fy) || fy;
  return {
    companyGuid: body.companyGuid,
    from: body.from || body.fromDate,
    to: body.to || body.toDate,
    fy: fy || undefined,
    search: body.search || body.searchText || '',
    page: body.page || 1,
    limit: body.limit || body.pageSize || 100,
  };
}

/** Legacy POST /app/vouchers — internal fallback only */
async function vouchersLegacyPost(body) {
  const res = await post('/vouchers', body);
  const list = res?.data?.vouchers || res?.data || [];
  return { success: true, data: Array.isArray(list) ? list : unwrapList(res), meta: res?.meta };
}

async function fetchRegisterOrVouchers(apiPath, companyGuid, params, voucherType) {
  const apiParams = {
    from: params?.from || params?.fromDate,
    to: params?.to || params?.toDate,
    search: params?.search || params?.searchText,
    page: params?.page || 1,
    limit: params?.limit || params?.pageSize || 100,
    partyName: params?.partyName,
    is_optional: params?.is_optional,
    docTypes: params?.docTypes,
  };
  try {
    const res = await apiGet(withCompany(apiPath, companyGuid, apiParams));
    const items = unwrapList(res);
    if (items.length > 0 || res?.success !== false) {
      return { success: true, data: items, meta: res?.meta };
    }
  } catch {
    // fall through to legacy vouchers POST
  }
  return vouchersLegacyPost({
    companyGuid,
    voucherType,
    page: params?.page || 1,
    pageSize: params?.pageSize || params?.limit || 100,
    searchText: params?.search || params?.searchText,
    fromDate: params?.fromDate || params?.from,
    toDate: params?.toDate || params?.to,
  });
}

// ─── Auth (same /api/auth/* as mobile V4) ────────────────────────────────────
export const sendOtp = (mobileOrPhone, countryCode = '+91') =>
  apiRequest('POST', '/api/auth/send-otp', { phone: toE164(mobileOrPhone, countryCode) }, { skipAuth: true });
export const verifyOtp = (mobileOrPhone, otp, countryCode = '+91', opts = {}) => {
  const extra = countryCode && typeof countryCode === 'object' ? countryCode : opts;
  const code = typeof countryCode === 'string' ? countryCode : '+91';
  return apiRequest('POST', '/api/auth/verify-otp', {
    phone: toE164(mobileOrPhone, code),
    otp,
    ...extra,
  }, { skipAuth: true });
};
export const registerUser = (body, token) =>
  apiRequest('POST', '/api/auth/register', body, { bearer: token });
export const verifyPin = (pin, preAuthToken) =>
  apiRequest('POST', '/api/auth/verify-pin', { pin }, { skipAuth: true, bearer: preAuthToken });
export const resetPin = (pin, preAuthToken) =>
  apiRequest('POST', '/api/auth/reset-pin', { pin }, { skipAuth: true, bearer: preAuthToken });
export const fetchMe         = ()           => apiGet('/api/auth/me');
export const fetchMeWithToken = (token)     => apiRequest('GET', '/api/auth/me', null, { skipAuth: true, bearer: token });
export const updateMe        = (body)       => apiRequest('PATCH', '/api/auth/me', body);

/** Same as mobile logout — POST /api/auth/logout */
export const logoutApi = (body = {}) => apiRequest('POST', '/api/auth/logout', body);

/** Same as mobile changePhone — POST /api/auth/change-phone (steps 1–3) */
export const changePhone = (body) => apiRequest('POST', '/api/auth/change-phone', body);

/** Same as mobile changeEmail — POST /api/auth/change-email (steps 1–2) */
export const changeEmail = (body) => apiRequest('POST', '/api/auth/change-email', body);

/** Push token wrappers (mobile parity; web UI does not register push) */
export const registerPushToken = (body) => apiRequest('POST', '/api/push-token', body);
export const removePushToken = (body = {}) => apiRequest('DELETE', '/api/push-token', body);

// ─── Companies (same /api/companies + /api/company/years as mobile V4) ───────
/** Map GET /api/companies row → { guid, name, gstin, years? } */
export function normalizeApiCompany(row) {
  if (!row) return null;
  const guid = row.guid || row.id;
  if (!guid) return null;
  return { guid, name: row.name, gstin: row.gstin ?? null, years: row.years || [] };
}

export function normalizeApiCompanies(res) {
  const list = res?.data ?? [];
  if (!Array.isArray(list)) return [];
  return list.map(normalizeApiCompany).filter(Boolean);
}

/** Map GET /api/company/years rows → portal FY objects */
export function normalizeCompanyYears(companyGuid, res) {
  const rows = res?.data ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    const finYear = r.fin_year || r.finYear || '';
    const start = r.begin_date || r.startDate || '';
    const end = r.end_date || r.endDate || '';
    const label = r.label || (finYear ? `FY ${finYear}` : '');
    const name = finYear
      ? String(finYear).replace(/^(\d{4})-(\d{4})$/, (_, y1, y2) => `${y1}-${String(y2).slice(-2)}`)
      : String(label).replace(/^FY\s*/i, '');
    return {
      uniqueId: `${companyGuid}_${finYear || label}`,
      name,
      finYear,
      label,
      startDate: start,
      endDate: end,
    };
  });
}

export const fetchCompaniesList = (opts = {}) => {
  const { bearer } = opts;
  if (bearer) return apiRequest('GET', '/api/companies', null, { skipAuth: true, bearer });
  return apiGet('/api/companies');
};

export const fetchCompanyYears = (companyGuid, opts = {}) => {
  const path = `/api/company/years?companyGuid=${encodeURIComponent(companyGuid)}`;
  const { bearer } = opts;
  if (bearer) return apiRequest('GET', path, null, { skipAuth: true, bearer });
  return apiGet(path);
};

/** Active Tally company from sync status — same source mobile poll uses (synced_at DESC). */
export async function resolveActiveCompanyGuid(bearer) {
  try {
    const res = bearer
      ? await apiRequest('GET', '/api/tally-sync/status', null, { skipAuth: true, bearer })
      : await apiGet('/api/tally-sync/status');
    return res?.data?.company?.guid || null;
  } catch {
    return null;
  }
}

/** Companies list + FY years for the selected (or active synced) company — mirrors mobile. */
export async function fetchCompaniesHydrated({ bearer, forGuid } = {}) {
  const res = await fetchCompaniesList({ bearer });
  const companies = normalizeApiCompanies(res);
  if (!companies.length) return [];

  let targetGuid = forGuid && companies.some(c => c.guid === forGuid) ? forGuid : null;
  if (!targetGuid) {
    const activeGuid = await resolveActiveCompanyGuid(bearer);
    if (activeGuid && companies.some(c => c.guid === activeGuid)) {
      targetGuid = activeGuid;
    }
  }
  targetGuid = targetGuid || companies[0].guid;

  const yearsRes = await fetchCompanyYears(targetGuid, { bearer });
  const years = normalizeCompanyYears(targetGuid, yearsRes);
  return companies.map(c => (c.guid === targetGuid ? { ...c, years } : c));
}

// ─── Pairing (same /api/tally-sync/* as mobile) ──────────────────────────────
export const fetchTallySyncStatus = () => apiGet('/api/tally-sync/status');
export const pairWithTally = (pairingCode) =>
  apiRequest('POST', '/api/tally-sync/pair', { pairing_code: String(pairingCode || '').trim() });
export const unpairTally = () => apiRequest('POST', '/api/tally-sync/unpair', {});

// ─── Ledgers (GET /api/ledgers — same as mobile) ─────────────────────────────
export const fetchLedgers = async (body = {}) => {
  const p = readParams(body);
  return apiGet(withCompany('/api/ledgers', p.companyGuid, {
    search: p.search,
    page: p.page,
    limit: p.limit,
    from: p.from,
    to: p.to,
    fy: p.fy,
    group: body.group,
    nature: body.nature,
  }));
};

export const fetchLedgerDetails = async (body = {}) => {
  const id = body.ledgerGuid || body.ledgerId || body.guid || body.id;
  const p = readParams(body);
  return apiGet(withCompany(`/api/ledgers/${encodeURIComponent(id)}`, p.companyGuid, {
    from: p.from, to: p.to, page: p.page, limit: p.limit,
  }));
};

export const fetchLedgerVouchers = async (body = {}) => {
  const p = readParams(body);
  let ledgerId = body.ledgerGuid || body.ledgerId || body.guid;
  if (!ledgerId && body.ledgerName) {
    const list = unwrapList(await fetchLedgers({ companyGuid: p.companyGuid, searchText: body.ledgerName, pageSize: 5 }));
    ledgerId = list.find(l => l.name === body.ledgerName)?.guid || list[0]?.guid;
  }
  if (!ledgerId) throw new Error('Ledger id or name required');
  const res = await apiGet(withCompany(`/api/ledgers/${encodeURIComponent(ledgerId)}/statement`, p.companyGuid, {
    from: p.from, to: p.to, fy: p.fy, page: p.page, limit: p.limit,
  }));
  const txns = res?.data?.transactions || [];
  return { success: true, data: txns, meta: res?.data?.meta || res?.meta, ledger: res?.data?.ledger };
};

/** Monthly debit/credit trend from ledger statement (mobile has no separate trend route) */
export const fetchLedgerTrend = async (body = {}) => {
  const res = await fetchLedgerVouchers(body);
  const txns = unwrapList(res);
  const byMonth = {};
  for (const t of txns) {
    const key = String(t.date || '').slice(0, 7);
    if (!key) continue;
    if (!byMonth[key]) byMonth[key] = { label: key, debit: 0, credit: 0, value: 0 };
    byMonth[key].debit += Math.abs(Number(t.debit || (t.dr_cr === 'Dr' ? t.amount : 0)) || 0);
    byMonth[key].credit += Math.abs(Number(t.credit || (t.dr_cr === 'Cr' ? t.amount : 0)) || 0);
    byMonth[key].value += Math.abs(Number(t.amount) || 0);
  }
  return { success: true, data: Object.values(byMonth).sort((a, b) => a.label.localeCompare(b.label)) };
};

export const fetchVoucherDetail = async (body = {}) => {
  const { companyGuid, voucherId } = body;
  return apiGet(`/api/vouchers/${encodeURIComponent(voucherId)}?companyGuid=${encodeURIComponent(companyGuid)}`);
};

// ─── Stocks (GET /api/stocks/* — same as mobile) ─────────────────────────────
/** Same as mobile getStockDashboard — still served on /app/stock-dashboard */
export const fetchStockSummary = (companyGuid) => post('/stock-dashboard', { companyGuid });

export const fetchStockFilters = async (companyGuid) => {
  const [groupsRes, whRes] = await Promise.all([
    apiGet(withCompany('/api/stocks/groups', companyGuid)),
    apiGet(withCompany('/api/stocks/warehouses', companyGuid)),
  ]);
  const groups = unwrapList(groupsRes).map(g => (typeof g === 'string' ? g : g.name)).filter(Boolean);
  return { success: true, data: { groups, categories: groups, warehouses: unwrapList(whRes) } };
};

export const fetchParties = async (body = {}) => {
  const p = readParams(body);
  return apiGet(withCompany('/api/parties', p.companyGuid, {
    search: p.search,
    type: body.type || body.party_type,
  }));
};

export const fetchStocks = async (body = {}) => {
  const p = readParams(body);
  const res = await apiGet(withCompany('/api/stocks/items', p.companyGuid, {
    search: p.search,
    page: p.page,
    limit: p.limit,
    from: p.from,
    to: p.to,
    fy: p.fy,
    category: body.category,
    group: body.group,
    warehouse: body.warehouse,
  }));
  const d = res?.data;
  const items = Array.isArray(d) ? d : (d?.items || unwrapList(res));
  return {
    success: true,
    data: {
      stocks: items,
      totalStocks: res?.meta?.total ?? items.length,
      summary: d?.summary,
    },
    meta: res?.meta,
  };
};

export const fetchStockDetails = async (body = {}) => {
  const id = body.stockGuid || body.stockId || body.guid || body.id || body.name;
  const p = readParams(body);
  return apiGet(withCompany(`/api/stocks/items/${encodeURIComponent(id)}`, p.companyGuid, {
    from: p.from, to: p.to, fy: p.fy,
  }));
};

// ─── Vouchers (GET /api/vouchers — same as mobile) ───────────────────────────
const VOUCHER_TYPE_QUERY = {
  Payment: 'payment', Receipt: 'receipt', Journal: 'journal', Contra: 'contra',
  Sales: 'sales', Purchase: 'purchase',
  'Sales Invoice': 'sales', 'Purchase Invoice': 'purchase',
};

export const fetchVouchers = async (body = {}) => {
  const p = readParams(body);
  const typeKey = body.voucherType || body.type;
  const type = VOUCHER_TYPE_QUERY[typeKey] || (typeKey ? String(typeKey).toLowerCase() : undefined);
  try {
    const res = await apiGet(withCompany('/api/vouchers', p.companyGuid, {
      search: p.search,
      page: p.page,
      limit: p.limit,
      from: p.from,
      to: p.to,
      ...(type ? { type } : {}),
    }));
    const items = unwrapList(res);
    return { success: true, data: items, meta: res?.meta };
  } catch {
    return vouchersLegacyPost(body);
  }
};

export const fetchDaybook = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/daybook', companyGuid, {
    date: params.date,
    from: params.from || params.fromDate,
    to: params.to || params.toDate,
    page: params.page || 1,
    limit: params.limit || params.pageSize || 500,
  }));

// Register helpers — GET /api/* first, fallback to POST /vouchers
export const fetchSalesInvoices = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/invoices', companyGuid, params, 'Sales');
export const fetchSalesOrders = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/orders', companyGuid, params, 'Sales Order');

/** Same as mobile getSalesVouchers — GET /api/sales/vouchers */
export const fetchSalesVouchers = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/sales/vouchers', companyGuid, {
    from: params.from, to: params.to, search: params.search,
    page: params.page || 1, limit: params.limit || params.pageSize || 50,
    docTypes: params.docTypes, partyGroups: params.partyGroups,
  }));

/** Same as mobile getSalesVoucherCounts — GET /api/sales/vouchers/counts */
export const fetchSalesVoucherCounts = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/sales/vouchers/counts', companyGuid, {
    from: params.from, to: params.to,
  }));

/** Same as mobile getSalesInvoiceCreditNoteContext */
export const fetchSalesInvoiceCreditNoteContext = (invoiceId, companyGuid) =>
  apiGet(withCompany(`/api/sales/invoices/${encodeURIComponent(invoiceId)}/credit-note-context`, companyGuid));

export const fetchPurchaseOrders = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/purchase/orders', companyGuid, params, 'Purchase Order');
export const fetchPurchaseInvoices = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/purchase/invoices', companyGuid, params, 'Purchase');

/** Same as mobile getPurchaseVouchers — GET /api/purchase/vouchers */
export const fetchPurchaseVouchers = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/purchase/vouchers', companyGuid, {
    from: params.from, to: params.to, search: params.search,
    page: params.page || 1, limit: params.limit || params.pageSize || 50,
    docTypes: params.docTypes, partyGroups: params.partyGroups,
  }));

/** Same as mobile getPurchaseVoucherCounts — GET /api/purchase/vouchers/counts */
export const fetchPurchaseVoucherCounts = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/purchase/vouchers/counts', companyGuid, {
    from: params.from, to: params.to,
  }));

/** Same as mobile getPurchaseInvoiceDebitNoteContext */
export const fetchPurchaseInvoiceDebitNoteContext = (invoiceId, companyGuid) =>
  apiGet(withCompany(`/api/purchase/invoices/${encodeURIComponent(invoiceId)}/debit-note-context`, companyGuid));

export const fetchCreditNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/credit-notes', companyGuid, params, 'Credit Note');
export const fetchDebitNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/purchase/debit-notes', companyGuid, params, 'Debit Note');
export const fetchDeliveryNotes = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/delivery-notes', companyGuid, params, 'Delivery Note');
export const fetchProforma = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/invoices', companyGuid, { ...params, is_optional: true }, 'Proforma');
export const fetchQuotations = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/sales/vouchers', companyGuid, { ...params, docTypes: 'quotation' }, 'Quotation');
export const fetchSalesEwaybills = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/sales/ewaybills', companyGuid, {
    from: params?.from || params?.fromDate,
    to: params?.to || params?.toDate,
    search: params?.search || params?.searchText,
    page: params?.page || 1,
    limit: params?.limit || params?.pageSize || 100,
  }));

/** Dashboard GET query params — match mobile home (period + from/to only). */
function dashboardQueryParams(period, from, to) {
  return {
    ...(period ? { period } : {}),
    ...(from && to ? { from, to } : {}),
  };
}

/** Mobile home dashboard — same 4 GETs as `app/(tabs)/index.tsx` loadData. */
export async function loadMobileDashboard(companyGuid, period = '1M', from, to) {
  const q = dashboardQueryParams(period, from, to);
  const settled = await Promise.allSettled([
    apiGet(withCompany('/api/dashboard/kpi-strip', companyGuid, q)),
    apiGet(withCompany('/api/dashboard/metrics', companyGuid, q)),
    fetchCashflow(companyGuid, period, from, to),
    apiGet(withCompany('/api/dashboard/recent-activity', companyGuid)),
  ]);
  const val = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : null);
  const kpiRes = val(0);
  const metRes = val(1);
  const cfRes = val(2);
  const actRes = val(3);
  return {
    kpiStrip: Array.isArray(kpiRes?.data) ? kpiRes.data : [],
    metrics: {
      tiles: Array.isArray(metRes?.data) ? metRes.data : [],
      series: Array.isArray(metRes?.series) ? metRes.series : [],
      interval: metRes?.interval || null,
    },
    cashflow: cfRes,
    recent: actRes,
    failed: settled.map((r, i) => (r.status === 'rejected' ? ['kpi', 'metrics', 'cashflow', 'activity'][i] : null)).filter(Boolean),
  };
}

/** Dashboard chart series — used by Dashboard + Financials overview. */
export const fetchDashboardChart = async (companyGuid, period = '1M', from, to) => {
  const res = await apiGet(withCompany('/api/dashboard/chart', companyGuid, dashboardQueryParams(period, from, to)));
  const d = res?.data ?? res;
  return {
    series: Array.isArray(d?.series) ? d.series : [],
    interval: d?.interval || null,
  };
};

/** Top customers from sales invoices — same aggregation as mobile `app/sales/index.tsx`. */
export async function aggregateTopCustomersFromInvoices(companyGuid, from, to, limit = 5) {
  const res = await fetchSalesInvoices(companyGuid, { from, to, limit: 500, pageSize: 500 });
  const rows = unwrapList(res);
  const partyMap = {};
  rows.forEach(r => {
    const name = r.party_name || r.partyName || r.party;
    if (!name) return;
    partyMap[name] = (partyMap[name] || 0) + Math.abs(Number(r.amount) || 0);
  });
  const sorted = Object.entries(partyMap).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = sorted[0]?.[1] || 1;
  return sorted.map(([name, revenue]) => ({
    name,
    revenue,
    invoices: rows.filter(r => (r.party_name || r.partyName || r.party) === name).length,
    pct: Math.round((revenue / max) * 100),
  }));
}

/** Cost breakdown from GET /api/expenses categories — mobile parity (no web-only /dashboard/cost-analysis). */
export async function aggregateCostFromExpenses(companyGuid, from, to) {
  const res = await fetchExpenses({ companyGuid, from, to, limit: 500 });
  const categories = res.categories || [];
  const totalFromCats = categories.reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0);
  const total = totalFromCats || Math.abs(Number(res.summary?.total) || 0);
  const heads = categories
    .filter(c => c?.name)
    .map(c => {
      const amt = Math.abs(Number(c.amount) || 0);
      return {
        name: c.name,
        amount_raw: amt,
        pct: total ? Math.round((amt / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount_raw - a.amount_raw);
  return { total_raw: total, heads };
}

/** Same as mobile getCashflow — GET /api/dashboard/cashflow?period=&from=&to= */
export const fetchCashflow = async (companyGuid, period = '1M', from, to) => {
  const res = await apiGet(withCompany('/api/dashboard/cashflow', companyGuid, dashboardQueryParams(period, from, to)));
  const d = res?.data ?? res;
  if (!d || typeof d !== 'object') return null;
  return {
    netCash: Number(d.net_cash ?? d.netCash ?? 0),
    grossCash: Number(d.gross_cash ?? d.grossCash ?? 0),
    netRealisableBalance: Number(d.net_realisable_balance ?? d.netRealisableBalance ?? 0),
    grossProfit: Number(d.gross_profit ?? d.grossProfit ?? 0),
    netProfit: Number(d.net_profit ?? d.netProfit ?? 0),
    incomePercentage: Number(d.income_percentage ?? d.incomePercentage ?? 0),
    updatedAt: d.updated_at ?? d.updatedAt ?? null,
    totalIncome: Number(d.total_income ?? d.totalIncome ?? 0),
    totalExpense: Number(d.total_expense ?? d.totalExpense ?? 0),
    sales: Number(d.sales ?? 0),
    purchase: Number(d.purchase ?? 0),
    grossProfitVsSalesPct: Number(
      d.gross_profit_vs_sales_pct ?? d.grossProfitVsSalesPct
      ?? d.income_percentage ?? d.incomePercentage ?? 0,
    ),
    series: Array.isArray(d.series) ? d.series : [],
    interval: d.interval || null,
    fyFrom: d.fy_from ?? d.fyFrom ?? from,
    fyTo: d.fy_to ?? d.fyTo ?? to,
  };
};

/** AI Insights — current FY (GET /api/ai/insights, same as mobile) */
export const fetchAIInsights = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/ai/insights', companyGuid, {
    from: params.from,
    to: params.to,
    fy: params.fy,
  }));

/** AI Insights — closed historical FY (GET /api/ai/insights/history/:fy) */
export const fetchAIInsightsHistory = (companyGuid, financialYear) =>
  apiGet(withCompany(`/api/ai/insights/history/${encodeURIComponent(financialYear)}`, companyGuid));

/** Same as mobile sales KPI cards — GET /api/sales/home-metrics */
export const fetchSalesHomeMetrics = (companyGuid, from, to) =>
  apiGet(`/api/sales/home-metrics?companyGuid=${encodeURIComponent(companyGuid)}${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`);

export const fetchPurchaseHomeMetrics = (companyGuid, from, to) =>
  apiGet(`/api/purchase/home-metrics?companyGuid=${encodeURIComponent(companyGuid)}${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`);

export const fetchExpensesHomeMetrics = (companyGuid, from, to) =>
  apiGet(`/api/expenses/home-metrics?companyGuid=${encodeURIComponent(companyGuid)}${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`);

function mapHomeMetricsToTab(data) {
  const d = data || {};
  return {
    kpis: [
      { id: 'today', label: 'Today', value: d.today, format: 'currency' },
      { id: 'mtd', label: 'MTD', value: d.mtd, format: 'currency' },
      { id: 'ytd', label: 'YTD', value: d.ytd, format: 'currency' },
      { id: 'outstanding', label: 'Outstanding', value: d.outstanding, format: 'currency' },
      { id: 'credit-notes', label: 'Credit Notes', value: d.credit_notes ?? d.creditNotes, format: 'currency' },
      { id: 'avg-ticket', label: 'Avg Ticket', value: d.avg_ticket ?? d.avgTicket, format: 'currency' },
    ].filter(k => k.value != null),
    alerts: d.alerts || [],
  };
}

export { mapHomeMetricsToTab };

/** Prefer tab-metrics (3.0); fall back to home-metrics which already exists. */
export const fetchSalesTabMetrics = async (companyGuid, tab, from, to) => {
  try {
    return await apiGet(`/api/sales/tab-metrics?companyGuid=${encodeURIComponent(companyGuid)}&tab=${encodeURIComponent(tab || 'invoices')}&contract=alerts-v1${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`);
  } catch {
    const res = await fetchSalesHomeMetrics(companyGuid, from, to);
    return { success: true, data: mapHomeMetricsToTab(res?.data || res) };
  }
};

export const fetchKpiDetail = (metric, params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
  return apiGet(`/api/kpi/${metric}?${qs}`);
};

/** Same as mobile getKPIPayments — GET /api/kpi/payments (dashboard Payments card drill) */
export const fetchKpiPayments = (companyGuid, params = {}) =>
  fetchKpiDetail('payments', { companyGuid, ...params });

/** Same as mobile getKPIReceipts — GET /api/kpi/receipts (dashboard Receipts card drill) */
export const fetchKpiReceipts = (companyGuid, params = {}) =>
  fetchKpiDetail('receipts', { companyGuid, ...params });

export const fetchMyEntries = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/vouchers/my-entries', companyGuid, params));
export const retryMyEntry = (id) =>
  apiRequest('POST', `/api/vouchers/my-entries/${id}/retry`, {});

export const fetchWarehouses = (companyGuid) =>
  apiGet(withCompany('/api/stocks/warehouses', companyGuid));

export const fetchPartiesList = (companyGuid, params = {}) =>
  fetchParties({ companyGuid, ...params });

/** Same as mobile getBankLedgers — GET /api/bank-ledgers?type=bank|cash|all */
export const fetchBankLedgers = (companyGuid, type = 'all') =>
  apiGet(withCompany('/api/bank-ledgers', companyGuid, { type }));

/** Same as mobile getSalesLedgerAccounts */
export const fetchSalesLedgerAccounts = (companyGuid) =>
  apiGet(withCompany('/api/sales/ledger-accounts', companyGuid));

/** Same as mobile getPurchaseLedgerAccounts */
export const fetchPurchaseLedgerAccounts = (companyGuid) =>
  apiGet(withCompany('/api/purchase/ledger-accounts', companyGuid));

/** Same as mobile getStockGodowns — per-warehouse qty for a stock item (guid or name) */
export const fetchStockGodowns = async (companyGuid, stockIdOrName, opts = {}) => {
  const res = await apiGet(withCompany(`/api/stocks/items/${encodeURIComponent(stockIdOrName)}/godowns`, companyGuid));
  const warehouses = normalizeStockGodowns(res, opts.fallbackQty);
  return { ...res, data: { ...(res?.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {}), warehouses }, success: true };
};

export const fetchTaxLedgers = (companyGuid) =>
  apiGet(withCompany('/api/tax/ledgers', companyGuid));

/** Same as mobile getChargeLedgers — returns { chargeLedgers, roundOffLedgers } under data */
export const fetchChargeLedgers = async (companyGuid) => {
  const res = await apiGet(withCompany('/api/charge-ledgers', companyGuid));
  const normalized = normalizeChargeLedgers(res);
  return { ...res, data: normalized, success: true };
};

/** Same as mobile getCompanyProfile — GET /api/company/profile */
export const fetchCompanyProfile = (companyGuid) =>
  apiGet(`/api/company/profile?companyGuid=${encodeURIComponent(companyGuid)}`);
export const fetchStockGroups = (companyGuid) =>
  apiGet(withCompany('/api/stocks/groups', companyGuid));
export const fetchStockUnits = (companyGuid) =>
  apiGet(withCompany('/api/stocks/units', companyGuid));
export const fetchOutstandingBills = (companyGuid, ledger, opts = {}) =>
  apiGet(withCompany('/api/party/outstanding-bills', companyGuid, {
    ledger,
    ...(opts.drOnly ? { drOnly: 'true' } : {}),
    ...(opts.crOnly ? { crOnly: 'true' } : {}),
  }));
export const fetchGeoCountries = () => apiGet('/api/geo/countries');
export const fetchGeoStates = (country) =>
  apiGet(`/api/geo/states?country=${encodeURIComponent(country)}`);

export const sendPaymentReminder = (companyGuid, data) =>
  apiRequest('POST', '/api/reminders/send', { companyGuid, ...data });
export const searchGlobal = (companyGuid, q) =>
  apiGet(`/api/dashboard/search?companyGuid=${encodeURIComponent(companyGuid)}&q=${encodeURIComponent(q)}`);

/** Same as mobile getNotifications — GET /api/notifications */
export const fetchNotifications = (companyGuid) =>
  apiGet(withCompany('/api/notifications', companyGuid));

/** Same as mobile markNotificationRead — PATCH /api/notifications/:id/read */
export const markNotificationRead = (id) =>
  apiRequest('PATCH', `/api/notifications/${encodeURIComponent(id)}/read`, {});

/** Same as mobile markAllNotificationsRead — PATCH /api/notifications/read-all */
export const markAllNotificationsRead = (companyGuid) =>
  apiRequest('PATCH', withCompany('/api/notifications/read-all', companyGuid), {});

export const lookupBarcode = (companyGuid, barcode) =>
  apiRequest('POST', '/api/inventory/barcodes/lookup', { companyGuid, barcode });
export const fetchBarcodesList = (companyGuid, opts = {}) =>
  apiRequest('POST', '/api/inventory/barcodes', { companyGuid, ...opts });
export const generateBarcode = (companyGuid, stockGuid, opts = {}) =>
  apiRequest('POST', '/api/inventory/barcodes/generate', { companyGuid, stockGuid, ...opts });
export const generateBarcodesBulk = (companyGuid, opts = {}) =>
  apiRequest('POST', '/api/inventory/barcodes/generate-bulk', { companyGuid, ...opts });
export const linkBarcode = (companyGuid, stockGuid, barcode, opts = {}) =>
  apiRequest('POST', '/api/inventory/barcodes/link', { companyGuid, stockGuid, barcode, ...opts });
export const bulkImportBarcodes = (companyGuid, text, fileName) =>
  apiRequest('POST', '/api/inventory/barcodes/bulk-import', { companyGuid, text, fileName });
export const fetchBarcodeSettings = (companyGuid) =>
  apiGet(`/api/inventory/barcodes/settings?companyGuid=${encodeURIComponent(companyGuid)}`);
export const updateBarcodeSettings = (companyGuid, settings) =>
  apiRequest('POST', '/api/inventory/barcodes/settings', { companyGuid, ...settings });
export const pushPendingBarcodes = (companyGuid) =>
  apiRequest('POST', '/api/inventory/barcodes/push-pending', { companyGuid });

/** Same as mobile getBarcodesByGuids */
export const fetchBarcodesByGuids = (companyGuid, stockGuids = []) =>
  apiRequest('POST', '/api/inventory/barcodes/by-guids', { companyGuid, stockGuids });

/** Same as mobile downloadBarcodeTemplate — GET CSV text */
export const downloadBarcodeTemplate = async (companyGuid) => {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_ROOT}${withCompany('/api/inventory/barcodes/template', companyGuid)}`, { headers });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.text();
};

/** Same as mobile bulk barcode job APIs */
export const startBulkBarcodeJob = (companyGuid, opts = {}) =>
  apiRequest('POST', '/api/inventory/barcodes/generate-bulk/start', { companyGuid, ...opts });
export const fetchBulkBarcodeJobStatus = (jobId, companyGuid) =>
  apiGet(withCompany(`/api/inventory/barcodes/generate-bulk/status/${encodeURIComponent(jobId)}`, companyGuid));

/** Stock item movements — GET /api/stocks/items/:id/movements */
export const fetchStockMovements = (companyGuid, stockId) =>
  apiGet(withCompany(`/api/stocks/items/${encodeURIComponent(stockId)}/movements`, companyGuid));

/** Movement analytics chart — GET /api/stocks/movement-analytics/chart */
export const fetchMovementAnalyticsChart = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/stocks/movement-analytics/chart', companyGuid, {
    from: params.from, to: params.to, fy: params.fy,
  }));

/** Company compliance config — same routes Settings already called page-only */
export const fetchComplianceConfig = (companyGuid) =>
  apiGet(`/api/company/${encodeURIComponent(companyGuid)}/compliance-config`);
export const saveComplianceConfig = (companyGuid, body) =>
  apiRequest('POST', `/api/company/${encodeURIComponent(companyGuid)}/compliance-config`, body);

/** Same as mobile getCompanyCapabilities — GET /api/company/capabilities */
export const fetchCompanyCapabilities = (companyGuid) =>
  apiGet(withCompany('/api/company/capabilities', companyGuid));

/** Same as mobile cancelEInvoice / cancelEWayBill */
export const cancelEInvoice = (payload) =>
  apiRequest('POST', '/api/einvoice/cancel', payload);
export const cancelEWayBill = (payload) =>
  apiRequest('POST', '/api/ewaybills/cancel', payload);

/** Help AI — POST /api/ai/help */
export const askHelpAI = (message, history = []) =>
  apiRequest('POST', '/api/ai/help', { message, history });

export const fetchStockAdjustments = (companyGuid, params = {}) =>
  fetchRegisterOrVouchers('/api/stocks/adjustments', companyGuid, params, 'Stock Journal');

export const fetchVoucherFull = (companyGuid, voucherId) =>
  apiGet(`/api/vouchers/${encodeURIComponent(voucherId)}?companyGuid=${encodeURIComponent(companyGuid)}`);
export const fetchPrintProfile = (companyGuid) => get(`/companies/${companyGuid}/print-profile`);

// ─── FY params (mobile parity — see tallydekho-mobile-V4 AuthContext fyInfoToParam) ──

/** Same as mobile `fyInfoToParam` — prefer `fin_year` from GET /api/company/years, else derive from startDate. */
export function fyInfoToParam(fy) {
  if (!fy) return undefined;
  if (typeof fy === 'string') return normalizeFinYearLabel(fy) || fy;
  if (fy.finYear) return fy.finYear;
  if (fy.fin_year) return fy.fin_year;
  if (fy.startDate) {
    const y = parseInt(String(fy.startDate).slice(0, 4), 10);
    return Number.isFinite(y) ? `${y}-${y + 1}` : undefined;
  }
  return undefined;
}

/** Mobile dashboard / sales / ledger list — `from`+`to` only; backend resolves FY from dates. */
export function fyDateParams(selectedFY) {
  const from = selectedFY?.startDate || selectedFY?.begin_date;
  const to = selectedFY?.endDate || selectedFY?.end_date;
  return from && to ? { from, to } : {};
}

/** Mobile reports / stocks / other-taxes / KPI drilldowns — `fy` + optional from/to. */
export function fyReportParams(selectedFY) {
  const fy = fyInfoToParam(selectedFY);
  return {
    ...fyDateParams(selectedFY),
    ...(fy ? { fy } : {}),
  };
}

/** @deprecated alias — use fyInfoToParam */
export const fyParamFromFY = (fy) => fyInfoToParam(fy) ?? null;

/** '2025-26' / 'FY 2025-26' → '2025-2026' for backend fy= queries */
export function normalizeFinYearLabel(fyParam) {
  if (!fyParam) return null;
  let s = String(fyParam).trim().replace(/^FY\s*/i, '');
  const full = s.match(/^(\d{4})-(\d{4})$/);
  if (full) return `${full[1]}-${full[2]}`;
  const short = s.match(/^(\d{4})-(\d{2})$/);
  if (short) {
    const y1 = parseInt(short[1], 10);
    const y2 = parseInt(short[2], 10);
    const endYear = y2 >= 100 ? y2 : (y2 < 50 ? 2000 + y2 : 1900 + y2);
    return endYear === y1 + 1 ? `${y1}-${endYear}` : `${y1}-${y1 + 1}`;
  }
  return s;
}

/** Standard FY query params for report endpoints (pl-bs, stocks, other-taxes). */
export function companyFYParams(selectedFY) {
  const from = selectedFY?.startDate || selectedFY?.begin_date;
  const to = selectedFY?.endDate || selectedFY?.end_date;
  return {
    ...fyReportParams(selectedFY),
    fromDate: from,
    toDate: to,
  };
}

// ─── Reports (mobile parity — GET /api/reports/pl-bs) ───────────────────────
const numAmount = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

async function fetchPlBsReport(body = {}) {
  const companyGuid = body.companyGuid;
  const res = await apiGet(withCompany('/api/reports/pl-bs', companyGuid, {
    from: body.from || body.fromDate,
    to: body.to || body.toDate,
    fy: body.fy || fyInfoToParam(body.fy),
  }));
  return res?.data ?? res ?? {};
}

export const fetchReportsPL = async (body = {}) => {
  const pl = (await fetchPlBsReport(body)).pl || {};
  return {
    pl,
    income: pl.income || [
      ...(pl.salesLedgers || []),
      ...(pl.directIncLedgers || []),
      ...(pl.indirectIncLedgers || []),
    ],
    expenses: pl.expenses || [
      ...(pl.purchaseLedgers || []),
      ...(pl.directExpLedgers || []),
      ...(pl.indirectExpLedgers || []),
    ],
    summary: {
      openingStock: numAmount(pl.openingStock),
      closingStock: numAmount(pl.closingStock),
      sales: numAmount(pl.sales),
      purchase: numAmount(pl.purchase),
      directExpenses: numAmount(pl.directExpenses),
      directIncome: numAmount(pl.directIncome),
      indirectExpenses: numAmount(pl.indirectExpenses),
      indirectIncome: numAmount(pl.indirectIncome),
      grossProfit: numAmount(pl.grossProfit),
      grossLoss: numAmount(pl.grossLoss),
      netProfit: numAmount(pl.netProfit),
      netLoss: numAmount(pl.netLoss),
      totalIncome: numAmount(pl.totalIncome),
      totalExpenses: numAmount(pl.totalExpenses),
    },
  };
};

export const fetchReportsBS = async (body = {}) => {
  const bs = (await fetchPlBsReport(body)).bs || {};
  return {
    assets: bs.assets || [],
    liabilities: bs.liabilities || [],
    summary: {
      totalAssets: numAmount(bs.totalAssets),
      totalLiabilities: numAmount(bs.totalLiabilities),
    },
  };
};

export const fetchReportsTB = async (body = {}) => {
  const tb = (await fetchPlBsReport(body)).trialBalance || {};
  return {
    rows: tb.ledgers || [],
    ledgers: tb.ledgers || [],
    totalDebit: numAmount(tb.totalDebit),
    totalCredit: numAmount(tb.totalCredit),
  };
};

/** Cash & bank — GET /api/kpi/bank-balance + /api/kpi/cash-in-hand (mobile parity) */
export const fetchCashBank = async (body = {}) => {
  const companyGuid = body.companyGuid;
  const range = {
    from: body.from || body.fromDate,
    to: body.to || body.toDate,
    fy: body.fy || fyInfoToParam(body.fy),
  };
  const [bankRes, cashRes] = await Promise.all([
    fetchKpiDetail('bank-balance', { companyGuid, ...range }),
    fetchKpiDetail('cash-in-hand', { companyGuid, ...range }),
  ]);
  const bank = bankRes?.data ?? bankRes ?? {};
  const cash = cashRes?.data ?? cashRes ?? {};
  const bankAccounts = [
    ...(bank.banks || []).map((b, i) => ({
      id: b.name || `bank-${i}`,
      name: b.name,
      balance: numAmount(b.balance),
      type: b.parent || 'Bank',
    })),
    ...(cash.ledgers || []).map((l, i) => ({
      id: `cash-${l.name || i}`,
      name: l.name,
      balance: numAmount(l.balance),
      type: 'Cash-in-Hand',
    })),
  ];
  const bankTxns = (bank.banks || []).flatMap(b =>
    (b.transactions || []).map((t, i) => ({
      id: t.guid || `${b.name}-${i}`,
      guid: t.guid,
      voucher_number: t.voucher_number,
      voucher_type: t.voucher_type,
      party_name: t.party_name,
      date: t.date,
      amount: numAmount(t.amount),
    }))
  );
  const cashTxns = (cash.transactions || []).map((t, i) => ({
    id: t.guid || `cash-${i}`,
    guid: t.guid,
    voucher_number: t.voucher_number,
    voucher_type: t.voucher_type || (t.direction === 'in' ? 'Receipt' : 'Payment'),
    party_name: t.party_name,
    date: t.date,
    amount: numAmount(t.amount),
  }));
  const transactions = [...bankTxns, ...cashTxns]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const totalReceipts = transactions
    .filter(t => /receipt/i.test(t.voucher_type || '') || t.direction === 'in')
    .reduce((s, t) => s + t.amount, 0);
  const totalPayments = transactions
    .filter(t => /payment|contra/i.test(t.voucher_type || '') || t.direction === 'out')
    .reduce((s, t) => s + t.amount, 0);
  return {
    bankAccounts,
    transactions,
    summary: {
      bankBalance: bankAccounts.reduce((s, a) => s + a.balance, 0),
      totalReceipts,
      totalPayments,
      netCash: totalReceipts - totalPayments,
    },
  };
};

// ─── User Settings / Company (root /api — not /app/api) ───────────────────────
export const getUserSettings    = () => apiGet('/api/auth/user-settings');
export const updateUserSettings = (data) => apiRequest('PATCH', '/api/auth/user-settings', data);

export const fetchCompanyLogo    = (companyGuid) => apiGet(`/api/company/${companyGuid}/logo`);
export const uploadCompanyLogo   = (companyGuid, logo) => apiRequest('POST', `/api/company/${companyGuid}/logo`, { logo });
export const updateCompanyProfile = (companyGuid, data) => apiRequest('PATCH', `/api/company/profile?companyGuid=${companyGuid}`, data);
/** Receivables & payables — GET /api/kpi/receivables + /api/kpi/payables */
export const fetchReceivablesPayables = async (body = {}) => {
  const companyGuid = body.companyGuid;
  const range = { from: body.from || body.fromDate, to: body.to || body.toDate };
  const [recRes, payRes] = await Promise.all([
    fetchKpiDetail('receivables', { companyGuid, ...range }),
    fetchKpiDetail('payables', { companyGuid, ...range }),
  ]);
  const rec = recRes?.data ?? recRes ?? {};
  const pay = payRes?.data ?? payRes ?? {};
  const mapParty = (p, i) => ({
    id: p.guid || p.name || i,
    guid: p.guid,
    name: p.name,
    outstanding: numAmount(p.amount ?? p.accountingBalance ?? p.openBillOutstanding),
    invoice_count: p.openBillCount || 0,
    last_date: p.last_date || null,
  });
  return {
    receivables: (rec.parties || []).map(mapParty),
    payables: (pay.parties || []).map(mapParty),
    summary: {
      totalReceivables: numAmount(rec.total),
      totalPayables: numAmount(pay.total),
      net: numAmount(rec.total) - numAmount(pay.total),
    },
  };
};

/** Expenses register — GET /api/expenses (mobile parity) */
export const fetchExpenses = async (params = {}) => {
  const {
    companyGuid, fromDate, toDate, from, to, types, type, page, limit, pageSize,
  } = params;
  const res = await apiGet(withCompany('/api/expenses', companyGuid, {
    from: from || fromDate,
    to: to || toDate,
    types: types || type,
    page: page || 1,
    limit: limit || pageSize || 500,
  }));
  return {
    expenses: res?.data ?? [],
    categories: res?.categories ?? [],
    summary: res?.summary ?? {},
    meta: res?.meta,
  };
};

/** Same as mobile getExpenseCounts — GET /api/expenses/counts */
export const fetchExpenseCounts = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/expenses/counts', companyGuid, {
    from: params.from, to: params.to,
  }));

/** Same as mobile getFinancialData — GET /api/reports/financial */
export const fetchReportsFinancial = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/reports/financial', companyGuid, {
    from: params.from, to: params.to,
  }));

/** Same as mobile getGSTReport — GET /api/reports/gst */
export const fetchGSTReport = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/reports/gst', companyGuid, {
    from: params.from, to: params.to, fy: params.fy,
  }));

/** Same as mobile getUnmatchedInvoices — GET /api/reports/unmatched */
export const fetchUnmatchedInvoices = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/reports/unmatched', companyGuid, {
    from: params.from, to: params.to, fy: params.fy, page: params.page, limit: params.limit,
  }));

/** Same as mobile getAlerts — GET /api/alerts */
export const fetchAlerts = (companyGuid, params = {}) =>
  apiGet(withCompany('/api/alerts', companyGuid, {
    from: params.from, to: params.to, fy: params.fy,
  }));

export const fetchGSTSummary = async (body = {}) => {
  const p = readParams(body);
  const res = await apiGet(withCompany('/api/reports/gst-summary', p.companyGuid, {
    from: p.from, to: p.to, fy: p.fy,
  }));
  const s = res?.summary || res?.data?.summary || res?.data || {};
  return {
    success: true,
    summary: s,
    data: {
      gstCollected: s.gstCollected,
      itcBalance: s.itcBalance,
      netPayable: s.netPayable,
      unmatchedCount: s.unmatchedCount,
      outwardTaxable: s.outwardTaxable,
      inwardTaxable: s.inwardTaxable,
      total: s.gstCollected ?? s.netPayable,
      outputTax: s.gstCollected,
      inputTax: s.itcBalance,
    },
  };
};

/** Other taxes — GET /api/reports/other-taxes/* (mobile parity) */
export const fetchOtherTaxesSummary = async (body = {}) => {
  const p = readParams(body);
  return apiGet(withCompany('/api/reports/other-taxes/summary', p.companyGuid, { fy: p.fy }));
};

export const fetchOtherTaxesTransactions = async (body = {}) => {
  const p = readParams(body);
  const { taxType, page = 1, limit = 500 } = body;
  return apiGet(withCompany('/api/reports/other-taxes/transactions', p.companyGuid, {
    taxType,
    fy: p.fy,
    page,
    limit: body.limit || body.pageSize || limit,
  }));
};

export const fetchOtherTaxesLateChallans = async (body = {}) => {
  const p = readParams(body);
  const { taxType } = body;
  return apiGet(withCompany('/api/reports/other-taxes/late-challans', p.companyGuid, {
    taxType,
    fy: p.fy,
  }));
};

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
export const createProformaInvoice = (b) => tallyRequest('/tally/voucher/proforma', b);
export const convertProformaInvoice = (b) => tallyRequest('/tally/voucher/proforma/convert', b);
export const createStockTransfer   = (b) => tallyRequest('/tally/voucher/stock-transfer', b);
export const createStockAdjustment = (b) => tallyRequest('/tally/voucher/stock-adjustment', b);
export const fetchAuditTrail = ({ companyGuid, status, limit = 50, offset = 0 } = {}) =>
  tallyGet(`/tally/audit-trail?companyGuid=${companyGuid}${status ? '&status=' + status : ''}&limit=${limit}&offset=${offset}`);
export const retryAuditEntry = (id) => tallyRequest(`/tally/audit-trail/${id}/retry`, {});
export const cancelVoucher         = (b) => tallyRequest('/tally/voucher/cancel',         b);
export const createPartyInTally    = (b) => tallyRequest('/tally/master/party',           b);
export const createWarehouseInTally= (b) => tallyRequest('/tally/master/warehouse',       b);
export const createStockItemInTally= (b) => tallyRequest('/tally/master/stock-item',      b);
export const alterStockItemInTally = (b) => tallyRequest('/tally/master/stock-item-alter', b);
export const createBankLedgerInTally = (b) => tallyRequest('/tally/master/bank', b);

/** Same as mobile invoice/master preview helpers */
export const fetchTallyInvoicePreview = (tdkRef, companyGuid) =>
  tallyGet(`/tally/invoice/${encodeURIComponent(tdkRef)}/preview?companyGuid=${encodeURIComponent(companyGuid || '')}`);
export const shareTallyInvoicePdf = (tdkRef, body = {}) =>
  tallyRequest(`/tally/invoice/${encodeURIComponent(tdkRef)}/share-pdf`, body);
export const fetchMasterPreview = (queueId, companyGuid) =>
  tallyGet(`/tally/master/${encodeURIComponent(queueId)}/preview?companyGuid=${encodeURIComponent(companyGuid || '')}`);

// ─── Default export (object style — matches mobile usage pattern) ─────────────
const api = {
  // Auth
  sendOtp, verifyOtp, registerUser, verifyPin, resetPin, fetchMe, fetchMeWithToken, fetchCompaniesList, fetchCompanyYears, fetchCompaniesHydrated, normalizeApiCompanies, normalizeCompanyYears, updateMe, unwrapAuth,
  logoutApi, changePhone, changeEmail, registerPushToken, removePushToken,
  // Pairing
  pairWithTally, fetchTallySyncStatus, unpairTally,
  // Companies
  fetchCompaniesList, fetchCompanyYears, fetchCompaniesHydrated, resolveActiveCompanyGuid,
  fetchComplianceConfig, saveComplianceConfig, fetchCompanyCapabilities,
  cancelEInvoice, cancelEWayBill,
  // Ledgers
  fetchLedgers, fetchLedgerDetails, fetchLedgerVouchers, fetchVoucherDetail,
  // Stocks
  fetchStockSummary, fetchStockFilters, fetchStocks, fetchStockDetails, fetchParties,
  fetchWarehouses, fetchPartiesList, fetchBankLedgers,
  fetchSalesLedgerAccounts, fetchPurchaseLedgerAccounts, fetchStockGodowns,
  fetchTaxLedgers, fetchChargeLedgers, fetchCompanyProfile, fetchStockGroups, fetchStockUnits,
  normalizeChargeLedgers, normalizeStockGodowns,
  fetchOutstandingBills, fetchGeoCountries, fetchGeoStates,
  fetchStockMovements, fetchMovementAnalyticsChart,
  // Vouchers & Reports
  fetchVouchers, fetchDaybook, loadMobileDashboard, fetchDashboardChart,
  aggregateTopCustomersFromInvoices, aggregateCostFromExpenses,
  fetchCashflow, fetchKpiDetail, fetchKpiPayments, fetchKpiReceipts, fetchSalesHomeMetrics, fetchPurchaseHomeMetrics, fetchExpensesHomeMetrics, fetchSalesTabMetrics,
  fetchReportsPL, fetchReportsBS, fetchReportsTB, fyInfoToParam, fyDateParams, fyReportParams, fyParamFromFY, normalizeFinYearLabel, companyFYParams,
  fetchCashBank, fetchReceivablesPayables, fetchExpenses, fetchExpenseCounts, fetchGSTSummary,
  fetchReportsFinancial, fetchGSTReport, fetchUnmatchedInvoices, fetchAlerts,
  fetchOtherTaxesSummary, fetchOtherTaxesTransactions, fetchOtherTaxesLateChallans,
  fetchAIInsights, fetchAIInsightsHistory, askHelpAI,
  fetchCompanyLogo, uploadCompanyLogo, updateCompanyProfile,
  fetchVoucherFull, fetchPrintProfile,
  getUserSettings, updateUserSettings,
  // Registers
  fetchSalesInvoices, fetchSalesOrders, fetchPurchaseOrders, fetchPurchaseInvoices, fetchCreditNotes, fetchDebitNotes, fetchDeliveryNotes,
  fetchSalesVouchers, fetchSalesVoucherCounts, fetchSalesInvoiceCreditNoteContext,
  fetchPurchaseVouchers, fetchPurchaseVoucherCounts, fetchPurchaseInvoiceDebitNoteContext,
  fetchProforma, fetchQuotations, fetchSalesEwaybills, fetchStockAdjustments, fetchDaybook,
  fetchMyEntries, retryMyEntry, fetchAuditTrail, retryAuditEntry,
  sendPaymentReminder, searchGlobal,
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  lookupBarcode, fetchBarcodesList, generateBarcode, generateBarcodesBulk, linkBarcode,
  bulkImportBarcodes, fetchBarcodeSettings, updateBarcodeSettings, pushPendingBarcodes,
  fetchBarcodesByGuids, downloadBarcodeTemplate, startBulkBarcodeJob, fetchBulkBarcodeJobStatus,
  unwrapList,
  // Tally Write
  createSalesInvoice, createSalesOrder, createPurchaseInvoice, createPurchaseOrder,
  createPaymentVoucher, createReceiptVoucher, createJournalVoucher, createContraVoucher,
  createCreditNote, createDebitNote, createDeliveryNote, createProformaInvoice, convertProformaInvoice, cancelVoucher,
  createStockTransfer, createStockAdjustment,
  createPartyInTally, createWarehouseInTally, createStockItemInTally, alterStockItemInTally, createBankLedgerInTally,
  fetchTallyInvoicePreview, shareTallyInvoicePdf, fetchMasterPreview,
};

export { WS_URL, API_ROOT, TALLY_BASE, apiGet };
export default api;
