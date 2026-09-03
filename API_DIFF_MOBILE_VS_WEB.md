# Forensic API inventory — Mobile app vs Web portal

**Date:** 2026-09-02  
**Sources (read-only for mobile):**
- App: `tallydekho-mobile-V4/frontend/src/services/api.ts` (+ screen call sites)
- Portal: `td-web-portal/src/services/api.js` (+ page-level `/api|/tally|/app` strings)

**Method:** Extract endpoint path strings, normalize dynamic segments to `:id`, prefix mobile relative paths with `/api` or `/tally` the same way runtime does. Then manually verify “only” rows against wrappers (template-literal paths often hide as false diffs).

---

## Summary

| | Approx. unique backend paths |
|---|---:|
| Shared (same route family on both) | ~125+ |
| True mobile-only (or web missing wrapper) | **few** — see below |
| True web-only (portal extras / deprecated) | **~6** — see below |

After the gap-wiring work (including capabilities + IRN/EWB cancel), **core mobile `/api/*` + `/tally/*` surfaces are aligned**. Remaining differences are mostly:
1. Alternate report/KPI shapes mobile still exposes
2. Web-deprecated dashboard aggregations
3. Path base differences that are the **same API** (`/companies/:id/print-profile` vs mobile print helpers)

---

## Previously skipped — now implemented on web

| API | Web UI |
|---|---|
| `GET /api/company/capabilities` | Settings → Company |
| `POST /api/einvoice/cancel` | Compliance / Sales E-Invoice drawer → Cancel IRN |
| `POST /api/ewaybills/cancel` | Compliance E-Way Bill drawer → Cancel EWB |

---

## Shared (both use — high-signal families)

### Auth / session
- `POST /api/auth/send-otp`, `verify-otp`, `register`, `verify-pin`, `set-pin`, `reset-pin`, `remove-pin`
- `GET /api/auth/me`, `PATCH /api/auth/me`
- `GET /api/auth/two-fa-status`, `PATCH /api/auth/set-biometric`
- `GET|PATCH /api/auth/user-settings`
- `POST /api/auth/logout`, `change-phone`, `change-email`
- `POST|DELETE /api/push-token` (web wrappers; UI N/A)

### Company / pairing
- `GET /api/companies`, `GET /api/company/years`, `GET|PATCH /api/company/profile`
- `GET|POST /api/company/:id/compliance-config`, `GET|POST /api/company/:id/logo`
- `GET /api/company/capabilities`
- `GET /api/tally-sync/status`, `POST pair`, `POST unpair`

### Dashboard / search / notifications
- `GET /api/dashboard/kpi-strip`, `metrics`, `cashflow`, `recent-activity`, `search`
- `GET /api/notifications`, `PATCH …/:id/read`, `PATCH …/read-all`

### Sales / purchase registers
- `GET /api/sales/invoices|orders|credit-notes|delivery-notes|ewaybills|home-metrics|vouchers|vouchers/counts`
- `GET /api/sales/invoices/:id/credit-note-context`
- `GET /api/purchase/invoices|orders|debit-notes|vouchers|vouchers/counts|ledger-accounts`
- `GET /api/purchase/invoices/:id/debit-note-context`

### Compliance
- `GET /api/einvoice/status|pending|generated`, `POST generate|cancel`
- `GET /api/ewaybills`, `…/status|pending`, `POST generate|cancel`
- `GET /api/alerts`, `GET /api/reports/gst|gst-summary|gst-detail|unmatched`
- `GET /api/reports/other-taxes/*`

### Financials / expenses / KPIs
- `GET /api/reports/financial`, `pl-bs`
- `GET /api/expenses`, `expenses/counts`
- `GET /api/kpi/cash-in-hand`, `bank-balance`, `receivables`, `payables`, `loans-ods`
- `GET /api/daybook`, `GET /api/vouchers`, `my-entries` (+ retry)

### Inventory / barcodes / stocks
- `GET /api/stocks/items`, `items/:id`, `godowns`, `movements`, `warehouses`, groups/units/filters
- Movement analytics + chart, aged/fast-slow/negative/expiry/snapshot/transfer-history/ledger
- Full barcode suite: lookup/list/generate/bulk/link/import/settings/template/by-guids/job start|status|active

### AI / help / reminders
- `GET /api/ai/insights`, `…/history/:fy`
- `POST /api/ai/help`
- `POST /api/reminders/send`

### Tally write (same `/tally/*` family)
- Voucher: sales, sales-order, purchase, purchase-order, payment, receipt, journal, contra, credit-note, debit-note, delivery-note, proforma (+ convert), stock-transfer, stock-adjustment, cancel
- Master: party, warehouse, stock-item, stock-item-alter, bank
- Audit: `/tally/audit-trail`, retry
- Invoice preview / share-pdf, master preview (web wired; mobile may use subset)

---

## True / meaningful differences

### A. Mobile has — web missing or not wired as first-class

| Path | Notes |
|---|---|
| `GET /api/reports/financial-report` | Mobile `getFinancialReport`. Web uses `financial` + `pl-bs` instead. |
| `GET /app/stock-dashboard` | Mobile `getStockDashboard`. Web still has `fetchStockSummary` → `/app/stock-dashboard` (legacy POST via `/app`). |

**Not a gap (corrected):** `GET /api/kpi/payments` and `GET /api/kpi/receipts` — already used when you open Dashboard → Payments / Receipts KPI cards (`KpiPanel` → `fetchKpiPayments` / `fetchKpiReceipts`).

Most other “mobile-only” hits from raw string scan are **false positives** (web builds the same path with `encodeURIComponent` / `withCompany`).

### B. Web has — mobile api.ts missing or unused

| Path | Notes |
|---|---|
| `GET /api/dashboard/chart` | **Deprecated web-only** (dashboard should use metrics series). |
| `GET /api/dashboard/top-customers` | **Deprecated web-only** (web aggregates sales invoices). |
| `GET /api/dashboard/cost-analysis` | **Deprecated web-only** (web aggregates expenses). |
| `GET /api/sales/tab-metrics` | Web sales KPI strip prefers this; falls back to `home-metrics`. |
| `GET /api/stocks/adjustments` | Web stock adjustments register helper. |
| `GET …/companies/:id/print-profile` | Web print path (`fetchPrintProfile`). Mobile uses other print/share flows. |

### C. Same capability, different client shape (not a gap)

| Topic | Mobile | Web |
|---|---|---|
| Cash & bank | Separate KPI GETs | Merged in `fetchCashBank` |
| Receivables / payables | Separate KPI GETs | Merged in `fetchReceivablesPayables` |
| P&L / BS / TB | `pl-bs` | Same `pl-bs` (+ Overview via `reports/financial`) |
| Invoice share | `/tally/invoice/:ref/share-pdf` | Same + local `invoicePdf` |

---

## Verdict

1. **Gap list you asked to wire is done**, including capabilities + einvoice/eway cancel.
2. **Remaining real diffs** are small: mobile `financial-report` + `kpi/payments` + `kpi/receipts`, and web-deprecated dashboard aggregations.
3. Push-token remains wrapper-only on web (no FCM).

Full machine-extracted shared path list is large (~125); see git history of this file’s earlier dump if you need every string. This curated section is the actionable difference set.
