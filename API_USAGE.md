# API_USAGE.md — td-web-portal

Source: `src/services/api.js`
Base URL: `VITE_API_URL` env var (default: `http://localhost:3001/app`)
WebSocket: `VITE_WS_URL` env var (default: `http://localhost:3001`)

## Note
Auth, pairing, dashboard, and most live reads use `/api/*` (same as mobile V4).
Some older register/ledger writes still go through `/app/*`.

## FY params (mobile parity)

`selectedFY` comes from `GET /api/company/years` → `{ finYear, startDate, endDate, label }`.

| Pattern | Helper | Used for | Query params |
|---------|--------|----------|--------------|
| Date window | `fyDateParams(selectedFY)` | Dashboard, sales, ledgers, vouchers | `from`, `to` only |
| FY label | `fyReportParams(selectedFY)` | P&L/BS/TB, stocks, other-taxes, KPI drilldowns | `fy` + `from` + `to` |
| FY string | `fyInfoToParam(selectedFY)` | Same as mobile `fyInfoToParam` | `2025-2026` from `fin_year` |

Dashboard home matches mobile: `period` + `from`/`to` (last N days clamped inside selected FY) — **no `fy` param**.

## Auth (same `/api/auth/*` as mobile V4)
Body uses `{ phone: "+91…" }` (E.164). Responses use `access_token`, `requires_2fa`, `is_new_user`, `is_paired`, `pre_auth_token`.
| Function | HTTP | Endpoint |
|----------|------|----------|
| sendOtp | POST | /api/auth/send-otp `{ phone }` |
| verifyOtp | POST | /api/auth/verify-otp `{ phone, otp, reset_pin? }` |
| registerUser | POST | /api/auth/register `{ name, email, language }` (Bearer from OTP) |
| verifyPin | POST | /api/auth/verify-pin `{ pin }` (pre-auth Bearer) |
| resetPin | POST | /api/auth/reset-pin `{ pin }` (pre-auth Bearer) |
| fetchMe | GET | /api/auth/me |
| updateMe | PATCH | /api/auth/me |
| logoutApi | POST | /api/auth/logout |
| changePhone | POST | /api/auth/change-phone `{ step, … }` |
| changeEmail | POST | /api/auth/change-email `{ step, … }` |
| registerPushToken | POST | /api/push-token (Settings → Channels & Quiet Hours → Enable browser push) |
| removePushToken | DELETE | /api/push-token |

## Settings alerts / integrations (same as mobile V4)
Loaded via page-local `useRemoteConfig` in `src/pages/Settings.jsx` (not always wrapped in `api.js` helpers).

| Screen | HTTP | Endpoint | Payload notes |
|--------|------|----------|---------------|
| Channels & Quiet Hours | GET/PATCH | `/api/notification-settings` | Mobile keys: `push_enabled`, `email_enabled`, `sms_enabled`, `whatsapp_enabled`, `quiet_enabled`, `quiet_from`, `quiet_to`, `quiet_saturday`, `quiet_sunday` (+ optional `digest`) |
| Payment / Compliance / Stock alerts | GET/PATCH | `/api/alert-settings` | Partial patches: `payment_reminders`, `compliance_reminders` (gst / einvoice / ewb / other_taxes), `stock_alerts` (selected_entries + channels/schedule) |
| E-Invoice / EWB credentials | GET/PATCH | `/api/integration-settings` | `einvoice` (provider + password + client_*) and `ewb` (gsp + password + client_*; reads legacy `ewaybill`) |
| E-Invoice / EWB applicability | POST | `/api/company/:guid/compliance-config` | 3-state: `not_applicable` / `applicable_not_configured` / `applicable_configured` |

Stock group/item pickers use existing `fetchStockGroups` + `fetchStocks` (`/api/stocks/groups`, `/api/stocks/items`).

## Pairing (same as mobile V4)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchTallySyncStatus | GET | /api/tally-sync/status |
| pairWithTally | POST | /api/tally-sync/pair `{ pairing_code }` |
| unpairTally | POST | /api/tally-sync/unpair |
| fetchWorkspaceApprovals | GET | /api/workspace/approvals |
| approveHardSync | POST | /api/workspace/hard-sync/:id/approve |
| rejectHardSync | POST | /api/workspace/hard-sync/:id/reject |
| approveWorkspaceRestore | POST | /api/workspace/restore/approve `{ code, backupId }` |
| fetchMyWorkspaces | GET | /api/me/workspaces (skip Workspace header) |
| fetchWorkspaceContext | GET | /api/workspaces/:id/context |
| patchWorkspace | PATCH | /api/workspaces/:id |
| createWorkspace | POST | /api/workspaces |
| fetchWorkspaceMembers | GET | /api/workspaces/:id/members |
| fetchWorkspaceRoles | GET | /api/workspaces/:id/roles |
| fetchCapabilityRegistry | GET | /api/capabilities/registry |
| createWorkspaceInvitation | POST | /api/workspaces/:id/invitations |
| fetchMyInvitations | GET | /api/me/invitations |
| acceptInvitation / declineInvitation | POST | /api/invitations/:id/accept\|decline |
| suspend/unsuspend/remove member | POST/DELETE | /api/workspaces/:id/members/:userId/... |
| fetchWorkspaceAudit | GET | /api/workspaces/:id/audit |
| fetchBillingOverview / fetchBillingRates | GET | /api/billing/overview , /api/billing/rates |
| fetchBillingTransactions / fetchBillingUsage | GET | /api/billing/transactions , /api/billing/usage |
| fetchBillingInvoices | GET | /api/billing/invoices |
| fetchBillingPaymentOrders / createBillingPaymentOrder | GET/POST | /api/billing/payment-orders |
| completeBillingPaymentOrder | POST | /api/billing/payment-orders/:id/complete |
| fetchWorkspaceSeats / purchaseWorkspaceSeat | GET/POST | /api/workspaces/:id/seats |
| patchWorkspaceMemberRole | PATCH | /api/workspaces/:id/members/:userId/role |
| initiateWorkspaceTransfer | POST | /api/workspaces/:id/transfer/initiate |
| fetchWorkspaceTransfer | GET | /api/workspaces/:id/transfer |
| confirm/complete/revokeWorkspaceTransfer | POST | /api/workspaces/:id/transfer/confirm\|complete\|revoke |
| request/confirm/completeWorkspaceReset | POST | /api/workspaces/:id/reset/request\|confirm\|complete |
| request/confirm/completeWorkspaceClose | POST | /api/workspaces/:id/close/request\|confirm\|complete |
| fetchWorkspaceLifecycle | GET | /api/workspaces/:id/lifecycle |
| fetchPaymentModeMap / putPaymentModeMap | GET/PUT | /api/workspaces/:id/companies/:guid/payment-mode-map |
| fetchCostCentres | GET then POST | `/api/workspaces/:wsId/companies/:guid/cost-centres` (prefer), fallback `POST /api/cost-centres { companyGuid }` — Team Access Data Access picker |

Header: `X-Workspace-Id` attached automatically from `td_current_workspace_id` when `workspace_model_enabled` — including `/tally/*` via `tallyRequest`/`tallyGet` and barcode template download.

**403 UX:** `CAPABILITY_DENIED` and `SCOPE_*` responses surface as `"Not allowed. Ask your Workspace administrator."` (token is not cleared).

## Companies (same as mobile V4)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchCompaniesList | GET | /api/companies → `{ id, name, gstin }` |
| fetchCompanyYears | GET | /api/company/years?companyGuid=… |
| fetchCompaniesHydrated | GET | both above — list + FY years for selected/first company |

## Ledgers (same GET /api/ledgers as mobile)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchLedgers | GET | /api/ledgers?companyGuid&search&page&limit&from&to&fy&group&nature |
| fetchLedgerDetails | GET | /api/ledgers/:id?companyGuid&from&to |
| fetchLedgerVouchers | GET | /api/ledgers/:id/statement?companyGuid&from&to&fy |
| fetchVoucherDetail | GET | /api/vouchers/:id?companyGuid |

## Parties
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchParties / fetchPartiesList | GET | /api/parties?companyGuid&search&type |

## Vouchers / Day book
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchVouchers | GET | /api/vouchers?companyGuid&type&from&to&search (fallback POST /vouchers) |
| fetchDaybook | GET | /api/daybook?companyGuid&date&from&to&page&limit |

## Dashboard / search / KPI
| Function | HTTP | Endpoint |
|----------|------|----------|
| **loadMobileDashboard** | GET ×4 | Same bundle as mobile home: `/api/dashboard/kpi-strip`, `/metrics`, `/cashflow`, `/recent-activity` |
| fetchCashflow | GET | /api/dashboard/cashflow (`period`, `from`, `to`) |
| fetchDashboardChart | GET | /api/dashboard/chart |
| aggregateTopCustomersFromInvoices | GET | /api/sales/invoices (`from`, `to`) — client-side party rollup |
| aggregateCostFromExpenses | GET | /api/expenses (`from`, `to`) — categories for cost panel |
| searchGlobal | GET | /api/dashboard/search |
| fetchNotifications | GET | /api/notifications (`companyGuid`) — same as mobile |
| markNotificationRead | PATCH | /api/notifications/:id/read |
| markAllNotificationsRead | PATCH | /api/notifications/read-all (`companyGuid`) |
| fetchKpiDetail | GET | /api/kpi/:metric |
| fetchSalesHomeMetrics | GET | /api/sales/home-metrics |
| fetchPurchaseHomeMetrics | GET | /api/purchase/home-metrics |
| fetchExpensesHomeMetrics | GET | /api/expenses/home-metrics |
| fetchSalesTabMetrics | GET | /api/sales/tab-metrics (fallback: home-metrics) |

## Registers
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchSalesInvoices | GET | /api/sales/invoices (fallback POST /vouchers) |
| fetchSalesOrders | GET | /api/sales/orders |
| fetchSalesVouchers | GET | /api/sales/vouchers |
| fetchSalesVoucherCounts | GET | /api/sales/vouchers/counts |
| fetchSalesInvoiceCreditNoteContext | GET | /api/sales/invoices/:id/credit-note-context |
| fetchProforma | GET | /api/sales/invoices?is_optional=true |
| fetchQuotations | GET | /api/sales/vouchers?docTypes=quotation |
| fetchSalesEwaybills | GET | /api/sales/ewaybills |
| fetchPurchaseOrders | GET | /api/purchase/orders |
| fetchPurchaseInvoices | GET | /api/purchase/invoices |
| fetchPurchaseVouchers | GET | /api/purchase/vouchers |
| fetchPurchaseVoucherCounts | GET | /api/purchase/vouchers/counts |
| fetchPurchaseInvoiceDebitNoteContext | GET | /api/purchase/invoices/:id/debit-note-context |
| fetchCreditNotes / fetchDebitNotes / fetchDeliveryNotes | GET | matching /api/* registers |

## GST
| Function | HTTP | Endpoint |
|----------|------|----------|
| cancelEInvoice | POST | /api/einvoice/cancel |
| cancelEWayBill | POST | /api/ewaybills/cancel |
| fetchCompanyCapabilities | GET | /api/company/capabilities |

## Other Taxes (mobile parity)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchOtherTaxesSummary | GET | /api/reports/other-taxes/summary?companyGuid&fy |
| fetchOtherTaxesTransactions | GET | /api/reports/other-taxes/transactions?companyGuid&taxType&fy&limit&page |
| fetchOtherTaxesLateChallans | GET | /api/reports/other-taxes/late-challans?companyGuid&taxType&fy |

Tax types: `TDS`, `TCS`, `VAT`, `CESS`, `EXCISE_DUTY`, `SERVICE_TAX`, `IMPORT_DUTY`, `EXPORT_DUTY`, `WITHHOLDING_TAX`.

## Stocks (same GET /api/stocks/* as mobile)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchStocks | GET | /api/stocks/items?companyGuid&search&page&limit&category&group&warehouse |
| fetchStockDetails | GET | /api/stocks/items/:id?companyGuid&from&to&fy |
| fetchStockMovements | GET | /api/stocks/items/:id/movements |
| fetchMovementAnalyticsChart | GET | /api/stocks/movement-analytics/chart |
| fetchStockFilters | GET | /api/stocks/groups + /api/stocks/warehouses |
| fetchStockSummary | POST | /app/stock-dashboard (same as mobile getStockDashboard) |
| fetchWarehouses | GET | /api/stocks/warehouses |
| barcode helpers | POST/GET | /api/inventory/barcodes* |
| fetchBarcodesByGuids | POST | /api/inventory/barcodes/by-guids |
| downloadBarcodeTemplate | GET | /api/inventory/barcodes/template |
| startBulkBarcodeJob / status / active | POST/GET | /api/inventory/barcodes/generate-bulk/* |

## Geo / form lookups
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchGeoCountries | GET | /api/geo/countries |
| fetchGeoStates | GET | /api/geo/states |
| fetchTaxLedgers | GET | /api/tax/ledgers |
| fetchChargeLedgers | GET | /api/charge-ledgers → normalizes `{ logisticsCharges, additionalCharges, roundOffLedgers }` into `{ chargeLedgers, roundOffLedgers }` (mobile create-invoice shape) |
| fetchStockGodowns | GET | /api/stocks/items/:id/godowns → normalizes `data.warehouses[{name,qty}]` |
| fetchCompanyProfile | GET | /api/company/profile?companyGuid (dispatch-from prefill on create forms) |
| sendPaymentReminder | POST | /api/reminders/send |

| fetchAIInsights | GET | /api/ai/insights?companyGuid&from&to&fy |
| fetchAIInsightsHistory | GET | /api/ai/insights/history/:fy?companyGuid |
| askHelpAI | POST | /api/ai/help `{ message, history }` |

## Expenses & Financials (mobile GET parity)
| Function | HTTP | Endpoint |
|----------|------|----------|
| fetchExpenses | GET | /api/expenses?companyGuid&from&to&types&limit |
| fetchExpenseCounts | GET | /api/expenses/counts |
| fetchCashBank | GET | /api/kpi/bank-balance + /api/kpi/cash-in-hand (merged client-side) |
| fetchReceivablesPayables | GET | /api/kpi/receivables + /api/kpi/payables (merged client-side) |
| fetchReportsFinancial | GET | /api/reports/financial |
| fetchReportsPL | GET | /api/reports/pl-bs → `pl` section |
| fetchReportsBS | GET | /api/reports/pl-bs → `bs` section |
| fetchReportsTB | GET | /api/reports/pl-bs → `trialBalance` section |
| fetchComplianceConfig / saveComplianceConfig | GET/POST | /api/company/:guid/compliance-config |
| alterStockItemInTally | POST | /tally/master/stock-item-alter |
| createBankLedgerInTally | POST | /tally/master/bank |
| fetchTallyInvoicePreview | GET | /tally/invoice/:ref/preview |
| shareTallyInvoicePdf | POST | /tally/invoice/:ref/share-pdf |
| fetchMasterPreview | GET | /tally/master/:queueId/preview |

## Data Fetching Pattern
Pages call helpers from `src/services/api.js` (GET `/api/*` with `companyGuid` query param — same as mobile V4).
Legacy POST `/app/*` is used only for Tally writes and a few fallbacks (e.g. `fetchVouchers` if GET fails, `fetchStockSummary` dashboard).

## Company + FY Params
Most GET reads pass `companyGuid`, optional `from`/`to` or `fy` as query params via `withCompany()`.

## WebSocket
Service: `src/services/websocket.js`
Connected via `AuthContext` when token is set.
Events listened: `synced`, `unpaired`, `logout`, `paired`, `voucher:tallySynced`, `disconnect`
