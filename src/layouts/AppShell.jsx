import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, ArrowLeftRight, CreditCard, FileBarChart2,
  ShieldCheck, Truck, FileText, Receipt, BookOpen, ClipboardList,
  Sparkles, Settings, ChevronDown, ChevronRight, Menu, Bell, Building2,
  Search, Plus, Check, TrendingUp, ShoppingCart, Package, LogOut
} from 'lucide-react';
import CreateModal from '../components/CreateModal';
import { useAuth } from '../contexts/AuthContext';
import SyncStatus from '../components/SyncStatus';
import GlobalSearch from '../components/GlobalSearch';

// ─── User Menu ────────────────────────────────────────────────────────────────
function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const displayName = user?.name || user?.mobile || 'Account';
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F5F4EF] transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
          {initials}
        </div>
        <span className="text-xs font-medium text-[#1A1A1A] max-w-[80px] truncate hidden sm:block">
          {displayName.split(' ')[0]}
        </span>
        <ChevronDown size={11} className="text-[#AEACA8]" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-52 bg-white border border-[#E9E8E3] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F5F4EF]">
            <p className="text-sm font-semibold text-[#1A1A1A] truncate">{displayName}</p>
            <p className="text-xs text-[#AEACA8] mt-0.5 truncate">{user?.mobile || user?.email || ''}</p>
          </div>
          <button className="w-full text-left px-4 py-2.5 text-sm text-[#787774] hover:bg-[#F5F4EF] hover:text-[#1A1A1A] transition-colors">Profile</button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-[#787774] hover:bg-[#F5F4EF] hover:text-[#1A1A1A] transition-colors">Settings</button>
          <div className="border-t border-[#F5F4EF] mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#C0392B] hover:bg-[#FEF2F2] transition-colors"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FY Selector (global top bar) ──────────────────────────────────────────────
function FYSelector() {
  const [open, setOpen] = useState(false);
  const { selectedCompany, selectedFY, selectFY } = useAuth();
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const years = selectedCompany?.years || [];
  const currentFY = selectedFY || years[years.length - 1];

  if (!currentFY && years.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E9E8E3] hover:bg-[#F5F4EF] transition-colors text-xs font-medium text-[#1A1A1A]"
      >
        <span className="text-[10px] text-[#AEACA8] font-normal">FY</span>
        <span className="font-semibold">{currentFY?.name || '2025-26'}</span>
        <ChevronDown size={11} className={`text-[#AEACA8] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-44 bg-white border border-[#E9E8E3] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[#AEACA8] uppercase tracking-widest">Financial Year</p>
          {years.length === 0 && (
            <p className="px-3 py-2 text-xs text-[#AEACA8]">Sync desktop to load years</p>
          )}
          {[...years].reverse().map(y => (
            <button
              key={y.uniqueId}
              onClick={() => { selectFY(y); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#F5F4EF] transition-colors text-left"
            >
              <span className="text-sm text-[#1A1A1A]">FY {y.name}</span>
              {currentFY?.uniqueId === y.uniqueId && <Check size={12} className="text-[#1A1A1A]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Company + FY Switcher ────────────────────────────────────────────────────
function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const { companies, selectedCompany, selectCompany } = useAuth();
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const list = companies || [];
  const current = selectedCompany || list[0];
  const displayName = current?.name || 'Select Company';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F5F4EF] transition-colors"
      >
        <div className="w-5 h-5 rounded-md bg-[#1A1A1A] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          {displayName[0]}
        </div>
        <span className="text-xs font-medium text-[#1A1A1A] max-w-[120px] truncate">
          {displayName.split(' ').slice(0, 2).join(' ')}
        </span>
        <ChevronDown size={11} className={`text-[#AEACA8] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-[#E9E8E3] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {/* Company list */}
          <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold text-[#AEACA8] uppercase tracking-widest">Company</p>
          {list.map(c => (
            <button
              key={c.guid || c.name}
              onClick={() => { selectCompany(c); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F4EF] transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-md bg-[#1A1A1A] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {c.name?.[0]}
              </div>
              <span className="flex-1 text-sm text-[#1A1A1A] truncate font-medium">{c.name}</span>
              {current?.guid === c.guid && <Check size={13} className="text-[#1A1A1A] flex-shrink-0" />}
            </button>
          ))}

        </div>
      )}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const navGroups = [
  { label: null, items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    label: 'Transactions',
    items: [
      { label: 'Sales',               icon: TrendingUp,    path: '/sales' },
      { label: 'Purchase',            icon: ShoppingCart,  path: '/purchase' },
      { label: 'Inventory',           icon: Package,       path: '/inventory' },
      { label: 'Expenses',            icon: Receipt,       path: '/expenses' },
      { label: 'Payments & Receipts', icon: CreditCard,    path: '/payments' },
      { label: 'Parties',             icon: Building2,     path: '/parties' },
    ],
  },
  {
    label: 'Financials',
    items: [
      { label: 'Cash & Bank',            icon: Landmark,       path: '/financials/cash-bank' },
      { label: 'Receivables & Payables', icon: ArrowLeftRight, path: '/financials/receivables-payables' },
      { label: 'Loans & ODs',            icon: CreditCard,     path: '/financials/loans-ods' },
      { label: 'Reports',                icon: FileBarChart2,  path: '/financials/reports' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'GST',         icon: ShieldCheck,   path: '/compliance/gst' },
      { label: 'E-Way Bill',  icon: Truck,         path: '/compliance/eway-bill' },
      { label: 'E-Invoice',   icon: FileText,      path: '/compliance/einvoice' },
      { label: 'Other Taxes', icon: Receipt,       path: '/compliance/other-taxes' },
      { label: 'Day Book', icon: ClipboardList, path: '/compliance/audit-trail' },
    ],
  },
  {
    label: null,
    items: [
      { label: 'Ledgers',       icon: BookOpen, path: '/ledgers' },
      { label: 'AI Insights',   icon: Sparkles, path: '/ai-insights' },
      { label: 'Notifications', icon: Bell,     path: '/notifications' },
      { label: 'Settings',      icon: Settings, path: '/settings' },
    ],
  },
];

const createMenu = [
  { label: 'Sales',      items: ['Create Invoice','Sales Order','Delivery Note','Credit Note'] },
  { label: 'Purchase',   items: ['Purchase Invoice','Purchase Order','Debit Note'] },
  { label: 'Voucher',    items: ['Payment Voucher','Receipt Voucher','Contra Voucher','Journal Voucher'] },
  { label: 'Financials', items: ['Record Payment','Record Receipt','Record Expense'] },
];

// ─── Shell ────────────────────────────────────────────────────────────────────
export default function AppShell() {
  const [collapsed, setCollapsed] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState('Sales');
  const [activeForm, setActiveForm] = useState(null);
  const createRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const h = e => { if (createRef.current && !createRef.current.contains(e.target)) setShowCreate(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    return path.split('/').filter(Boolean)
      .map(p => p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      .join(' / ');
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F5F4EF' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-white border-r border-[#E9E8E3] flex flex-col transition-all duration-200 flex-shrink-0`}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#F5F4EF]">
          <div className="w-7 h-7 rounded-lg bg-[#1A1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">T</div>
          {sidebarOpen && <span className="text-sm font-semibold text-[#1A1A1A] tracking-tight">TallyDekho</span>}
        </div>

        {/* Search */}
        {sidebarOpen && (
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#F5F4EF] border border-[#E9E8E3] text-[#AEACA8] text-xs cursor-pointer hover:border-[#D4D3CE] transition-colors">
              <Search size={12} />
              <span>Search...</span>
              <span className="ml-auto text-[10px] bg-white px-1.5 py-0.5 rounded border border-[#E9E8E3] font-medium">⌘K</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navGroups.map((group, gi) => (
            <div key={gi} className="mb-1">
              {group.label && sidebarOpen && (
                <button
                  onClick={() => setCollapsed(p => ({ ...p, [group.label]: !p[group.label] }))}
                  className="flex items-center justify-between w-full px-2 py-1 text-[10px] font-semibold text-[#AEACA8] uppercase tracking-widest hover:text-[#787774] mt-2 transition-colors"
                >
                  {group.label}
                  {collapsed[group.label] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </button>
              )}
              {!collapsed[group.label] && group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-[#1A1A1A] text-white font-medium'
                        : 'text-[#787774] hover:text-[#1A1A1A] hover:bg-[#F5F4EF]'
                    }`
                  }
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <item.icon size={14} className="flex-shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-t border-[#F5F4EF]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F5F4EF] cursor-pointer transition-colors">
              <Building2 size={12} className="text-[#AEACA8] flex-shrink-0" />
              <span className="text-xs text-[#787774] truncate">Company</span>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="h-12 bg-white border-b border-[#E9E8E3] flex items-center px-5 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="text-[#AEACA8] hover:text-[#1A1A1A] transition-colors p-1 rounded-lg hover:bg-[#F5F4EF]"
          >
            <Menu size={16} />
          </button>

          <span className="text-sm font-semibold text-[#1A1A1A] hidden md:block">{getBreadcrumb()}</span>
          <div className="flex-1" />

          <GlobalSearch />

          {/* FY Selector — global, always visible */}
          <FYSelector />

          {/* Create+ */}
          <div className="relative" ref={createRef}>
            <button
              onClick={() => setShowCreate(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors"
            >
              <Plus size={13} /> Create
              <ChevronDown size={11} className={`transition-transform ${showCreate ? 'rotate-180' : ''}`} />
            </button>

            {showCreate && (
              <div className="absolute top-full right-0 mt-2 z-50 flex bg-white rounded-xl border border-[#E9E8E3] shadow-lg overflow-hidden" style={{ minWidth: 360 }}>
                <div className="w-36 border-r border-[#F5F4EF] py-1 bg-[#F5F4EF]">
                  {createMenu.map(g => (
                    <button
                      key={g.label}
                      onMouseEnter={() => setHoveredGroup(g.label)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                        hoveredGroup === g.label
                          ? 'bg-white text-[#1A1A1A] font-semibold border-r-2 border-[#1A1A1A]'
                          : 'text-[#787774] hover:text-[#1A1A1A]'
                      }`}
                    >
                      {g.label}<ChevronRight size={12} />
                    </button>
                  ))}
                </div>
                <div className="w-52 py-1">
                  <p className="px-4 py-2 text-[10px] font-semibold text-[#AEACA8] uppercase tracking-widest">{hoveredGroup}</p>
                  {createMenu.find(g => g.label === hoveredGroup)?.items.map(item => (
                    <button
                      key={item}
                      onClick={() => { setActiveForm(item); setShowCreate(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F4EF] transition-colors"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <SyncStatus />
          <div className="h-5 w-px bg-[#E9E8E3]" />
          <CompanySwitcher />

          <button
            onClick={() => navigate('/notifications')}
            className="relative text-[#AEACA8] hover:text-[#1A1A1A] transition-colors p-1 rounded-lg hover:bg-[#F5F4EF]"
          >
            <Bell size={16} />
            {(() => {
              try {
                const stored = localStorage.getItem('notifications');
                const items = stored ? JSON.parse(stored) : null;
                const count = Array.isArray(items) ? items.filter(n => !n.read).length : 0;
                return count > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#C0392B] text-white text-[9px] flex items-center justify-center font-bold">
                    {count > 9 ? '9+' : count}
                  </span>
                ) : null;
              } catch { return null; }
            })()}
          </button>

          <UserMenu user={user} onLogout={() => { logout(); navigate('/auth/login'); }} />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#F5F4EF' }}>
          <div className="px-8 py-6 w-full max-w-screen-2xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <CreateModal formKey={activeForm} onClose={() => setActiveForm(null)} />
    </div>
  );
}
