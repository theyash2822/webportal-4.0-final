# KNOWN_ISSUES.md — td-web-portal

## Active / Open Issues

### Mock Data
- Removed `src/data/*Mock.js` and `mockData.js` (2026-08-10)
- Create-form warehouse picker uses live `/api/stocks/warehouses` (no fake godown names)
- Quotation form is an honest stub (not connected to Tally)

### API Prefix Mismatch vs Mobile V4
- Web portal report/list legacy still uses `/app/*` for many POST body endpoints
- Register helpers + settings/company/warehouses use `API_ROOT` + `/api/*`
- Remaining `/app` surfaces should migrate carefully when touching those screens

### Company Logo Upload
- Feature not built on web portal
- Backend has routes (POST/GET /api/company/:guid/logo)
- UI + upload form not implemented yet

### Pairing Flow (TallySync.jsx)
- Needs verification: exact pairing code entry + error handling behavior

## Fixed Issues

### Stale Demo Tokens
- Old dev tokens (demo-token-*) caused blank screens
- Fix: AuthContext clears localStorage if token starts with 'demo-token-'

### Company + FY Selection
- Company switcher + FY switcher added to Header (Apr 27)
- All API calls use selectedCompany.guid + selectedFY.fin_year

### WebSocket Sync State
- "Data Synced" vs "Sync Complete" socket event mismatch fixed (Apr 29)
- syncVersion counter added — pages use it as useEffect dep for auto-refresh

## Architecture Notes
- All lazy-loaded pages — code split per route
- Error boundary in App.jsx catches render crashes, shows "Back to Login"
- OTPScreen has NO AuthRoute wrapper (intentional — race condition if added)
