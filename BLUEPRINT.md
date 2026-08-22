# BLUEPRINT.md — td-web-portal

## Stack
- React 18 + Vite
- React Router v6 (lazy-loaded pages)
- Tailwind CSS
- Port: 5173 (may shift to 5174/5175 if port occupied)

## Entry Points
- `index.html` → `src/main.jsx` → `src/App.jsx`
- `src/App.jsx` — route tree + auth guards + error boundary

## Auth
- Token stored in `localStorage.authToken`
- User stored in `localStorage.authUser`
- Companies in `localStorage.companies`
- Selected company in `localStorage.selectedCompany`
- Selected FY in `localStorage.selectedFY`
- Context: `src/contexts/AuthContext.jsx` — provides {token, user, companies, selectedCompany, selectedFY, isPaired, syncVersion}
- WebSocket: connects on login, listens for `synced` / `unpaired` / `logout` events

## State Management
- Auth + company selection: `AuthContext`
- Settings (currency, language): `SettingsContext`
- No Redux/Zustand — all state via context + local useState
- See: STATE_MANAGEMENT.md

## API
- All calls via `src/services/api.js` wrapper
- Auth header: `Authorization: Bearer <token>` from localStorage
- Company param: `?companyGuid=<guid>&fy=<fy>`
- Data fetching hook: `src/hooks/useApi.js`
- See: API_USAGE.md

## Layout
- `src/layouts/AppShell.jsx` — sidebar nav + top header + Outlet
- Company switcher + FY switcher in Header
- All protected pages render inside AppShell

## Page Structure
- Auth pages: `src/pages/auth/`
- Feature pages: `src/pages/` (flat + by category)
- See: ROUTING_MAP.md for full route tree

## Key Components
- `src/components/Table.jsx` — shared data table
- `src/components/KPICard.jsx` — KPI tile
- `src/components/VoucherDetail.jsx` — voucher drawer
- `src/components/SyncStatus.jsx` — sync state indicator
- `src/components/GlobalSearch.jsx` — cross-repo search
- `src/components/InvoicePDF.jsx` — PDF generation

## Details
- Route map: ROUTING_MAP.md
- API usage: API_USAGE.md
- State: STATE_MANAGEMENT.md
- Task routing: TASK_ROUTING.md
