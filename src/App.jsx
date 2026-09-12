import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { DrawerStackProvider } from './components/kit';
import AppShell from './layouts/AppShell';
import ModuleLayout, {
  INVENTORY_SECTIONS, SETTINGS_SECTIONS, FINANCIALS_TABS, COMPLIANCE_TABS, AUDIT_TRAIL_TABS, PURCHASE_TABS, VOUCHER_TABS,
} from './layouts/ModuleLayout';

import Login from './pages/auth/Login';
import Dashboard from './pages/Dashboard';
import * as S from './pages/sales.jsx';
import * as P from './pages/purchase.jsx';
import * as V from './pages/vouchers.jsx';
import * as I from './pages/inventory.jsx';
import * as F from './pages/financials.jsx';
import * as C from './pages/compliance.jsx';
import * as M from './pages/masters.jsx';
import * as G from './pages/settings.jsx';
import { SettingsTeamAccess } from './pages/settings/TeamAccess';
import { SettingsBilling } from './pages/settings/Billing';
import { SettingsWorkspaceLifecycle } from './pages/settings/WorkspaceLifecycle';
import { SettingsPaymentModes } from './pages/settings/PaymentModes';
import Onboarding from './pages/Onboarding';
import DocumentViewer from './pages/DocumentViewer';
import CashflowReport from './pages/CashflowReport';
import { isOnboardingDone } from './utils/onboardingNav';

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6">
        <p className="text-base font-semibold text-ink">Something went wrong</p>
        <p className="max-w-md text-center text-[13px] text-ink-soft">{this.state.error.message}</p>
        <button
          onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
          className="h-10 rounded-md bg-ink px-5 text-[13px] font-semibold text-white"
        >
          Back to sign in
        </button>
      </div>
    );
  }
}

function Protected({ children }) {
  const { token, authBootstrapping } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (authBootstrapping) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" />
        <p className="text-[13px] text-ink-soft">Loading your workspace…</p>
      </div>
    );
  }
  return children;
}
function PublicOnly({ children }) {
  const { token, authBootstrapping } = useAuth();
  if (authBootstrapping || !token) return children;
  const dest = sessionStorage.getItem('td.postAuthPath') || '/';
  sessionStorage.removeItem('td.postAuthPath');
  return <Navigate to={dest} replace />;
}

function OnboardingGate({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!isOnboardingDone(user) && !location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <WorkspaceProvider>
          <SettingsProvider>
            <DrawerStackProvider>
              <Routes>
                <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                <Route path="/auth/login" element={<Navigate to="/login" replace />} />
                <Route path="/auth/otp" element={<Navigate to="/login" replace />} />
                <Route path="/auth/get-started" element={<Protected><Navigate to="/settings/company" replace /></Protected>} />
                <Route path="/auth/tally-sync" element={<Protected><Navigate to="/settings/tally-sync" replace /></Protected>} />
                <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />

                <Route path="/" element={<Protected><OnboardingGate><AppShell /></OnboardingGate></Protected>}>
                  <Route index element={<Dashboard />} />
                  <Route path="kpi/:key" element={<Dashboard />} />

                  <Route path="sales" element={<S.SalesLayout />}>
                    <Route index element={<S.SalesInvoices />} />
                    <Route path="register" element={<S.SalesRegister />} />
                    <Route path="orders" element={<S.SalesOrders />} />
                    <Route path="credit-notes" element={<S.CreditNotes />} />
                    <Route path="delivery-notes" element={<S.DeliveryNotes />} />
                    <Route path="proforma" element={<S.Proforma />} />
                    <Route path="quotations" element={<S.Quotations />} />
                    <Route path="einvoice" element={<C.EInvoice />} />
                    <Route path="eway-bill" element={<S.SalesEwayBill />} />
                  </Route>

                  <Route path="purchase" element={<ModuleLayout title="Purchase" tabs={PURCHASE_TABS} Kpis={P.PurchaseKpis} />}>
                    <Route index element={<P.PurchaseInvoices />} />
                    <Route path="register" element={<P.PurchaseRegister />} />
                    <Route path="orders" element={<P.PurchaseOrders />} />
                    <Route path="debit-notes" element={<P.DebitNotes />} />
                  </Route>

                  <Route path="vouchers" element={<ModuleLayout title="Vouchers" tabs={VOUCHER_TABS} Kpis={V.VoucherKpis} />}>
                    <Route index element={<V.AllVouchers />} />
                    <Route path="payment" element={<V.PaymentVouchers />} />
                    <Route path="receipt" element={<V.ReceiptVouchers />} />
                    <Route path="journal" element={<V.JournalVouchers />} />
                    <Route path="contra" element={<V.ContraVouchers />} />
                  </Route>

                  <Route path="inventory" element={<ModuleLayout title="Inventory" sections={INVENTORY_SECTIONS} />}>
                    <Route index element={<I.InventoryOverview />} />
                    <Route path="items" element={<I.StockItems />} />
                    <Route path="items/:id" element={<I.StockItems />} />
                    <Route path="warehouses" element={<I.Warehouses />} />
                    <Route path="warehouses/:id" element={<I.Warehouses />} />
                    <Route path="stock-ledger" element={<I.StockLedger />} />
                    <Route path="transfers" element={<I.Transfers />} />
                    <Route path="transfers/:id" element={<I.Transfers />} />
                    <Route path="adjustments" element={<I.Adjustments />} />
                    <Route path="on-hand" element={<I.OnHandStock />} />
                    <Route path="negative-stock" element={<I.NegativeStock />} />
                    <Route path="aged-items" element={<I.AgedItems />} />
                    <Route path="fast-slow" element={<I.FastSlow />} />
                    <Route path="reorder-queue" element={<I.ReorderQueue />} />
                    <Route path="movement-analytics" element={<I.MovementAnalytics />} />
                    <Route path="valuation-summary" element={<I.ValuationSummary />} />
                    <Route path="expiry-schedule" element={<I.ExpirySchedule />} />
                    <Route path="snapshot" element={<I.StockSnapshot />} />
                    <Route path="barcodes" element={<I.Barcodes />} />
                    <Route path="print-barcodes" element={<I.PrintBarcodes />} />
                    <Route path="label-preview" element={<I.LabelPreview />} />
                    <Route path="print-settings" element={<I.PrintSettings />} />
                    <Route path="reports" element={<I.StockReports />} />
                    <Route path="settings" element={<I.StockSettings />} />
                  </Route>

                  <Route path="financials" element={<ModuleLayout title="Financials" tabs={FINANCIALS_TABS} Kpis={F.FinancialsKpis} />}>
                    <Route index element={<Navigate to="/financials/overview" replace />} />
                    <Route path="overview" element={<F.FinancialOverview />} />
                    <Route path="profit-loss" element={<F.ProfitLoss />} />
                    <Route path="balance-sheet" element={<F.BalanceSheet />} />
                    <Route path="trial-balance" element={<F.TrialBalance />} />
                    <Route path="cash-register" element={<F.CashRegister />} />
                    <Route path="cash-bank" element={<Navigate to="/kpi/bank-balance" replace />} />
                    <Route path="receivables-payables" element={<Navigate to="/kpi/receivables" replace />} />
                    <Route path="loans-ods" element={<Navigate to="/kpi/loans-ods" replace />} />
                    <Route path="cashflow" element={<Navigate to="/cashflow-report" replace />} />
                    <Route path="reports/*" element={<Navigate to="/financials/overview" replace />} />
                  </Route>

                  {/* Top-level — DoneState uses /document/:id; cashflow links use /cashflow-report */}
                  <Route path="document/:id" element={<DocumentViewer />} />
                  <Route path="cashflow-report" element={<CashflowReport />} />

                  <Route path="compliance" element={<ModuleLayout title="Compliance" tabs={COMPLIANCE_TABS} Kpis={C.ComplianceKpis} />}>
                    <Route index element={<Navigate to="/compliance/gst" replace />} />
                    <Route path="gst" element={<C.GST />} />
                    <Route path="alerts" element={<C.ComplianceAlerts />} />
                    <Route path="other-taxes" element={<C.OtherTaxes />} />
                    <Route path="tax-register" element={<Navigate to="/compliance/other-taxes" replace />} />
                    <Route path="einvoice" element={<C.EInvoice />} />
                    <Route path="einvoice-coverage" element={<C.EInvoiceCoverage />} />
                    <Route path="eway-bill" element={<C.EWayBill />} />
                    <Route path="eway-bill-coverage" element={<C.EWayBillCoverage />} />
                  </Route>

                  <Route path="audit-trail" element={<ModuleLayout title="Audit Trail" tabs={AUDIT_TRAIL_TABS} testid="audit-trail-module" />}>
                    <Route index element={<M.AuditTrail />} />
                    <Route path="daybook" element={<M.DayBook />} />
                  </Route>

                  <Route path="expenses" element={<M.Expenses />} />
                  <Route path="payments" element={<M.PaymentsReceipts />} />
                  <Route path="parties" element={<M.Parties />} />
                  <Route path="ledgers" element={<M.Ledgers />} />
                  <Route path="ai-insights" element={<M.AIInsights />} />

                  <Route path="notifications" element={<Navigate to="/" replace />} />
                  <Route path="daybook" element={<Navigate to="/audit-trail/daybook" replace />} />
                  <Route path="compliance/daybook" element={<Navigate to="/audit-trail/daybook" replace />} />
                  <Route path="compliance/audit-trail" element={<Navigate to="/audit-trail" replace />} />
                  <Route path="expenses/register" element={<Navigate to="/expenses" replace />} />
                  <Route path="parties/:id" element={<Navigate to="/parties" replace />} />
                  <Route path="ledgers/:id" element={<Navigate to="/ledgers" replace />} />

                  <Route path="settings" element={<ModuleLayout title="Settings" sections={SETTINGS_SECTIONS} testid="settings-module" />}>
                    <Route index element={<Navigate to="/settings/profile" replace />} />
                    <Route path="profile" element={<G.SettingsProfile />} />
                    <Route path="company" element={<G.SettingsCompany />} />
                    <Route path="team" element={<SettingsTeamAccess />} />
                    <Route path="billing" element={<SettingsBilling />} />
                    <Route path="payment-modes" element={<SettingsPaymentModes />} />
                    <Route path="workspace-lifecycle" element={<SettingsWorkspaceLifecycle />} />
                    <Route path="license" element={<G.SettingsLicense />} />
                    <Route path="tally-sync" element={<G.SettingsTallySync />} />
                    <Route path="bank-feeds" element={<G.SettingsBankFeeds />} />
                    <Route path="security" element={<G.SettingsSecurity />} />
                    <Route path="preferences" element={<G.SettingsPreferences />} />
                    <Route path="currency" element={<G.SettingsCurrency />} />
                    <Route path="language" element={<G.SettingsLanguage />} />
                    <Route path="notification-channels" element={<G.SettingsNotificationChannels />} />
                    <Route path="payment-reminders" element={<G.SettingsPaymentReminders />} />
                    <Route path="compliance-reminders" element={<G.SettingsComplianceReminders />} />
                    <Route path="stock-alerts" element={<G.SettingsStockAlerts />} />
                    <Route path="voucher-config" element={<G.SettingsVoucherConfig />} />
                    <Route path="einvoice" element={<G.SettingsEInvoice />} />
                    <Route path="ewb" element={<G.SettingsEWB />} />
                    <Route path="barcodes" element={<G.SettingsBarcodes />} />
                    <Route path="help" element={<G.SettingsHelp />} />
                    <Route path="about" element={<G.SettingsAbout />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </DrawerStackProvider>
          </SettingsProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
