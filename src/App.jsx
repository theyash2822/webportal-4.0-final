import { lazy, Suspense, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import AppShell from './layouts/AppShell';

const Login = lazy(() => import('./pages/auth/Login'));
const OTPScreen = lazy(() => import('./pages/auth/OTPScreen'));
const GetStarted = lazy(() => import('./pages/auth/GetStarted'));
const TallySync  = lazy(() => import('./pages/auth/TallySync'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CashBank = lazy(() => import('./pages/financials/CashBank'));
const ReceivablesPayables = lazy(() => import('./pages/financials/ReceivablesPayables'));
const LoansODs = lazy(() => import('./pages/financials/LoansODs'));
const Reports = lazy(() => import('./pages/financials/Reports'));
const GST = lazy(() => import('./pages/compliance/GST'));
const EWayBill = lazy(() => import('./pages/compliance/EWayBill'));
const EInvoice = lazy(() => import('./pages/compliance/EInvoice'));
const OtherTaxes = lazy(() => import('./pages/compliance/OtherTaxes'));
const AuditTrail = lazy(() => import('./pages/compliance/AuditTrail'));
const Ledgers = lazy(() => import('./pages/Ledgers'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const Settings = lazy(() => import('./pages/Settings'));
const SalesModule = lazy(() => import('./pages/sales/SalesModule'));
const PurchaseModule = lazy(() => import('./pages/purchase/PurchaseModule'));
const InventoryModule = lazy(() => import('./pages/inventory/InventoryModule'));
const ExpensesModule = lazy(() => import('./pages/expenses/ExpensesModule'));
const PaymentsModule = lazy(() => import('./pages/payments/PaymentsModule'));
const Parties = lazy(() => import('./pages/Parties'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="w-6 h-6 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin" />
  </div>
);

// Error boundary - catches render crashes and shows a friendly error
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: '' }; }
  static getDerivedStateFromError(err) { return { hasError: true, error: err.message }; }
  componentDidCatch(err) { console.error('[TallyDekho] Render error:', err.message); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',gap:16,fontFamily:'sans-serif'}}>
          <div style={{fontSize:32}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:600,color:'#1A1A1A'}}>Something went wrong</div>
          <div style={{fontSize:12,color:'#787774',maxWidth:300,textAlign:'center'}}>{this.state.error}</div>
          <button onClick={()=>{ localStorage.clear(); window.location.href='/auth/login'; }}
            style={{padding:'8px 20px',background:'#1A1A1A',color:'white',border:'none',borderRadius:8,cursor:'pointer',fontSize:14}}>
            Back to Login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Protect routes — redirect to login if not authenticated
function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/auth/login" replace />;
  return children;
}

// Redirect already-logged-in users away from auth pages (login only)
function AuthRoute({ children }) {
  const { token } = useAuth();
  if (token) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth routes */}
        <Route path="/auth/login" element={<AuthRoute><Login /></AuthRoute>} />
        {/* OTP page: NO AuthRoute wrapper - login() sets token here, AuthRoute would race-redirect */}
        <Route path="/auth/otp" element={<OTPScreen />} />
        <Route path="/auth/get-started" element={<ProtectedRoute><GetStarted /></ProtectedRoute>} />
        <Route path="/auth/tally-sync"   element={<ProtectedRoute><TallySync  /></ProtectedRoute>} />

        {/* Protected app routes */}
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
            <Route path="sales" element={<SalesModule />} />
            <Route path="purchase" element={<PurchaseModule />} />
            <Route path="inventory" element={<InventoryModule />} />
            <Route path="expenses" element={<ExpensesModule />} />
            <Route path="payments" element={<PaymentsModule />} />
            <Route path="parties" element={<Parties />} />
          <Route path="financials/cash-bank" element={<CashBank />} />
          <Route path="financials/receivables-payables" element={<ReceivablesPayables />} />
          <Route path="financials/loans-ods" element={<LoansODs />} />
          <Route path="financials/reports" element={<Reports />} />
          <Route path="compliance/gst" element={<GST />} />
          <Route path="compliance/eway-bill" element={<EWayBill />} />
          <Route path="compliance/einvoice" element={<EInvoice />} />
          <Route path="compliance/other-taxes" element={<OtherTaxes />} />
          <Route path="compliance/audit-trail" element={<AuditTrail />} />
          <Route path="ledgers" element={<Ledgers />} />
          <Route path="ai-insights" element={<AIInsights />} />
          <Route path="settings" element={<Settings />} />
            <Route path="notifications" element={<Notifications />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <SettingsProvider>
            <AppRoutes />
          </SettingsProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
