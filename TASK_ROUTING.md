# TASK_ROUTING.md — td-web-portal

For each task type, read ONLY the listed files.

---

## Auth / Login / OTP Bug
Read:
- AGENTS.md, BLUEPRINT.md
- src/pages/auth/Login.jsx
- src/pages/auth/OTPScreen.jsx
- src/contexts/AuthContext.jsx
- src/services/api.js (auth section, lines ~1–80)

Do NOT read: feature pages, components, mock data

---

## Dashboard Bug / KPI Fix
Read:
- AGENTS.md, BLUEPRINT.md
- src/pages/Dashboard.jsx
- src/components/KPICard.jsx
- src/hooks/useApi.js
- src/contexts/AuthContext.jsx (for selectedCompany, selectedFY)

Do NOT read: compliance pages, forms, mock data

---

## Sales / Purchase Page Bug
Read:
- AGENTS.md, BLUEPRINT.md, ROUTING_MAP.md
- src/pages/sales/SalesModule.jsx (or PurchaseModule.jsx)
- src/services/api.js (voucher/sales section)
- src/components/Table.jsx
- src/components/VoucherDetail.jsx (if drawer issue)

Do NOT read: compliance, financial reports, auth

---

## Form Bug (Create Voucher / Invoice)
Read:
- AGENTS.md, BLUEPRINT.md
- Relevant form file in src/pages/forms/
- src/services/api.js (write/post section)
- src/components/FormField.jsx
- src/components/ItemsTable.jsx

Do NOT read: list pages, reports, auth

---

## Financial Report Bug (P&L / Balance Sheet)
Read:
- AGENTS.md, BLUEPRINT.md
- src/pages/financials/Reports.jsx
- src/hooks/useApi.js
- src/services/api.js (reports section)

Do NOT read: compliance, sales, purchase, auth

---

## GST / Compliance Bug
Read:
- AGENTS.md, BLUEPRINT.md
- Relevant compliance page (GST.jsx / EWayBill.jsx / EInvoice.jsx / OtherTaxes.jsx)
- src/services/api.js (compliance section)

Do NOT read: sales, purchase, financial reports

---

## Ledger Bug
Read:
- AGENTS.md, BLUEPRINT.md
- src/pages/Ledgers.jsx
- src/services/api.js (ledger section)
- src/components/Drawer.jsx (if drawer issue)

Do NOT read: compliance, forms, auth

---

## Settings Bug
Read:
- AGENTS.md, BLUEPRINT.md
- src/pages/Settings.jsx
- src/contexts/AuthContext.jsx
- src/contexts/SettingsContext.jsx

Do NOT read: feature pages, forms, compliance

---

## New Page / Route
Read:
- AGENTS.md, BLUEPRINT.md, ROUTING_MAP.md
- src/App.jsx (route tree)
- src/layouts/AppShell.jsx (nav links)
- Similar existing page for pattern reference

Do NOT read: unrelated pages

---

## API Integration (new endpoint)
Read:
- AGENTS.md, BLUEPRINT.md, API_USAGE.md
- src/services/api.js
- src/hooks/useApi.js
- Relevant page file

---

## Files to ALWAYS Ignore
- node_modules/
- dist/
- .env
- src/data/*.js (mock data — reference only, never use for live display)
- public/
- Sibling repos (td-backend, tallydekho-mobile-V4, td-source, td-website)
