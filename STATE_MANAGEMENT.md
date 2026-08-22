# STATE_MANAGEMENT.md — td-web-portal

## Global State: AuthContext
File: `src/contexts/AuthContext.jsx`
Provides via `useAuth()`:

| State | Type | Source | Notes |
|-------|------|--------|-------|
| token | string | localStorage.authToken | JWT access token |
| user | object | localStorage.authUser | {id, name, phone, language} |
| companies | array | localStorage.companies | List of Tally companies |
| selectedCompany | object | localStorage.selectedCompany | {guid, name, gstin} |
| selectedFY | object | localStorage.selectedFY | {fin_year, begin_date, end_date} |
| isPaired | bool | localStorage.isPaired | Whether desktop is paired |
| syncVersion | int | incremented on sync | Use as useEffect dep to trigger refreshes |
| syncToast | object | transient | {message, type} — 4s auto-dismiss |

### Auth Actions
- `login(token, user)` — sets token + user in state + localStorage
- `logout()` — clears localStorage, redirects to /auth/login
- `loadCompanies()` — fetches from API, updates state + localStorage
- `setSelectedCompany(company)` — updates selection + localStorage
- `setSelectedFY(fy)` — updates FY selection + localStorage

### WebSocket Side Effects
AuthContext connects WebSocket on login.
Events trigger:
- `synced` → showToast + loadCompanies() + syncVersion++
- `unpaired` → setIsPaired(false)
- `logout` → logout()
- `paired` → setIsPaired(true) + loadCompanies()

## Settings Context
File: `src/contexts/SettingsContext.jsx`
Provides via `useSettings()`:
- currency settings (symbol, format)
- language preference
- Loaded/saved to localStorage (Needs verification on exact keys)

## Local State Pattern
Each page/module manages its own local state:
```jsx
const [filters, setFilters] = useState({ search: '', dateRange: null });
const { data, loading, error, reload } = useApi(() => fetchVouchers({ companyGuid, fy, ...filters }), [filters]);
```

## Key Hooks
| Hook | File | Purpose |
|------|------|---------|
| useApi | src/hooks/useApi.js | Universal data fetcher with loading/error/reload |
| useCompanyData | src/hooks/useCompanyData.js | Company + FY aware data fetch helper |
| useFYDates | src/hooks/useFYDates.js | Derives from/to dates from selectedFY |

## Stale-Token Cleanup
`AuthContext.jsx` clears localStorage on load if token starts with `demo-token-` (old dev artifact).

## FY-Aware Query Pattern
```js
const fy = selectedFY?.fin_year; // e.g. "2025-2026"
const companyGuid = selectedCompany?.guid;
// Pass both to all API calls
```
