# CHANGELOG_AGENT.md — td-web-portal

Format: Date | Task | Files Changed | Behavior Changed | Tested | Risks

---

## 2026-09-02 | Dead-code cleanup — orphan modules + unused API wrappers
Files changed: deleted ~37 orphan pages/components + 8 dead services/hooks; trimmed `src/services/api.js`; `AGENTS.md`, `API_USAGE.md`.
Batch A: removed unreachable legacy pages (Parties/Ledgers/AIInsights/OTPScreen/old *Module.jsx/compliance/financials orphans) and components only they used (KPICard/Table/Drawer/PinModal/…).
Batch B: removed `mockData.js`, `derived.js`, `localQueue.js`, `data/countries.js`, unused hooks (`useApi`, `useCompanyData`, `useFYDates`, `use-toast`).
Batch C: removed unused API exports/aliases (setPin/removePin/2FA/biometric, legacy pairing aliases, deprecated dashboard top-customers/cost-analysis wrappers, unused loans-ods/fy-balances/ledger-statement/active-bulk-job). Kept live paths: `loadMobileDashboard`, `fetchCashflow`, `fetchDashboardChart`, create/register APIs.
Verified: each batch had zero live importers; `vite build` GREEN after A, B, and C.
Risks: none for runtime — only dead graph removed. Optional later: trim unused named exports inside live `financials.jsx`.

---

## 2026-09-02 | Fix login crash — wsService not defined
Files changed: `src/contexts/AuthContext.jsx`
Restored missing `import wsService from '../services/websocket'` that was dropped when wiring push + stock-cache invalidation. ErrorBoundary showed "wsService is not defined" after login.
Tested: import restored; reload login.

---

## 2026-09-02 | Phases 2–10 — mobile parity backlog (onboarding → push)
Files changed: `src/App.jsx`, `src/layouts/AppShell.jsx`, `src/contexts/AuthContext.jsx`, `src/pages/Onboarding.jsx`, `DocumentViewer.jsx`, `CashflowReport.jsx`, `src/pages/purchase.jsx`, `src/pages/masters.jsx`, `src/pages/inventory.jsx`, `src/pages/settings.jsx`, `src/components/create/common.jsx`, `voucherForms.jsx`, `accountingForms.jsx`, `src/components/settings/VoucherConfigPanel.jsx`, `BarcodeGunInput.jsx`, `OfflineBadge.jsx`, `CashflowReportDrawer.jsx`, `src/services/push.js`, `src/utils/*`, `public/firebase-messaging-sw.js`, `package.json`, docs.
Phase 2: `/onboarding` gate after login; `/document/:id` viewer; `/cashflow-report`; USB barcode gun on line items + inventory scan.
Phase 3: Purchase KPI strip from `GET /api/purchase/home-metrics`; Expenses from `GET /api/expenses/home-metrics`.
Phase 4: Inline Add Supplier on PI; draft auto-save/resume (SI/proforma/PI); barcode gun on SI + PI.
Phase 5: Contra optional INR denomination cash count → `cashCount` payload.
Phase 6: Full voucher PDF config panel (format, bank, QR, terms, numbering).
Phase 7: `voucher:tallySynced` WS refresh on doc viewer; offline badge; stock list cache + invalidate on sync.
Phase 8: Label print + jsPDF download on inventory label/print pages.
Phase 9: Web Push FCM (`firebase` pkg + `registerWebPushToken`); Settings Security stripped to session-only; browser push enable in notification channels.
Phase 10: `vite build` GREEN; ROUTING_MAP + API_USAGE updated.
Tested: `vite build` OK.
Risks: FCM requires `VITE_FIREBASE_*` in `.env`; onboarding gate redirects all first-time users until tour completed/skipped.

---

## 2026-09-02 | Phase 1 — cancel voucher UI + daybook API
Files changed: `src/pages/shared.jsx`, `src/pages/masters.jsx`, `src/services/api.js`
Cancel voucher: footer button on `VoucherDrawer` → `POST /tally/voucher/cancel` (confirm dialog); optional `onVoucherChanged` callback.
Day Book: loads via `GET /api/daybook` with FY from/to + limit 500; row click opens full `VoucherDrawer`.
Login policy locked: OTP always; PIN step when account has 2FA from mobile; Settings Security will drop PIN/2FA controls (later phase).
Tested: `vite build` pending.

---

## 2026-09-02 | Create forms — numbering_policy from settings + inline Add Customer + legacy cleanup
Files changed: `src/components/create/common.jsx`, `voucherForms.jsx`, `accountingForms.jsx`, `masterForms.jsx`; deleted `src/pages/forms/*`, `CreateModal.jsx`, `LogisticsSection.jsx`
A: `useNumberingPolicy(companyGuid)` reads compliance config (mobile parity) — wired on payment/receipt/journal/contra/expense, credit/debit notes, delivery note, stock transfer/adjustment (was hardcoded `tally_prime_series`).
B: Sales invoice + proforma — inline **Add** customer opens embedded `PartyForm`; on save refreshes parties and selects new name.
C: Removed orphaned legacy create forms and `CreateModal` (active path is `CreateDrawer` + `src/components/create/*`).
Tested: `vite build` OK.
Risks: numbering loads async — first submit before config fetch may use default `tally_prime_series` until hook resolves (same race as before on SI only).

---

## 2026-09-02 | Create forms Phase 1–3 — mobile sales-invoice API parity
Files changed: `src/services/api.js`, `src/components/create/common.jsx`, `src/components/create/voucherForms.jsx`, `API_USAGE.md`, `CHANGELOG_AGENT.md`
Phase 1: `normalizeChargeLedgers` (logisticsCharges+additionalCharges / roundOffLedgers); SearchSelect accepts `ledgerName`; per-item godowns via `normalizeStockGodowns` (no global warehouse picker fallback); qty shown on godown options; warehouse required on submit.
Phase 2: `fetchComplianceConfig` + `fetchCompanyProfile` on commercial forms — EWB/e-invoice auto flags, `numbering_policy`, dispatch-from prefill; ship-to from party.
Phase 3: per-line taxes (mobile taxEntries + flattened taxes[]); barcode lookup on SI; Share PDF on success; purchase uses `type=vendor` parties; items limit 2000.
Tested: `vite build` OK. Manual: Create → Sales invoice → charges + warehouse + submit.

---

## 2026-09-02 | Settings flicker — useLabelT unstable ref + infinite load loops
Files changed: `src/components/kit.jsx`, `src/pages/Settings.jsx`, `src/pages/compliance.jsx`
Root cause: `useLabelT()` returned a new function every render. Settings `load` callbacks listed `lt` in deps → `useEffect([load])` re-ran every render → skeleton flicker and API spam (same class of bug as voucher drawer x600 loop).
Fix: memoize `useLabelT` with `useCallback([t])`; remove `lt` from Settings/compliance fetch effect deps (plain English error strings in loaders).
Tested: not pushed.

---

## 2026-09-02 | Voucher drawer — infinite API refetch loop (x600)
Files changed: `src/pages/shared.jsx`
Root cause: `load` useCallback depended on `lt` from `useLabelT()`, which returns a new function every render → effect `[voucherKey, load]` re-ran every render → hundreds of `GET /api/vouchers/:id` (proxy ECONNREFUSED spam in Vite logs).
Fix: stable `fetchDetail` with empty deps + refs for voucher/companyGuid; effect deps `[voucherKey, selectedCompany?.guid, fetchDetail]` only.
Note: `ECONNREFUSED 192.168.29.241:3001` means td-backend is not reachable at `VITE_API_URL` — start backend or fix `.env`; loop fix stops request storm when backend is down.
Tested: not pushed.

---

## 2026-09-02 | Voucher drawer — loading stuck, footer overflow, voucher id
Files changed: `src/pages/shared.jsx`, `src/components/kit.jsx`, `src/pages/sales.jsx`
Root cause: (1) effect double-bumped `detailReq` then `load()` bumped again — late `finally` skipped `setLoading(false)` while detail was already set; (2) `fetchVoucherDetail` used synthetic list `id` (`TD…-0`) instead of Tally `guid`; (3) footer row had 6+ buttons with no wrap — left buttons clipped; (4) TDK ref not resolved when only on `voucher_number`.
Fix: `resolveVoucherApiId` / `resolveTdkRef`; stable `load` via `voucherRef`; single seq increment; hide loading once detail exists; wrap footer buttons; Drawer footer `flex-wrap`; sales `normalizeRows` prefers `guid`.
Tested: not pushed.

---

## 2026-09-02 | Voucher drawer — fix sticky “Voucher not found” + stale Tally preview
Files changed: `src/pages/shared.jsx`
Root cause: one shared `error` state for detail + preview; late detail failure re-showed “Voucher not found” after preview succeeded; `previewHtml` not cleared on voucher switch (wrong invoice shown).
Fix: split detail/preview errors; reset preview on voucher change; dismiss detail error on successful preview; soft detail warning instead of blocking Empty; request-seq guards.
Tested: not pushed.

---

Files changed: `src/pages/shared.jsx`
Root cause: `GET /tally/invoice/:ref/preview` returns a VoucherDocument JSON snapshot (same as mobile). Web wrongly dumped it as `<pre>` JSON when no HTML field existed.
Fix: map preview snapshot → `buildInvoiceHTML` and show in an iframe (mobile-equivalent on-screen invoice).
Tested: not pushed.

---

Files changed: `src/services/api.js`, `src/pages/KpiPanel.jsx`, `API_DIFF_MOBILE_VS_WEB.md`
Behavior changed: Dashboard Payments/Receipts cards already called `GET /api/kpi/payments|receipts` via `fetchKpiDetail`. Added explicit `fetchKpiPayments` / `fetchKpiReceipts` and pass `period` like mobile. Corrected forensic note that wrongly listed these as missing.
Tested: not pushed.

---

## 2026-09-02 | Capabilities + IRN/EWB cancel + forensic mobile vs web API inventory
Files changed: `src/services/api.js`, `src/pages/Settings.jsx`, `src/pages/compliance.jsx`, `API_DIFF_MOBILE_VS_WEB.md`, `API_USAGE.md`, `CHANGELOG_AGENT.md`
Behavior changed:
1. **GET /api/company/capabilities** — Settings → Company shows capability flags.
2. **POST /api/einvoice/cancel** — E-Invoice drawer “Cancel IRN” when IRN present.
3. **POST /api/ewaybills/cancel** — E-Way Bill drawer “Cancel EWB” when EWB no. present.
4. Forensic report written to `API_DIFF_MOBILE_VS_WEB.md` (mobile api.ts vs portal paths).
Tested: `npm run build` green. Not pushed.

---

## 2026-09-02 | Mobile API gap list — wire missing endpoints + UI parity
Files changed: `src/services/api.js`, `src/contexts/AuthContext.jsx`, `src/pages/Settings.jsx`, `src/pages/sales.jsx`, `src/pages/purchase.jsx`, `src/pages/masters.jsx`, `src/pages/compliance.jsx`, `src/pages/financials.jsx`, `src/pages/inventory.jsx`, `src/pages/shared.jsx`, `src/components/create/voucherForms.jsx`, `src/layouts/ModuleLayout.jsx`, `src/App.jsx`, `API_USAGE.md`, `ROUTING_MAP.md`
Behavior changed — what was made:
1. **Logout** — `POST /api/auth/logout` from AuthContext (existing Settings/AppShell logout UI).
2. **Change phone / email** — Settings Profile OTP flow → `/api/auth/change-phone` + `/api/auth/change-email`.
3. **Help AI** — Settings Help → `POST /api/ai/help`.
4. **Bank create** — Settings Bank Feeds form → `POST /tally/master/bank`.
5. **Create CN/DN** — existing create drawers use credit/debit-note-context APIs.
6. **Sales register** — new `/sales/register` tab → vouchers + counts.
7. **Purchase register / KPIs** — `/api/purchase/vouchers` + counts.
8. **Expense counts** — expenses page stats from `/api/expenses/counts`.
9. **Financial overview** — new `/financials/overview` → `/api/reports/financial`.
10. **GST** — also loads `/api/reports/gst`; Unmatched uses `/api/reports/unmatched`.
11. **Compliance alerts** — new `/compliance/alerts` → `/api/alerts`.
12. **Stock movements + chart** — item panel + movement analytics chart API.
13. **Stock alter** — item panel Edit → `/tally/master/stock-item-alter`.
14. **Barcodes** — CSV template, bulk job start/status, label preview via by-guids.
15. **Tally invoice preview / share-pdf** — voucher drawer buttons when TDK ref present.
16. **Master preview** — audit trail master entries → `/tally/master/:queueId/preview`.
Skipped (unused on mobile / web N/A): company capabilities, einvoice/eway cancel, push-token UI (wrappers only).
Tested: `npm run build` green. Not pushed.

---

## 2026-09-02 | Mobile parity gaps — notifications, cashflow drawer, party vouchers, cash register tab
Files changed: `src/services/api.js`, `src/services/notifications.js`, `src/components/NotificationDrawer.jsx`, `src/components/CashflowReportDrawer.jsx`, `src/pages/Dashboard.jsx`, `src/pages/financials.jsx`, `src/layouts/AppShell.jsx`, `src/layouts/ModuleLayout.jsx`, `src/App.jsx`, `ROUTING_MAP.md`, `API_USAGE.md`
Behavior changed:
1. **Live notifications** — drawer uses `GET /api/notifications` + mark-read / mark-all-read (no mock `derived` list).
2. **Cashflow report drawer** — expand button on dashboard cashflow card opens side drawer with mobile cashflow-report fields (periods 7D/1M/3M, net cash, bars, trend, key metrics).
3. **Top customer → party vouchers** — clicking a top-customer row opens `PartyPanel` with that party's FY voucher list.
4. **Financials → Cash Register tab** — `/financials/cash-register` lists Payment/Receipt/Contra vouchers with inflow/outflow filters (mobile cash-register parity via `/api/vouchers`).
Tested: `npm run build` green. Not pushed.

---

## 2026-09-02 | Blank page — api.js TDZ crash on load
Files changed: `src/services/api.js`
Root cause: `export const getCashflow = fetchCashflow` ran **before** `fetchCashflow` was declared → `ReferenceError: Cannot access 'fetchCashflow' before initialization` → entire React app failed to mount (blank `#root`).
Fix: moved `getCashflow` alias to after `fetchCashflow` definition.
Tested: browser import + login page renders on :5175. Not pushed.

---

## 2026-09-01 | Dashboard — mobile API only (no duplicate web routes)
Files changed: `src/services/api.js`, `src/pages/Dashboard.jsx`, `AGENTS.md`, `API_USAGE.md`
Behavior changed:
- Dashboard core load uses **`loadMobileDashboard`** — same 4 GETs as mobile home: kpi-strip, metrics, cashflow, recent-activity (`period` + `from`/`to` only).
- Turnover chart uses **`series` from `/api/dashboard/metrics`** — not web-only `/api/dashboard/chart`.
- Top customers aggregates **`GET /api/sales/invoices`** (mobile sales pattern) — not `/api/dashboard/top-customers`.
- Cost analysis aggregates **`GET /api/expenses` categories** — not `/api/dashboard/cost-analysis`.
- Web-only dashboard routes marked `@deprecated` in `api.js`. AGENTS.md rule: mirror mobile APIs first.
Tested: `npm run build` green. Not pushed.

---

## 2026-09-01 | FY picker flicker — stop reload loop on FY change
Files changed: `src/contexts/AuthContext.jsx`, `src/pages/Dashboard.jsx`, `src/contexts/SalesContext.jsx`, `src/pages/financials.jsx`
Root cause: `applyCompanies` depended on `selectedFY` → changing FY recreated `loadCompanies` → background reload reset FY (future years blocked by `startDate > today` check) → screen flickered.
Fix: FY preserved via ref; removed future-FY override; `selectFY` skips duplicate picks; dashboard soft-refresh (no full skeleton on FY switch); SalesContext effect de-looped.
Tested: `npm run build` green. Not pushed.

---

## 2026-09-01 | Dashboard data missing — wrong company + stale FY (mobile parity)
Files changed: `src/services/api.js`, `src/contexts/AuthContext.jsx`, `src/pages/Dashboard.jsx`, `CHANGELOG_AGENT.md`
Root causes (confirmed):
1. **Wrong company on login** — web picked `companies[0]` (alphabetical); mobile uses `/api/tally-sync/status` company (`synced_at DESC`).
2. **Stale FY kept** — old localStorage FY was re-applied even when not in company years list.
3. **Silent API failures** — `.catch(() => zeros)` hid 401/500 errors as empty dashboard.
Fixes:
- `resolveActiveCompanyGuid()` + hydrate/login prefer active synced company.
- Login `forceDefaultFY: true`; invalid FY → `pickDefaultFY`.
- Dashboard uses `Promise.allSettled` + warning banner; dashboard GETs match mobile (period + from/to only).
Tested: `npm run build` green. Not pushed.

---

## 2026-09-01 | FORENSIC: Dashboard wrong after login — pickDefaultFY picked oldest FY
Files changed: `src/contexts/AuthContext.jsx`, `src/layouts/AppShell.jsx`, `CHANGELOG_AGENT.md`
Root cause:
- `pickDefaultFY()` used `[...years].reverse().find(startDate <= today)` → **oldest** FY (e.g. 2023-24).
- Mobile Header uses `company/years` row `[0]` (API `ORDER BY begin_date DESC`) → **newest** FY (e.g. 2025-26).
- After logout/login web queried dashboard for a 2–3 year old FY → sales/receivables/cashflow all wrong vs mobile.
Fix: `pickDefaultFY` = FY containing today, else `years[0]`. AppShell header fallback `years[0]` not `years[length-1]`.
Tested: node simulation confirms old=2023-24 vs mobile=2025-26; `npm run build` green.
Risks: users with stale `selectedFY` in localStorage (pre-fix session) may need one FY re-select or re-login. Not pushed.

---

## 2026-09-01 | Dashboard mobile parity — fy param + login hydration
Files changed: `src/services/api.js`, `src/pages/Dashboard.jsx`, `src/contexts/AuthContext.jsx`, `CHANGELOG_AGENT.md`, `API_USAGE.md`
Backend (td-backend): `src/routes/api-v1.js` — recent-activity accepts `fy`
Behavior changed:
- All dashboard GETs now send `fy` (from selected FY `finYear`) alongside period `from`/`to` — same as mobile FY resolution on backend.
- Dashboard waits for `authBootstrapping` to finish and `isPaired` before loading; reloads on `syncVersion` after Tally sync.
- Recent activity matches mobile: full FY window via `fy` only (no 1M clamp).
- After login, `applyCompanies` re-syncs `selectedFY` from fresh company years API (fixes stale/missing `finYear`).
Tested: `npm run build` green. **Restart td-backend** for recent-activity `fy` fix.
Risks: none. Not pushed.

---

## 2026-09-01 | Ledger + tax data fix — FY mismatch (backend + web)
Files changed: `src/services/api.js`, `src/pages/masters.jsx`, `src/pages/financials.jsx`, `CHANGELOG_AGENT.md`
Backend (td-backend): `src/routes/api-v1.js`
Behavior changed:
- **Root cause**: Ledger balances, P&L, and tax reports filtered `voucher_ledger_entries` by strict `financial_year` match. Tally sync often stores `2024-25` while API sent `2024-2026` → all movements/balances showed as zero.
- **Backend**: Ledger/pl-bs queries now sum movements by **voucher date range**; opening balances use fuzzy FY match (`2024-%`). Other-taxes auto-backfills on first read if empty. `resolveFYDates` resolves FY from `company_years` when from/to passed.
- **Web**: `companyFYParams()` sends `fy` + dates on all ledger/masters calls.
Tested: `npm run build` green. **Restart td-backend required.**
Risks: none. Not pushed.

---

## 2026-09-01 | API FY param fix + backend data parity (cross-repo)
Files changed: `src/services/api.js`, `src/pages/financials.jsx`, `src/pages/compliance.jsx`, `CHANGELOG_AGENT.md`
Backend (td-backend): `src/routes/api-v1.js`, `src/routes/ingest.js`
Behavior changed:
- **FY param**: `fyParamFromFY` now prefers `finYear` from company years API (was only deriving from `startDate`; stale localStorage could send wrong/missing `fy` → empty P&L, BS, other-taxes).
- Normalizes short labels (`2025-26` → `2025-2026`) on all report/compliance calls.
- **Backend**: `resolveFYDates` fuzzy-matches FY labels; other-taxes queries use safe `::date` casts; auto tax backfill on sync when `tax_transactions` is empty.
Tested: `npm run build` green (web). Restart td-backend after deploy.
Risks: none. Not pushed.

---

## 2026-09-01 | Compliance — remove duplicate Tax Register tab
Files changed: `src/App.jsx`, `src/layouts/ModuleLayout.jsx`, `src/pages/compliance.jsx`, `ROUTING_MAP.md`, `CHANGELOG_AGENT.md`
Behavior changed:
- Removed **Tax Register** tab (same content as **Other Taxes**).
- `/compliance/tax-register` redirects to `/compliance/other-taxes`.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Financials — restore module KPI strip
Files changed: `src/pages/financials.jsx`, `src/App.jsx`, `CHANGELOG_AGENT.md`
Behavior changed:
- Restored top **FinancialsKpis** StatGrid (Turnover, Gross profit, Total expenses, Net profit) above P&L / BS / TB tabs — from `GET /api/reports/pl-bs` via `fetchReportsPL`.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Other Taxes — fix transactions blocked by late-challans API error
Files changed: `src/pages/compliance.jsx`, `CHANGELOG_AGENT.md`
Behavior changed:
- Split transaction and late-challans fetches (mobile parity). A failing late-challans call no longer blocks the transaction table.
- Tax Register skips the late-challans call entirely.
- Note: backend `GET /api/reports/other-taxes/late-challans` has a SQL bug (`EXTRACT` on integer) — challans panel shows empty until backend is patched.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Compliance Other Taxes — mobile parity (9 tax tabs + APIs)
Files changed: `src/pages/compliance.jsx`, `src/services/api.js`, `API_USAGE.md`, `CHANGELOG_AGENT.md`
Behavior changed:
- **Other Taxes** now matches mobile: 9 tax-type tabs (TDS, TCS, VAT, Cess, Excise Duty, Service Tax, Import/Export Duty, WHT).
- Per-tab stats (total tax, vouchers, last transaction), Top 5 Late Challans, and transactions grouped by month with nature badges.
- **Tax Register** uses the same tax-type tabs and filters transactions via `taxType` query param.
- Added `fetchOtherTaxesSummary`, `fetchOtherTaxesTransactions`, `fetchOtherTaxesLateChallans` in `api.js` (same GET endpoints as mobile V4).
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Financials P&L — Opening/Closing Stock (mobile card grid)
Files changed: `src/pages/financials.jsx`, `src/services/api.js`, `CHANGELOG_AGENT.md`
Behavior changed:
- **P&L** now uses the same 2-column card grid as mobile: Opening Stock | Closing Stock, Purchase | Sales, Direct/Indirect expense & income, Gross Profit/Loss, Net Profit/Loss — from `pl.openingStock`, `pl.closingStock`, etc. on `GET /api/reports/pl-bs`.
- **Balance Sheet** aligned to mobile: Liability (Opening + Current) / Assets tabs.
- **Trial Balance** aligned to mobile: group-level Dr/Cr rows + Grand Total.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Financials reports — mobile layout, no KPI cards
Files changed: `src/App.jsx`, `src/pages/financials.jsx`, `CHANGELOG_AGENT.md`
Behavior changed:
- Removed module-level and per-tab StatGrid KPI cards from Financials.
- **P&L**: single report table (Income → Gross Profit → Expenses → Net Profit) using `closing_balance` from `GET /api/reports/pl-bs`.
- **Balance Sheet**: Assets / Liabilities columns with line totals (same API).
- **Trial Balance**: mobile columns (Opening Dr/Cr, Period Dr/Cr, Closing Dr/Cr).
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Financials — mobile parity: P&L, BS, TB only
Files changed: `src/layouts/ModuleLayout.jsx`, `src/App.jsx`, `src/pages/financials.jsx`, `src/layouts/AppShell.jsx`, `src/services/derived.js`, `ROUTING_MAP.md`
Behavior changed:
- **Financials** now has 3 tabs only (same as mobile): **Profit & Loss**, **Balance Sheet**, **Trial Balance** — all from `GET /api/reports/pl-bs`.
- Removed from Financials: Cash & Bank, Receivables & Payables, Loans & ODs, Cash Flow — these stay on **Dashboard KPI cards** → side drawer (`/kpi/*`).
- Module KPI strip uses P&L summary only (turnover, gross profit, expenses, net profit) — no bank/cash duplication.
- Legacy `/financials/cash-bank`, `/receivables-payables`, `/loans-ods`, `/cashflow` redirect to dashboard KPI routes.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Audit Trail — sidebar module with My Entries + Day Book tabs
Files changed: `src/App.jsx`, `src/layouts/ModuleLayout.jsx`, `src/layouts/AppShell.jsx`, `src/pages/masters.jsx`, `src/pages/Dashboard.jsx`, `src/services/derived.js`, `src/i18n/locales/en.json`, `ROUTING_MAP.md`
Behavior changed:
- Removed **Day Book** and **Audit Trail** from Compliance tabs.
- Added **Audit Trail** to sidebar (Books section) at `/audit-trail` with two tabs: **My Entries** (default) and **Day Book**.
- KPI StatGrids unchanged — My Entries uses `GET /api/vouchers/my-entries`; Day Book uses `GET /api/vouchers` for FY entries.
- Legacy URLs `/compliance/daybook`, `/compliance/audit-trail`, `/daybook` redirect to new routes.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Full mobile GET parity — ledgers, parties, stock, vouchers, purchase, GST
Files changed: `src/services/api.js`, `src/pages/purchase.jsx`, `src/pages/compliance.jsx`, `API_USAGE.md`
Behavior changed:
- **Why no duplicate APIs:** Web portal had leftover `POST /app/*` reads from pre-mobile era. Mobile V4 already exposes the same data on `GET /api/*` — portal now uses those routes for all live reads (one backend contract, all modules).
- Migrated: `fetchLedgers`, `fetchLedgerDetails`, `fetchLedgerVouchers`, `fetchParties`, `fetchStocks`, `fetchStockDetails`, `fetchStockFilters`, `fetchVouchers`, `fetchDaybook`, `fetchPurchaseInvoices`, `fetchGSTSummary`, `fetchVoucherDetail`.
- Purchase module KPIs/invoices/register use `GET /api/purchase/invoices` instead of generic voucher POST.
- GST Summary StatGrid maps mobile fields (`gstCollected`, `itcBalance`, `netPayable`).
- `fetchStockSummary` stays on `POST /app/stock-dashboard` — same endpoint mobile uses.
- Legacy POST kept only as internal fallback for `fetchVouchers` if GET fails; Tally writes unchanged on `/tally/*`.
Tested: `npm run build` green.
Risks: orphan legacy pages (`Ledgers.jsx`, `PurchaseModule.jsx`, etc.) still exist but are not routed. Not pushed.

---

## 2026-09-01 | AI Insights — full 3.0 UI + mobile GET APIs
Files changed: `src/services/api.js`, `src/pages/masters.jsx`, `API_USAGE.md`
Behavior changed:
- `/ai-insights` loads full payload from `GET /api/ai/insights` (current FY) or `GET /api/ai/insights/history/:fy` (closed FY) — same as mobile.
- 3.0 layout: StatGrid KPIs, revenue forecast + expense spike charts, cash flow summary, receivables donut, stock-out list, top customers/suppliers tables, AI recommendations grid.
- Refreshes on Tally sync (`syncVersion`); shows cache generated / next refresh dates when available.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Expenses + Financials — 3.0 UI + mobile GET APIs
Files changed: `src/services/api.js`, `src/pages/masters.jsx`, `src/pages/financials.jsx`, `API_USAGE.md`
Behavior changed:
- **Expenses** (`/expenses`): uses `GET /api/expenses` (same as mobile) with Direct/Indirect filter, category breakdown, 3.0 kit layout (StatGrid, Tabs, DataTable, RecordDrawer). Fixed empty list bug (`unwrapList` could not read legacy POST shape).
- **Financials** tabs wired to mobile GETs: `GET /api/kpi/bank-balance` + `cash-in-hand`, `GET /api/kpi/receivables` + `payables`, `GET /api/reports/pl-bs` for P&L / BS / TB, `GET /api/kpi/loans-ods`.
- Fixed missing `VoucherDrawer` / `PartyPanel` / `LedgerPanel` imports on financials sub-pages.
Tested: `npm run build` green.
Risks: none. Not pushed.

---

## 2026-09-01 | Companies/years same APIs as mobile; unpair clears state
Files changed: `src/services/api.js`, `src/contexts/AuthContext.jsx`, `API_USAGE.md`
Behavior changed:
- Company list uses `GET /api/companies` (not `/app/companies`); FY years via separate `GET /api/company/years?companyGuid=…` — same as mobile Header.
- `fetchCompaniesHydrated` maps `id → guid` and loads years for the active company.
- Unpair (web UI, WS event, or status poll when `is_paired=false`) clears companies, selected company, and FY immediately.
- Company switch lazy-loads years for that company if not cached.
Tested: pending browser pass.
Risks: none. Not pushed.

---

## 2026-09-01 | Smooth post-OTP login → dashboard
Files changed: `src/contexts/AuthContext.jsx`, `src/pages/auth/Login.jsx`, `src/services/api.js`, `src/App.jsx`
Behavior changed:
- After OTP verify, session is fully hydrated (**me + /app/companies with guid + FY years**) before the app shell renders — fixes blank/broken dashboard ("Select a company").
- Auto-submit OTP when 4 digits entered (same as mobile).
- "Signing you in…" overlay during bootstrap; Protected route shows loader if token exists but hydrate still running.
- Stopped using `/api/companies` (id-only) for login bootstrap — uses `/app/companies` like the rest of the portal.
Tested: pending browser pass after Vite restart.
Risks: none. Not pushed.

---

## 2026-09-01 | Remove demo OTP panel; proxy /api/auth in dev
Files changed: `src/services/config.js`, `src/services/api.js`, `vite.config.js`, `src/pages/auth/Login.jsx`, `src/contexts/AuthContext.jsx`
Behavior changed:
- Removed the on-screen **Development OTP / Fill for me** panel — OTP now comes only via WhatsApp (same as mobile).
- Dev server proxies `/api`, `/app`, `/tally` to `VITE_API_URL` host so browser calls `POST /api/auth/send-otp` (not legacy `/app/send-otp` and not a hardcoded LAN IP that may be unreachable).
- Auth bootstrap uses `fetchMe()` / `apiGet('/api/companies')` through the same proxy path.
Tested: restart Vite after this change; Network tab should show `POST /api/auth/send-otp` on the portal origin.
Risks: Vite must be restarted to pick up proxy config. Not pushed.

---

## 2026-09-01 | Login matches mobile `/api/auth/*`
Files changed: `src/services/api.js`, `src/pages/auth/Login.jsx`, `src/pages/auth/OTPScreen.jsx`, `src/components/PinModal.jsx`, `src/App.jsx`, `API_USAGE.md`, `ROUTING_MAP.md`
Behavior changed:
- Sign-in uses the same APIs as the mobile app: `POST /api/auth/send-otp` with `{ phone: "+91…" }`, verify-otp, verify-pin / reset-pin with pre-auth Bearer, `POST /api/auth/register` for new users.
- Country picker (same list as mobile), 4-digit OTP/PIN, required name + email + terms on register.
- New users land on **Settings → Tally Sync** after register (same as mobile tally-sync), not the dashboard.
- `GET /api/auth/me` and 2FA set/remove/status also go through `/api/auth/*`.
Tested: `POST /api/auth/send-otp` with `{ phone: "+919078802278" }` returns success + dev OTP; Vite `/login` 200. Browser MCP was unavailable this pass — please click through Sign in locally.
Risks: existing sessions still work; first login after this change must use a real WhatsApp OTP (or the `9078802278` / `1234` bypass). Not pushed.

---

## 2026-09-01 | 0% trend pill is grey + black
Files changed: `src/pages/Dashboard.jsx`, `src/components/kit.jsx`
Behavior changed:
- A real **0%** trend (flat vs prior) is no longer green or red. Grey (`bg-paper-2`) pill, black (`text-ink`) **0%**, no arrow — same on dashboard KPIs, sales/purchase/expense tiles, and Stat drill cards.
- Missing prior window is still an em dash.
Tested: hard-refresh dashboard; Loans & ODs 0% should be grey.
Risks: none. Not pushed.

---

## 2026-09-01 | Purchase KPI 0% was a fake prior-window compare
Files changed: `src/pages/Dashboard.jsx`
Behavior changed:
- Purchase card amount was not ₹0 for 1M (~₹4 Cr of August bills). The **0%** pill was because the previous equal-length window (early Jul–early Aug) had **no purchase vouchers**, so % vs prior is undefined. Sales still had July invoices, so that pill looked real.
- Dummy `change: 0` is no longer shown as 0%. No prior window → em dash, same as the other KPI chips.
Tested: DB check for company 1M window. Hard-refresh dashboard.
Risks: a true flat period (same total as prior) still shows +0%. Not pushed.

---

## 2026-09-01 | Sales / purchase / expense trend pills
Files changed: `src/pages/Dashboard.jsx`, `API_USAGE.md`
Behavior changed:
- Dashboard Sales, Purchases, Expenses cards show the same green/red trend pill as mobile (arrow + %).
- % is current period vs the previous equal-length window from `GET /api/dashboard/metrics` (`trend_pct`). For 1 Month that is last month’s total, not an average. Expenses invert color (up is red).
- Pill hidden when the API has no prior window (`trend_pct` null).
Tested: `node --check` on backend metrics; hard-refresh dashboard after backend restart.
Risks: backend must be restarted so metrics stops sending hardcoded `change: 0`. Not pushed.

---

## 2026-09-01 | Remove fake Tally Sync controls from web
Files changed: `src/pages/settings.jsx`
Behavior changed:
- Web and mobile do not have auto-sync interval, master selection, or write-back toggles — those exist only on the desktop agent.
- Removed the Settings → Tally Sync “Sync controls / Not yet available on web” placeholder so the portal no longer pretends those controls exist here.
Tested: page now shows pair / unpair / status only. Hard-refresh Settings → Tally Sync.
Risks: any e2e that clicked `toggle-autosync` / `sync-interval` will miss those nodes. Not pushed.

---

## 2026-09-01 | Always-visible Unpair Tally
Files changed: `src/pages/settings.jsx`, `src/layouts/AppShell.jsx`, `src/contexts/AuthContext.jsx`
Behavior changed:
- Unpair was hidden unless the UI already thought you were paired, so it never appeared.
- Tally Sync now always shows a red **Unpair** in the section header and **Unpair Tally** in the card. Sidebar account menu has **Unpair Tally**. Both call `POST /api/tally-sync/unpair`.
Tested: `npm run build`. Hard-refresh Settings → Tally Sync and the sidebar user menu.
Risks: Unpair is user-level. Not pushed.

---

## 2026-09-01 | Live Tally pairing status (mobile /api/tally-sync)
Files changed: `src/services/api.js`, `src/contexts/AuthContext.jsx`, `src/pages/settings.jsx`, `src/pages/auth/TallySync.jsx`, `src/layouts/AppShell.jsx`, `API_USAGE.md`
Behavior changed:
- Pairing is the real backend flow (desktop agent code → `devices.paired`). The 3.0 Settings screen was calling legacy `/app/pairing-device` and looking for `data.isPaired`, so a completed pair (mobile/desktop) showed as Not paired.
- Status, pair, and unpair now use the same endpoints as mobile: `GET /api/tally-sync/status`, `POST /api/tally-sync/pair` `{ pairing_code }`, `POST /api/tally-sync/unpair`.
- AuthContext polls status every 10s and on token mount so `isPaired` matches the server, not leftover localStorage. Dashboard Connect strip and sidebar “Tally connected” follow that flag. Desktop online uses `desktop_online` (last_seen < 5 min).
Tested: `npm run build`. Hard-refresh after login; open Settings → Tally Sync.
Risks: unpair is user-level (same as mobile). Not pushed.

---

## 2026-08-31 | Fix blank app: restore fetchRecentActivity
Files changed: `src/services/api.js`
Behavior changed:
- Default export listed `fetchRecentActivity` after the function was dropped. Module threw `ReferenceError` on load, `#root` never mounted, every route was blank.
- Function restored (`GET /api/dashboard/recent-activity`).
Tested: browser import of App.jsx after fix.
Risks: none. Hard-refresh. Not pushed.

---

## 2026-08-31 | Fix blank dashboard (duplicate topCustomers + failed HMR)
Files changed: `src/pages/Dashboard.jsx`
Behavior changed:
- Removed the leftover `const topCustomers = []` that crashed Vite (`Identifier already been declared`) and blanked the page.
- Metrics fetch is soft-failed like the other home GETs so one 500 cannot take down the whole dashboard.
Tested: `npm run build`. Hard-refresh required (HMR was stuck on the parse error).
Risks: none. Not pushed.

---

## 2026-08-31 | Dashboard graph uses GET /api/dashboard/chart
Files changed: `src/services/api.js`, `src/pages/Dashboard.jsx`, `src/pages/financials.jsx`, `API_USAGE.md`
Behavior changed:
- Turnover overview chart (and trio sparklines) load from `GET /api/dashboard/chart` with the same `period`/`from`/`to` as the rest of home.
- Financials monthly sales vs purchase uses the same chart GET for the selected FY (monthly buckets).
Tested: `npm run build`. Hard-refresh dashboard after backend restart.
Risks: empty window still shows Empty. Not pushed.

---

## 2026-08-31 | Top customers + cost analysis live dashboard GETs
Files changed: `src/services/api.js`, `src/pages/Dashboard.jsx`, `API_USAGE.md`
Behavior changed:
- Top customers comes from `GET /api/dashboard/top-customers` (sales by party for the selected 7D/1M/3M/6M window).
- Cost analysis comes from `GET /api/dashboard/cost-analysis` (Direct + Indirect expense ledger heads for that window). Dashboard no longer calls `POST /app/reports/pl`.
Tested: `npm run build`. Hard-refresh dashboard after backend restart.
Risks: empty parties/ledgers still show Empty. P&L report page is unchanged. Not pushed.

---

## 2026-08-31 | Dashboard uses mobile GETs + real chart series
Files changed: `src/services/api.js`, `src/pages/Dashboard.jsx`, `src/pages/financials.jsx`, `API_USAGE.md`
Behavior changed:
- Dashboard no longer calls `POST /app/dashboard` or buckets vouchers into charts. It uses the same GETs as mobile home: metrics, kpi-strip, cashflow, recent-activity — same `period` + `from`/`to`.
- Turnover chart and trio tiles come from `GET /api/dashboard/metrics` (`data` tiles + sibling `series`). Expenses are a real series, not Sales × payments/sales.
- KPI strip amounts and trends come from `GET /api/dashboard/kpi-strip`. Recent activity from `GET /api/dashboard/recent-activity`.
- Financials → Cash Flow plots `data.series` from cashflow (daily / weekly / monthly).
- Top customers stays empty until a mobile API exists. Cost analysis still uses P&L (no mobile home equivalent).
Tested: `npm run build`. Hard-refresh dashboard + `/financials/cashflow` after backend restart.
Risks: backend must be the updated `cursor` branch so series is present. Not pushed.

---

## 2026-08-31 | Cashflow numbers match mobile (live /api/dashboard/cashflow)
Files changed: `src/services/api.js`, `src/utils/periodDates.js`, `src/pages/Dashboard.jsx`, `src/pages/financials.jsx`, `API_USAGE.md`
Behavior changed:
- Dashboard Cashflow card no longer scales receipts/payments off turnover. It calls the same `GET /api/dashboard/cashflow` as mobile, with the same 7D/1M/3M/6M date window.
- Net Cash / Income / Expense / Gross & Net Profit / Healthy% come from that payload (`net_cash`, `total_income`, `total_expense`, profits, `income_percentage`).
- Financials → Cash Flow uses the same helper and mapping (no extra `fy` query). Chart falls back to the period totals because the API has no daily series.
Tested: `npm run build`. Hard-refresh dashboard + `/financials/cashflow` with the same FY and 1M as mobile.
Risks: none. Not pushed.

---

## 2026-08-31 | Re-import Web Portal 3.0 UI as-is + live APIs
Files changed: 3.0 pages/layouts/kit/create/i18n/`index.css`/`tailwind.config.js` copied as-is; `App.jsx`, `main.jsx`, `vite.config.js`, `api.js`, `config.js`, `SettingsContext.jsx` wired for Vite + live backend; `ROUTING_MAP.md`
Behavior changed:
- UI chrome is the 3.0 source (cream sidebar `bg-paper-2` / `lg:bg-surface/50`, paper drawers, Plus Jakarta + JetBrains Mono). No color/font improvisation.
- All 3.0 module routes (sales, purchase, vouchers, inventory, financials, compliance, masters, settings) are mounted.
- Data still goes through `src/services/api.js` to the existing TallyDekho backend (`VITE_API_URL`). Mock mode is off.
- Login is the 3.0 in-page OTP flow at `/login` (`/auth/login` redirects). Pairing lives at `/settings/tally-sync`.
Tested: `npm run build` PASS. Not pushed.
Risks: Tailwind CSS-var colors may not emit `/20` `/50` opacity utilities (same as 3.0 config). `/api/sales/tab-metrics` still falls back to home-metrics. Notification drawer still uses 3.0 sample items. Hard-refresh after pull. Not pushed.

---

## 2026-08-31 | Match mobile app COLORS for canvas, nav, drawer
Files changed: `index.css`, `tailwind.config.js`, `AppShell.jsx`, `kit.jsx`, `FormModal.jsx`
Behavior changed:
- Page canvas stays mobile `pageBg` `#F5F4EF`; cards stay `cardBg` white
- Sidebar matches mobile tab bar: `navBg` `#1A1A1A`, active `#333333`, labels `#F5F4EF` / `#9A9A97`
- Create drawer matches mobile sheets: white `cardBg`, overlay `rgba(0,0,0,0.4)`
Tested: pending hard refresh
Risks: dark sidebar is a visible change from Web Portal 3.0 light rail. Not pushed.

---

## 2026-08-31 | Restore 3.0 sidebar/canvas fills
Files changed: `AppShell.jsx`
Behavior changed:
- Desktop sidebar is `lg:bg-surface/50` again (frosted white on `#F5F4EF`, same as 3.0)
- Main column no longer paints a second paper card — canvas is one `#F5F4EF` field like 3.0
Tested: pending hard refresh
Risks: none. Not pushed.

---

## 2026-08-31 | Opaque create drawer + sidebar (fix CSS-var opacity)
Files changed: `tailwind.config.js`, `kit.jsx`, `AppShell.jsx`, `FormModal.jsx`
Behavior changed:
- Tailwind paper/surface/ink now use `rgb(... / <alpha-value>)` so `bg-ink/20` overlay actually dims
- Create drawer panel is solid paper `#F5F4EF`, header/footer solid white
- Sidebar desktop uses solid `bg-surface` instead of `bg-surface/50` (was invisible or glass)
Tested: `npm run build` PASS — `.bg-ink/20` now `#1a1a1a33`, `.bg-paper` and `.lg:bg-surface` are opaque RGB
Risks: none. Not pushed.

---

## 2026-08-31 | Bundle 3.0 fonts + CSS-variable Tailwind colors
Files changed: `index.css`, `tailwind.config.js`, `package.json`
Behavior changed:
- Plus Jakarta Sans and JetBrains Mono now load from `@fontsource` (same as 3.0), not Google Fonts
- Tailwind `paper` / `surface` / `ink` / `line` / `pos` read `var(--paper)` etc. — one source of truth with 3.0
Tested: `npm run build` PASS — Plus Jakarta / JetBrains font files emitted into `dist/assets/`
Risks: leftover auth/legacy pages still hardcode the same hex values. Not pushed.

---

## 2026-08-31 | Match 3.0 theme, drawer, and KPI strip
Files changed: `index.css`, `tailwind.config.js`, `kit.jsx`, `Dashboard.jsx`, `sales.jsx`, `KPICard.jsx`, `FormField.jsx`, `FormModal.jsx`, `SummaryFooter.jsx`, `LiveSearch.jsx`, `ItemsTable.jsx`, `LogisticsSection.jsx`, `VoucherDetail.jsx`
Behavior changed:
- Tokens, type (15px body), radius (6/10/14), shadows, scrollbar, and gold selection match Web Portal 3.0
- KPI strip is a single cream-gap card with left accent bars (no white-on-white Card conflict)
- Create/side drawer uses paper canvas, cream line tiles, surface inputs, ink total bar
Tested: `npm run build` PASS
Risks: leftover pages still use some hardcoded hex; visual only, no API change. Not pushed.

---

## 2026-08-31 | Import 3.0 theme, sidebar, dashboard, sales, create drawer (local, not pushed)
Files changed: `index.css`, `tailwind.config.js`, `App.jsx`, `AppShell.jsx`, `api.js`, `src/components/kit.jsx`, `src/components/create/CreateDrawer.jsx`, `src/pages/Dashboard.jsx`, `src/pages/sales.jsx`, `src/pages/shared.jsx`, `src/pages/KpiPanel.jsx`, `src/layouts/ModuleLayout.jsx`, `src/contexts/SalesContext.jsx`
Behavior changed:
- Theme: Plus Jakarta Sans + paper/ink tokens from Tallydekho-Web-Portal-3.0
- Sidebar: 3.0 floating tree nav; auth/FY/company/logout unchanged (`/auth/login`)
- Create: drawer chrome wrapping existing live voucher forms
- Dashboard: 3.0 layout on live `POST /dashboard` + `GET /api/dashboard/kpi-strip` + FY dates
- Sales: tabbed module + This-FY date range; invoices via `GET /api/sales/invoices`; KPI strip falls back to `GET /api/sales/home-metrics`
Tested: `npm run build` PASS
Risks: Sales tab-metrics endpoint does not exist yet (fallback used). E-Invoice tab still stub. Quotation create still stub. Not pushed.

---

## 2026-08-10 | Sales invoice ledgers + warehouse qty
Files changed: `SalesInvoiceForm.jsx`, `ItemsTable.jsx`, `api.js`
Behavior changed:
- Party search uses `GET /api/parties` (same as mobile, up to 500) instead of thin POST `/app/parties`
- Sales ledger uses `GET /api/sales/ledger-accounts` (full Sales Accounts list)
- Per-item warehouse loads `GET /api/stocks/items/:id/godowns` and shows qty labels (e.g. Sitapura (12 Pcs))
Tested: build
Risks: godowns with zero qty are hidden by backend (qty>0 filter) — empty warehouse list if item has no godown stock

---

## 2026-08-10 | Payment/Receipt ledger search blank
Files changed: `VoucherForm.jsx`, `api.js` (`fetchBankLedgers`)
Behavior changed: Payment/Receipt LiveSearch had no `fetchFn` (Journal/Contra did) — wired party search + `GET /api/bank-ledgers` (same as mobile)
Tested: build
Risks: none

---

## 2026-08-10 | QA: sales totalAmount excludes UI tax when taxes:[]
Files changed: `SalesInvoiceForm.jsx`
Behavior changed: With `taxes: []`, `totalAmount` is now `subtotal + logistics` (not UI taxAmt) so party Dr matches inventory/sales lines
Tested: build (Testing Agent)
Risks: Summary footer still shows estimated tax for UX; Tally voucher posts without GST ledgers until tax picker exists

---

## 2026-08-10 | Fix portal sales → Tally failures (portal only — no backend)
Files changed: `SalesInvoiceForm.jsx` (+ other forms date ISO)
Behavior changed:
- Portal sales sent `-totalAmount` (party Cr instead of Dr), fake `CGST`/`SGST` ledgers, and `YYYYMMDD` dates → Tally rejected
- Sales payload now matches mobile: positive total, `voucherType: Sales`, ISO date, no invented tax ledgers; per-item warehouse required
- QA fix: with `taxes: []`, `totalAmount` = subtotal + logistics only (don’t include UI-estimated tax in party amount)
- Backend left unchanged (mobile already worked)
Tested: write_queue forensics 244/246/247; build; QA YELLOW
Risks: Portal sales still omit GST tax lines until real tax-ledger picker is added

---

## 2026-08-10 | Remove remaining mock data
Files changed: deleted `src/data/{mockData,salesMock,purchaseMock,inventoryMock,paymentsMock,expensesMock}.js`; `ItemsTable.jsx`, `SalesInvoiceForm.jsx`, `InvoicePDF.jsx`, `QuotationForm.jsx`, `Settings.jsx`, `KNOWN_ISSUES.md`, `FRONTEND_MAP.md`
Behavior changed:
- Deleted unused mock datasets
- Warehouse dropdown loads live godowns via `fetchWarehouses` (empty if none — no Main Warehouse / Godown 1/2)
- Sales invoice no longer defaults godown to "Main Location"
- Invoice PDF requires a real invoice (no Polymer sample fallback)
- Quotation form is a not-available stub (no fake customers / QT numbers)
- Settings PDF template preview uses anonymous placeholder labels only
Tested: `npm run build` PASS
Risks: forms with no warehouses synced will show empty warehouse select until godowns exist in Tally

---

## 2026-08-10 | Mobile data parity — Phases 1–3
Files changed:
- Phase 1: `src/services/api.js`, `src/pages/sales/SalesModule.jsx`, `src/pages/purchase/PurchaseModule.jsx`, `src/pages/compliance/AuditTrail.jsx`, `src/layouts/AppShell.jsx`
- Phase 2: `src/pages/payments/PaymentsModule.jsx`, `src/pages/Parties.jsx`, `src/pages/inventory/InventoryModule.jsx`, `src/components/CreateModal.jsx`, `src/pages/forms/VoucherForm.jsx`, `src/App.jsx`, `ROUTING_MAP.md`
- Phase 3: `src/pages/financials/Reports.jsx`, `src/pages/financials/LoansODs.jsx`, `src/pages/compliance/EWayBill.jsx`, `src/pages/compliance/EInvoice.jsx`, `src/pages/compliance/OtherTaxes.jsx`, `src/pages/Notifications.jsx`, `CHANGELOG_AGENT.md`
Behavior changed:
- Registers: Sales/Purchase tabs load orders, credit/debit/delivery notes via `/api/*` with vouchers fallback; Day Book nav label; My Entries prefers `/api/vouchers/my-entries`
- Fixed broken `/app/api/*` paths (user-settings, company logo/profile, ledger FY/statement) to `API_ROOT/api/*`
- Payments page adds Journal + Contra; new Parties page; Inventory Warehouses tab; Journal/Contra create opens correct voucher type; Create Quotation removed from menu
- Trial Balance calls `fetchReportsTB`; E-Way/E-Invoice/Other Taxes/Notifications/Loans show “coming soon” with empty KPIs (no fake live numbers)
Tested: `npm run build` (see session notes)
Risks: Register GET `/api/sales/*` etc. may 404 on older backends — vouchers fallback covers that; TB response shape may vary by backend

---

## 2026-06-02 | Blueprint System Created
Files changed: AGENTS.md, BLUEPRINT.md, FRONTEND_MAP.md, ROUTING_MAP.md, API_USAGE.md, STATE_MANAGEMENT.md, TASK_ROUTING.md, KNOWN_ISSUES.md, CHANGELOG_AGENT.md, .agentignore
Behavior changed: None (docs only)
Tested: N/A
Risks: None

---

## 2026-04-28 | All Create/Entry Forms Wired to Live API
Files changed: All form files in src/pages/forms/
Behavior changed: All forms (DebitNote, DeliveryNote, SalesOrders, PurchaseOrders, Quotation) now POST to real backend
Tested: Manual
Risks: None

---

## 2026-04-28 | Reports Wired to Live API
Files changed: financials/Reports.jsx, compliance/*.jsx, AIInsights.jsx, Notifications.jsx
Behavior changed: All report pages now call live /app/* endpoints
Tested: Manual
Risks: None

---

## 2026-04-27 | Company Switcher + FY Switcher
Files changed: src/layouts/AppShell.jsx (header), src/contexts/AuthContext.jsx
Behavior changed: Users can switch company + FY from header; all API calls updated with selection
Tested: Manual
Risks: None

---

_Add new entries at top._
