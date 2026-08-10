# ROUTING_MAP.md — td-web-portal

Source: `src/App.jsx`

## Auth Routes (no AppShell)
| Route | Component | Notes |
|-------|-----------|-------|
| /auth/login | src/pages/auth/Login.jsx | Redirects to / if already logged in |
| /auth/otp | src/pages/auth/OTPScreen.jsx | No AuthRoute wrapper (race condition) |
| /auth/get-started | src/pages/auth/GetStarted.jsx | Protected |
| /auth/tally-sync | src/pages/auth/TallySync.jsx | Protected — pairing setup |

## Protected App Routes (inside AppShell)
| Route | Component File |
|-------|---------------|
| / | src/pages/Dashboard.jsx |
| /sales | src/pages/sales/SalesModule.jsx |
| /purchase | src/pages/purchase/PurchaseModule.jsx |
| /inventory | src/pages/inventory/InventoryModule.jsx |
| /expenses | src/pages/expenses/ExpensesModule.jsx |
| /payments | src/pages/payments/PaymentsModule.jsx |
| /parties | src/pages/Parties.jsx |
| /financials/cash-bank | src/pages/financials/CashBank.jsx |
| /financials/receivables-payables | src/pages/financials/ReceivablesPayables.jsx |
| /financials/loans-ods | src/pages/financials/LoansODs.jsx |
| /financials/reports | src/pages/financials/Reports.jsx |
| /compliance/gst | src/pages/compliance/GST.jsx |
| /compliance/eway-bill | src/pages/compliance/EWayBill.jsx |
| /compliance/einvoice | src/pages/compliance/EInvoice.jsx |
| /compliance/other-taxes | src/pages/compliance/OtherTaxes.jsx |
| /compliance/audit-trail | src/pages/compliance/AuditTrail.jsx |
| /ledgers | src/pages/Ledgers.jsx |
| /ai-insights | src/pages/AIInsights.jsx |
| /notifications | src/pages/Notifications.jsx |
| /settings | src/pages/Settings.jsx |

## Forms (inside AppShell — Needs verification on exact paths)
| Form | Component File |
|------|---------------|
| Sales Invoice | src/pages/forms/SalesInvoiceForm.jsx |
| Sales Order | src/pages/forms/SalesOrderForm.jsx |
| Credit Note | src/pages/forms/CreditNoteForm.jsx |
| Delivery Note | src/pages/forms/DeliveryNoteForm.jsx |
| Quotation | src/pages/forms/QuotationForm.jsx |
| Purchase Invoice | src/pages/forms/PurchaseInvoiceForm.jsx |
| Purchase Order | src/pages/forms/PurchaseOrderForm.jsx |
| Debit Note | src/pages/forms/DebitNoteForm.jsx |
| Voucher Form | src/pages/forms/VoucherForm.jsx |
| Add Ledger | src/pages/forms/AddLedgerForm.jsx |

## Layout Components
| Component | File | Purpose |
|-----------|------|---------|
| AppShell | src/layouts/AppShell.jsx | Main sidebar + top header shell |
| Drawer | src/components/Drawer.jsx | Slide-out panel |
| FormModal | src/components/FormModal.jsx | Modal for forms |
| CreateModal | src/components/CreateModal.jsx | Quick-create modal |
