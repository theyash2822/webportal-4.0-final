# CHANGELOG_AGENT.md — td-web-portal

Format: Date | Task | Files Changed | Behavior Changed | Tested | Risks

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
