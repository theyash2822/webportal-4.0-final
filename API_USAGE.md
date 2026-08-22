# API_USAGE.md — td-web-portal

Source: `src/services/api.js`
Base URL: `VITE_API_URL` env var (default: `http://localhost:3001/app`)
WebSocket: `VITE_WS_URL` env var (default: `http://localhost:3001`)

## Note
Web portal uses `/app/*` prefix (legacy routes), NOT `/api/*`.
Mobile V4 uses `/api/*` (new spec).
This is by design — reconciling them is a future task.

## Auth
| Function | HTTP | Endpoint |
|----------|------|----------|
| sendOtp | POST | /send-otp |
| verifyOtp | POST | /verify-otp |
| verifyPin | POST | /verify-pin |
| setPin | POST | /set-pin |
| removePin | DELETE | /remove-pin |
| resetPin | POST | /reset-pin |
| setBiometric | PATCH | /set-biometric |
| get2FAStatus | GET | /two-fa-status |
| fetchMe | GET | /me |
| updateMe | POST | /me |
| verifyToken | POST | /verify |

## Pairing
| Function | HTTP | Endpoint |
|----------|------|----------|
| pairDevice | POST | /pairing |
| fetchPairingDetails | GET | /pairing-device |
| updatePairing | PUT | /pairing |

## Companies
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchCompanies | GET | /companies |

## Ledgers
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchLedgers | POST | /ledgers |
| fetchLedgerDetails | POST | /ledger |
| fetchLedgerVouchers | POST | /ledger-vouchers |
| fetchLedgerTrend | POST | /ledger-trend |
| fetchVoucherDetail | POST | /voucher-detail |

## Stocks
(Needs verification — check src/services/api.js for full stock exports)

## Reports
(Needs verification — check src/services/api.js for financial/GST/compliance exports)

## Data Fetching Pattern
All pages use `useApi()` hook:
```jsx
const { data, loading, error, reload } = useApi(() => api.fetchLedgers({ companyGuid, fy }), [companyGuid, fy]);
```

## Auth Header
Token from `localStorage.getItem('authToken')` → `Authorization: Bearer <token>`

## Company + FY Params
Most endpoints require: `{ companyGuid: selectedCompany?.guid, fy: selectedFY?.fin_year }`
Passed in POST body (not query string — differs from mobile V4)

## WebSocket
Service: `src/services/websocket.js` (Needs verification — file not confirmed in scan)
Connected via `AuthContext` when token is set.
Events listened: `synced`, `unpaired`, `logout`, `paired`
