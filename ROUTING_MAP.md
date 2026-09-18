# ROUTING_MAP.md — td-web-portal

Source: `src/App.jsx` (Web Portal 3.0 routes, Vite)

## Auth Routes (no AppShell)
| Route | Component | Notes |
|-------|-----------|-------|
| /login | src/pages/auth/Login.jsx | Same flow as mobile: country + WhatsApp OTP (`/api/auth/*`), 2FA PIN, register, then `/settings/tally-sync` for new users. Redirects to / if already logged in |
| /auth/login | → /login | Legacy alias |
| /auth/otp | → /login | OTP is a step inside 3.0 Login |
| /auth/get-started | → /settings/company | Protected |
| /auth/tally-sync | → /settings/tally-sync | Protected |
| /onboarding | src/pages/Onboarding.jsx | First-login tour; `?replay=true` skips completion flag |

## Protected App Routes (inside AppShell)
| Route | Component File |
|-------|---------------|
| / | src/pages/Dashboard.jsx |
| /kpi/:key | src/pages/Dashboard.jsx (KPI drill) |
| /sales | src/pages/sales.jsx (SalesLayout → invoices) |
| /sales/register | src/pages/sales.jsx — `GET /api/sales/vouchers` + `/counts` |
| /sales/orders | src/pages/sales.jsx |
| /sales/credit-notes | src/pages/sales.jsx |
| /sales/delivery-notes | src/pages/sales.jsx |
| /sales/proforma | src/pages/sales.jsx |
| /sales/quotations | src/pages/sales.jsx |
| /sales/einvoice | src/pages/compliance.jsx |
| /sales/eway-bill | src/pages/sales.jsx |
| /purchase | src/pages/purchase.jsx |
| /purchase/register | src/pages/purchase.jsx |
| /purchase/orders | src/pages/purchase.jsx |
| /purchase/debit-notes | src/pages/purchase.jsx |
| /vouchers | src/pages/vouchers.jsx |
| /vouchers/payment | src/pages/vouchers.jsx |
| /vouchers/receipt | src/pages/vouchers.jsx |
| /vouchers/journal | src/pages/vouchers.jsx |
| /vouchers/contra | src/pages/vouchers.jsx |
| /inventory | src/pages/inventory.jsx (+ nested section routes) |
| /financials | → /financials/overview |
| /financials/overview | src/pages/financials.jsx — `GET /api/reports/financial` |
| /financials/profit-loss | src/pages/financials.jsx — `GET /api/reports/pl-bs` (pl section) |
| /financials/balance-sheet | src/pages/financials.jsx — `GET /api/reports/pl-bs` (bs section) |
| /financials/trial-balance | src/pages/financials.jsx — `GET /api/reports/pl-bs` (trialBalance section) |
| /financials/cash-register | src/pages/financials.jsx — Cash Register (Payment/Receipt/Contra vouchers, mobile KPI parity) |
| /financials/cash-bank | → /kpi/bank-balance (dashboard KPI drawer) |
| /financials/receivables-payables | → /kpi/receivables |
| /financials/loans-ods | → /kpi/loans-ods |
| /financials/cashflow | → /cashflow-report |
| /cashflow-report | src/pages/CashflowReport.jsx — full-screen cashflow (`GET /api/cashflow`) |
| /document/:id | src/pages/DocumentViewer.jsx — cream sheet + Preview / Share PDF / Print PDF (`?preview=1` post-create) |
| /compliance | → /compliance/gst |
| /compliance/gst | src/pages/compliance.jsx — gst-summary + `/api/reports/gst` + unmatched |
| /compliance/alerts | src/pages/compliance.jsx — `GET /api/alerts` |
| /compliance/other-taxes | src/pages/compliance.jsx |
| /compliance/tax-register | → /compliance/other-taxes (redirect) |
| /compliance/einvoice | src/pages/compliance.jsx |
| /compliance/einvoice-coverage | src/pages/compliance.jsx |
| /compliance/eway-bill | src/pages/compliance.jsx |
| /compliance/eway-bill-coverage | src/pages/compliance.jsx |
| /audit-trail | src/pages/masters.jsx (My Entries — default tab) |
| /audit-trail/daybook | src/pages/masters.jsx |
| /compliance/daybook | → /audit-trail/daybook (redirect) |
| /compliance/audit-trail | → /audit-trail (redirect) |
| /expenses | src/pages/masters.jsx |
| /payments | src/pages/masters.jsx |
| /parties | src/pages/masters.jsx |
| /ledgers | src/pages/masters.jsx |
| /ai-insights | src/pages/masters.jsx |
| /notifications | → / |
| /settings | → /settings/profile (SettingsLayout — Account \| Workspace \| Connection \| …) |
| /settings/* | src/pages/Settings.jsx (+ settings/* dedicated pages) |
| Settings › Account | Profile, License |
| Settings › Workspace | Company, Team & Access, Invitations, Billing & Credits, Payment modes, Workspace lifecycle |
| Settings › Connection | Tally Sync, Bank Feeds, Security (Tally Sync stays here — not under Workspace) |
| /settings/notification-channels | Channels & Quiet Hours — `/api/notification-settings` (`*_enabled` + quiet hours) |
| /settings/payment-reminders | Multi reminders — `/api/alert-settings` `payment_reminders` |
| /settings/compliance-reminders | Four cards — `/api/alert-settings` `compliance_reminders` |
| /settings/stock-alerts | Multi entry list — `/api/alert-settings` `stock_alerts` |
| /settings/einvoice | Applicability + IRP credentials + workspace activate (`RequireCapability`) |
| /settings/ewb | Applicability + GSP credentials + workspace activate (`RequireCapability`) |
| /settings/team | TeamAccess — invite scopes (FY/ledger/godown/CC), Role CRUD, Data access (`RequireCapability`) |
| /settings/billing | Billing — Owner-only Razorpay checkout (fail-closed if unconfigured); no prod Complete-order (dev) |
| /settings/payment-modes | PaymentModes — Cash/UPI/Bank/Cheque → ledger map (nav gated) |
| /settings/workspace-lifecycle | Transfer / Reset / Close — Owner-only (`RequireCapability ownerOnly`) |
| /settings/invitations | Received (`GET /api/me/invitations`) + Sent pending (`GET /api/workspaces/:id/invitations`) |
| /settings/tally-sync | SettingsTallySync — Demo when UNPAIRED\|RECONNECTING; HS/Restore approve Owner/Admin |

## Create drawer (AppShell)
| Kind | Component File |
|------|----------------|
| Sales / Purchase / Voucher creates | src/components/create/voucherForms.jsx + accountingForms.jsx |
| Ledger: sundry-creditor, sundry-debtor, duties-taxes, custom-group | src/components/create/masterForms.jsx (PartyForm / LedgerForm) |
| Inventory: stock-item, warehouse, stock-edit, stock-transfer, stock-adjustment | src/components/create/masterForms.jsx |

## Layout Components
| Component | File | Purpose |
|-----------|------|---------|
| AppShell | src/layouts/AppShell.jsx | 3.0 sidebar + header + command search (company/FY via WorkspaceContext) |
| SettingsLayout | src/layouts/SettingsLayout.jsx | Filters SETTINGS_SECTIONS by capability |
| ModuleLayout | src/layouts/ModuleLayout.jsx | Segmented tabs / inventory / settings sections |
| RequireCapability | src/components/RequireCapability.jsx | Settings route guard — Ask-admin message |
| Drawer | src/components/kit.jsx | 3.0 slide-out (bg-paper + bg-ink/20) |
| CreateDrawer | src/components/create/CreateDrawer.jsx | Global create stack |
