# FRONTEND_MAP.md — td-web-portal

## src/pages/
| File | Route | Notes |
|------|-------|-------|
| Dashboard.jsx | / | KPI strip + charts + recent activity |
| Ledgers.jsx | /ledgers | Ledger list + statement drawer |
| AIInsights.jsx | /ai-insights | Groq AI narration |
| Notifications.jsx | /notifications | Push notification list |
| Settings.jsx | /settings | User + company settings |

### src/pages/auth/
| File | Route |
|------|-------|
| Login.jsx | /auth/login |
| OTPScreen.jsx | /auth/otp |
| GetStarted.jsx | /auth/get-started |
| TallySync.jsx | /auth/tally-sync |

### src/pages/financials/
| File | Route |
|------|-------|
| CashBank.jsx | /financials/cash-bank |
| ReceivablesPayables.jsx | /financials/receivables-payables |
| LoansODs.jsx | /financials/loans-ods |
| Reports.jsx | /financials/reports |

### src/pages/compliance/
| File | Route |
|------|-------|
| GST.jsx | /compliance/gst |
| EWayBill.jsx | /compliance/eway-bill |
| EInvoice.jsx | /compliance/einvoice |
| OtherTaxes.jsx | /compliance/other-taxes |
| AuditTrail.jsx | /compliance/audit-trail |

### src/pages/sales/
- SalesModule.jsx — Sales invoices + orders + credit notes

### src/pages/purchase/
- PurchaseModule.jsx — Purchase invoices + debit notes

### src/pages/inventory/
- InventoryModule.jsx — Stock items

### src/pages/expenses/
- ExpensesModule.jsx — Expense vouchers

### src/pages/payments/
- PaymentsModule.jsx — Payment vouchers

### src/pages/forms/
SalesInvoiceForm, SalesOrderForm, CreditNoteForm, DeliveryNoteForm, QuotationForm,
PurchaseInvoiceForm, PurchaseOrderForm, DebitNoteForm, VoucherForm, AddLedgerForm

## src/components/
| File | Purpose |
|------|---------|
| Table.jsx | Shared sortable data table |
| KPICard.jsx | Dashboard KPI tile |
| VoucherDetail.jsx | Voucher detail drawer |
| SyncStatus.jsx | Sync state indicator (paired/syncing/synced) |
| GlobalSearch.jsx | Cross-module search |
| InvoicePDF.jsx | PDF generation for invoices |
| Badge.jsx | Status badge pill |
| Drawer.jsx | Slide-out panel wrapper |
| FormModal.jsx | Modal for create/edit forms |
| CreateModal.jsx | Quick-create trigger modal |
| FormField.jsx | Shared form input field |
| ItemsTable.jsx | Line items table in forms |
| SummaryFooter.jsx | Totals footer in forms |
| LiveSearch.jsx | Real-time search input |
| LogisticsSection.jsx | Transport/logistics fields in forms |
| PinModal.jsx | PIN entry modal (2FA) |

## src/layouts/
- AppShell.jsx — Sidebar nav + header + `<Outlet />`

## src/hooks/
- useApi.js — Universal fetch hook (loading/error/reload)
- useCompanyData.js — Company-aware data fetch
- useFYDates.js — FY date range helper

## src/contexts/
- AuthContext.jsx — Auth + company + FY state
- SettingsContext.jsx — Currency + language

## src/data/ (MOCK DATA — do not use for live display)
- `countries.js` (auth country list)
- Mock business datasets removed (2026-08-10)
- These exist for legacy/dev reference only. Wire to real API for all production pages.

## src/services/
- api.js — All HTTP calls (base: /app/* prefix)
- websocket.js — Socket.io client (Needs verification)

## Build Output
- dist/ — Vite build output (ignore in agent tasks)
