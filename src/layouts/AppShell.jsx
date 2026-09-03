import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Package, Receipt,
  Landmark, ArrowLeftRight, FileBarChart2, ShieldCheck, Truck, FileText, ClipboardList,
  BookOpen, Sparkles, Bell, Settings as SettingsIcon, ChevronDown, ChevronRight, Menu, X,
  Search, Plus, Check, Wallet, LogOut, User, CornerDownLeft, PanelLeftClose, PanelLeft, Zap, Unplug,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CreateDrawer, CreateContext } from '../components/create/CreateDrawer';
import { useNotifications } from '../services/notifications';
import { useClickOutside, useLabelT } from '../components/kit';
import NotificationDrawer from '../components/NotificationDrawer';
import OfflineBadge from '../components/OfflineBadge';
import api from '../services/api';
import { useTranslation } from 'react-i18next';

// Portal nav labels → shared mobile translation keys (untranslated labels stay English).
const NAV_I18N = {
  Dashboard: 'nav.dashboard', Sales: 'nav.sales', Purchase: 'nav.purchase',
  Inventory: 'portalNav.inventory', Ledgers: 'portalNav.ledgers', Settings: 'nav.settings',
  Financials: 'portalNav.financials', Transactions: 'portalNav.transactions',
  Vouchers: 'portalNav.vouchers', Expenses: 'portalNav.expenses',
  Compliance: 'portalNav.compliance', 'AI Insights': 'portalNav.aiInsights',
  'Audit Trail': 'portalNav.auditTrail',
  Books: 'portalNav.books',
};

const NAV = [
  { items: [{ label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true }] },
  {
    label: 'Transactions',
    items: [
      { label: 'Sales', icon: TrendingUp, to: '/sales' },
      { label: 'Purchase', icon: ShoppingCart, to: '/purchase' },
      { label: 'Vouchers', icon: Wallet, to: '/vouchers' },
      { label: 'Inventory', icon: Package, to: '/inventory' },
      { label: 'Expenses', icon: Receipt, to: '/expenses' },
    ],
  },
  {
    label: 'Books',
    items: [
      { label: 'Financials', icon: Landmark, to: '/financials' },
      { label: 'Compliance', icon: ShieldCheck, to: '/compliance' },
      { label: 'Ledgers', icon: BookOpen, to: '/ledgers' },
      { label: 'Audit Trail', icon: ClipboardList, to: '/audit-trail' },
    ],
  },
  {
    divider: true,
    items: [
      { label: 'AI Insights', icon: Sparkles, to: '/ai-insights' },
      { label: 'Settings', icon: SettingsIcon, to: '/settings' },
    ],
  },
];

const CREATE_MENU = [
  { label: 'Sales', items: [['Sales Invoice', 'sales-invoice'], ['Sales Order', 'sales-order'], ['Delivery Note', 'delivery-note'], ['Credit Note', 'credit-note'], ['Proforma', 'proforma'], ['Quotation', 'quotation']] },
  { label: 'Purchase', items: [['Purchase Invoice', 'purchase-invoice'], ['Purchase Order', 'purchase-order'], ['Debit Note', 'debit-note']] },
  { label: 'Voucher', items: [['Payment', 'payment'], ['Receipt', 'receipt'], ['Journal', 'journal'], ['Contra', 'contra'], ['Expense', 'expense']] },
  { label: 'Masters', items: [['Party', 'party'], ['Ledger', 'ledger'], ['Stock Item', 'stock-item'], ['Warehouse', 'warehouse']] },
  { label: 'Inventory', items: [['Stock Transfer', 'stock-transfer'], ['Stock Adjustment', 'stock-adjustment']] },
];

const SEARCH_TARGETS = NAV.flatMap(g => g.items).concat([
  { label: 'Stock Items', to: '/inventory/items' }, { label: 'Warehouses', to: '/inventory/warehouses' },
  { label: 'Stock Ledger', to: '/inventory/stock-ledger' }, { label: 'Reorder Queue', to: '/inventory/reorder-queue' },
  { label: 'Negative Stock', to: '/inventory/negative-stock' }, { label: 'Barcodes', to: '/inventory/barcodes' },
  { label: 'Aged Items', to: '/inventory/aged-items' }, { label: 'Expiry Schedule', to: '/inventory/expiry-schedule' },
  { label: 'Payment Vouchers', to: '/vouchers/payment' }, { label: 'Receipt Vouchers', to: '/vouchers/receipt' },
  { label: 'Journal Vouchers', to: '/vouchers/journal' }, { label: 'Contra Vouchers', to: '/vouchers/contra' },
  { label: 'Profit & Loss', to: '/financials/profit-loss' }, { label: 'Balance Sheet', to: '/financials/balance-sheet' },
  { label: 'Trial Balance', to: '/financials/trial-balance' },
  { label: 'Cash Register', to: '/financials/cash-register' }, { label: 'Receivables', to: '/kpi/receivables' },
  { label: 'Payables', to: '/kpi/payables' }, { label: 'Bank Balance', to: '/kpi/bank-balance' },
  { label: 'Loans & ODs', to: '/kpi/loans-ods' }, { label: 'Stock Value', to: '/inventory' },
  { label: 'Tally Sync', to: '/settings/tally-sync' }, { label: 'Audit Trail', to: '/audit-trail' },
  { label: 'Day Book', to: '/audit-trail/daybook' },
]);

function Dropdown({ trigger, children, width = 230, testid, className = '', up = false, triggerClassName }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        data-testid={testid}
        onClick={() => setOpen(o => !o)}
        className={triggerClassName || `flex h-11 items-center gap-2.5 rounded-lg border border-line bg-surface px-4 transition-colors hover:border-line-strong hover:bg-cream outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${className}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`pop absolute z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-lg ${up ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}
          style={{ width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Where a data search hit navigates in the portal (mobile routes → portal routes).
function dataResultTarget(r) {
  if (r.kind === 'voucher') return `/audit-trail/daybook?voucher=${encodeURIComponent(r.guid)}`;
  if (r.kind === 'ledger') return `/ledgers?ledger=${encodeURIComponent(r.guid)}`;
  if (r.kind === 'stock') return r.guid ? `/inventory/items/${encodeURIComponent(r.guid)}` : '/inventory/items';
  return '/';
}

function CommandPalette() {
  const lt = useLabelT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [dataHits, setDataHits] = useState([]);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const { selectedCompany } = useAuth();

  // Mobile-parity data search: vouchers + ledgers + stock items via /api/dashboard/search.
  useEffect(() => {
    const n = q.trim();
    if (!open || n.length < 2 || !selectedCompany?.guid) { setDataHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await api.searchGlobal(selectedCompany.guid, n);
        if (alive) setDataHits(Array.isArray(res?.data) ? res.data : []);
      } catch { if (alive) setDataHits([]); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, selectedCompany?.guid]);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    const screens = (n ? SEARCH_TARGETS.filter(t => t.label.toLowerCase().includes(n)) : SEARCH_TARGETS)
      .slice(0, n ? 4 : 8).map(t => ({ ...t, kind: 'screen' }));
    const data = dataHits.slice(0, 8).map(d => ({
      label: d.label,
      sub: [d.party, d.subtitle].filter(Boolean).join(' · '),
      kind: d.kind,
      to: dataResultTarget(d),
    }));
    return [...data, ...screens].slice(0, 10);
  }, [q, dataHits]);

  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const go = t => { navigate(t.to); setOpen(false); setQ(''); inputRef.current?.blur(); };

  const wrapRef = useRef(null);
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={wrapRef} data-testid="global-search-trigger" className="relative hidden w-full max-w-[560px] md:block">
      <div
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
        className={`flex h-11 cursor-text items-center gap-3 rounded-lg border bg-surface px-4 transition-[border-color,box-shadow] duration-200 ease-out ${open ? 'border-[rgba(26,26,26,0.35)] shadow-[0_0_0_2px_rgba(26,26,26,0.07)]' : 'border-line hover:border-line-strong'}`}
      >
        <Search size={16} strokeWidth={2} className="flex-shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          data-testid="global-search-input"
          aria-label={lt('Search transactions, parties...')}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setI(0); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(results.length - 1, x + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
            if (e.key === 'Enter' && results[i]) go(results[i]);
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          }}
          placeholder={lt('Search transactions, parties...')}
          style={{ outline: 'none' }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-faint"
        />
        <span className="ml-auto flex-shrink-0 rounded-md bg-paper-2 px-2 py-0.5 text-xs font-bold text-ink-soft">⌘K</span>
      </div>

      {open && (
        <div data-testid="global-search-results" className="pop absolute left-0 right-0 top-full z-[120] mt-2 max-h-[52vh] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg">
          {results.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">{lt('No matches')}</p>}
          {results.map((r, k) => (
            <button
              key={r.to + r.label}
              data-testid={`search-result-${r.kind || 'screen'}-${k}`}
              onMouseEnter={() => setI(k)}
              onClick={() => go(r)}
              className={`flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-colors ${k === i ? 'bg-cream ring-1 ring-line' : 'hover:bg-cream/60'}`}
            >
              {r.kind && r.kind !== 'screen' && (
                 <span className="rounded-md bg-paper-2 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  {r.kind === 'voucher' ? lt('Voucher') : r.kind === 'ledger' ? lt('Party') : lt('Stock')}
                </span>
              )}
              <span className="truncate text-sm font-bold text-ink">{r.kind === 'screen' ? lt(r.label) : r.label}</span>
              <span className={`ml-auto flex-shrink-0 text-xs ${k === i ? 'font-medium text-ink-soft' : 'text-ink-faint'}`}>{r.sub || r.to}</span>
              {k === i && <CornerDownLeft size={14} strokeWidth={2} className="flex-shrink-0 text-ink-soft" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { t } = useTranslation();
  const lt = useLabelT();
  const navLabel = l => (NAV_I18N[l] ? t(NAV_I18N[l], { defaultValue: l }) : lt(l));
  const [collapsed, setCollapsed] = useState({});
  const [mini, setMini] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [createReq, setCreateReq] = useState(null);
  const openCreate = useCallback((kind, prefill) => setCreateReq({ kind, prefill }), []);
  const [hoverGroup, setHoverGroup] = useState('Sales');
  const [showCreate, setShowCreate] = useState(false);
  const createRef = useClickOutside(() => setShowCreate(false));
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, companies, selectedCompany, selectCompany, selectedFY, selectFY, isPaired, isDesktopOnline, unpairFromTally, showToast } = useAuth();
  const [unpairing, setUnpairing] = useState(false);

  useEffect(() => { setMobileNav(false); }, [location.pathname]);

  const crumbs = useMemo(() => {
    if (location.pathname === '/') return ['Dashboard'];
    return location.pathname.split('/').filter(Boolean).map(p => p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  }, [location.pathname]);

  const { unread, refresh: refreshNotifs } = useNotifications(selectedCompany?.guid);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (selectedCompany?.guid) refreshNotifs();
  }, [selectedCompany?.guid, refreshNotifs]);
  const company = selectedCompany || companies[0];
  const years = company?.years || [];
  const fy = selectedFY || years[0];
  const name = user?.name || 'Account';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);

  return (
    <div className="flex h-screen gap-0 overflow-hidden bg-paper p-0 lg:gap-4 lg:p-4">
      {mobileNav && <div className="fade fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)} />}

      {/* Sidebar — floating rounded panel */}
      <aside
        data-testid="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex ${mini ? 'lg:w-[84px]' : 'lg:w-[258px]'} w-[266px] flex-shrink-0 flex-col rounded-none border-r border-line bg-paper-2 transition-[transform,width] duration-300 lg:static lg:rounded-2xl lg:border lg:bg-surface/50 ${
          mobileNav ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          {!mini ? (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">T</span>
              <div className="min-w-0">
                <p className="display text-base font-bold leading-none text-ink tracking-tight">TallyDekho</p>
              </div>
            </div>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white mx-auto">T</span>
          )}
          <button className="text-ink-soft hover:text-ink lg:hidden" onClick={() => setMobileNav(false)}><X size={20} strokeWidth={2} /></button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-2">
              {group.divider && <div className="mx-2 my-4 border-t border-line" />}
              {group.label && !mini && (
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [group.label]: !c[group.label] }))}
                  className="flex w-full items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft transition-colors hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 rounded-md"
                >
                  {navLabel(group.label)}
                  {collapsed[group.label] ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
                </button>
              )}
              {!collapsed[group.label] && group.items.map(item => {
                const badge = item.badge || null;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={navLabel(item.label)}
                    data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className={({ isActive }) =>
                      `group relative mb-1 flex items-center gap-3 rounded-xl py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 text-sm font-semibold transition-[background-color,color] duration-150 ${
                        isActive
                          ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                          : 'text-ink-soft hover:bg-surface/50 hover:text-ink'
                      } ${mini ? 'justify-center px-0' : 'px-3'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
                        {!mini && <span className="truncate">{navLabel(item.label)}</span>}
                        {!mini && badge && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-md bg-ink px-1.5 text-xs font-bold text-white">
                            {badge}
                          </span>
                        )}
                        {mini && badge && <span className="absolute right-3 top-2.5 h-2 w-2 rounded-[3px] bg-neg" />}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profile + Tally status + collapse control */}
        <div className="flex-shrink-0 px-4 pb-5">
          <Dropdown
            up
            testid="user-menu-button"
            width={240}
            triggerClassName={`flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-cream outline-none focus-visible:ring-2 focus-visible:ring-ink ${mini ? 'justify-center px-0' : ''}`}
            trigger={<>
              <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-paper-2 text-xs font-bold text-ink">
                {initials}
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${isPaired && isDesktopOnline ? 'bg-pos' : isPaired ? 'bg-warn' : 'bg-warn'}`} />
              </span>
              {!mini && (
                <>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-bold text-ink">{name}</span>
                    <span className={`block truncate text-xs font-semibold ${isPaired && isDesktopOnline ? 'text-pos' : isPaired ? 'text-warn' : 'text-warn'}`}>
                      {isPaired ? (isDesktopOnline ? lt('Tally connected') : lt('Tally paired · offline')) : lt('Connect Tally')}
                    </span>
                  </span>
                  <ChevronDown size={14} strokeWidth={2} className="rotate-180 text-ink-faint" />
                </>
              )}
            </>}
          >
            <div className="px-5 py-4">
              <p className="display text-base font-bold text-ink">{name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">{user?.email || user?.mobile}</p>
            </div>
            <div className="border-t border-line p-2">
              <button
                data-testid="sidebar-sync-cta"
                onClick={() => navigate('/settings/tally-sync')}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink-soft transition-colors hover:bg-cream hover:text-ink"
              >
                <Zap size={16} strokeWidth={2} className={isPaired && isDesktopOnline ? 'text-pos' : 'text-warn'} />
                <span className="flex-1">{isPaired ? (isDesktopOnline ? lt('Tally connected') : lt('Tally paired · offline')) : lt('Connect Tally')}</span>
                <span className="text-xs font-bold text-ink-faint">{lt('Sync settings')}</span>
              </button>
              <button
                data-testid="sidebar-unpair"
                disabled={unpairing}
                onClick={async () => {
                  setUnpairing(true);
                  try { await unpairFromTally(); }
                  catch (err) { showToast(err?.message || 'Unpair failed', 'warning'); }
                  finally { setUnpairing(false); }
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-alert transition-colors hover:bg-neg-bg disabled:opacity-40"
              >
                <Unplug size={16} strokeWidth={2} />
                {unpairing ? lt('Unpairing…') : lt('Unpair Tally')}
              </button>
              <button onClick={() => navigate('/settings/profile')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink-soft transition-colors hover:bg-cream hover:text-ink">
                <User size={16} strokeWidth={2} /> {t('nav.profile', 'Profile')}
              </button>
              <button onClick={() => navigate('/settings')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink-soft transition-colors hover:bg-cream hover:text-ink">
                <SettingsIcon size={16} strokeWidth={2} /> {t('nav.settings', 'Settings')}
              </button>
              <button
                data-testid="logout-button"
                onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-alert transition-colors hover:bg-neg-bg"
              >
                <LogOut size={16} strokeWidth={2} /> {lt('Sign out')}
              </button>
            </div>
          </Dropdown>

          <button
            onClick={() => setMini(m => !m)}
            data-testid="sidebar-collapse-toggle"
            className="mt-3 hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface/50 hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink lg:flex"
          >
            {mini ? <PanelLeft size={18} strokeWidth={2} /> : <><PanelLeftClose size={18} strokeWidth={2} /> {lt('Collapse sidebar')}</>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {/* Top bar — floating rounded */}
        <header className="flex h-16 flex-shrink-0 items-center gap-4 border-b border-line bg-surface px-4 sm:px-6 lg:rounded-2xl lg:border">
          <button data-testid="mobile-nav-toggle" onClick={() => setMobileNav(v => !v)} className="rounded-lg p-2 text-ink hover:bg-cream outline-none focus-visible:ring-2 focus-visible:ring-ink lg:hidden">
            <Menu size={20} strokeWidth={2} />
          </button>

          <div className="hidden min-w-0 flex-1 md:block"><CommandPalette /></div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:hidden">
            {crumbs.slice(-2).map((c, i, a) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight size={14} className="text-ink-faint" />}
                <span className={`truncate text-sm ${i === a.length - 1 ? 'font-bold text-ink' : 'font-medium text-ink-soft'}`}>{lt(c)}</span>
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <OfflineBadge />
            <Dropdown
              testid="company-switcher-button"
              width={270}
              trigger={<>
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">{(company?.name || 'A')[0]}</span>
                <span className="hidden max-w-[130px] truncate text-sm font-bold text-ink lg:block">{company?.name}</span>
                <ChevronDown size={14} strokeWidth={2} className="hidden text-ink-faint lg:block" />
              </>}
            >
              <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">{lt('Company')}</p>
              {(companies || []).map(c => (
                <button key={c.guid} onClick={() => selectCompany(c)} data-testid={`company-option-${c.guid}`}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-cream">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-paper-2 text-xs font-bold text-ink">{c.name[0]}</span>
                  <span className="flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
                  {company?.guid === c.guid && <Check size={16} strokeWidth={2.5} className="text-ink" />}
                </button>
              ))}
            </Dropdown>

            <Dropdown
              testid="fy-selector-button"
              width={190}
              trigger={<>
                <span className="text-xs font-bold text-ink-soft">FY</span>
                <span className="text-sm font-bold text-ink">{fy?.name || '2025-26'}</span>
                <ChevronDown size={14} strokeWidth={2} className="text-ink-faint" />
              </>}
            >
              <p className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">{lt('Financial year')}</p>
              {[...years].reverse().map(y => (
                <button key={y.uniqueId} onClick={() => selectFY(y)} data-testid={`fy-option-${y.name}`}
                  className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-cream">
                  <span className="text-sm font-bold text-ink">FY {y.name}</span>
                  {fy?.uniqueId === y.uniqueId && <Check size={16} strokeWidth={2.5} className="text-ink" />}
                </button>
              ))}
            </Dropdown>

            <button
              data-testid="notifications-button"
              onClick={() => setNotifOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:bg-cream hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
            >
              <Bell size={18} strokeWidth={2} />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-alert px-1.5 text-xs font-bold text-white ring-2 ring-surface">
                  {unread}
                </span>
              )}
            </button>

            <div className="relative" ref={createRef}>
              <button
                data-testid="create-button"
                onClick={() => setShowCreate(s => !s)}
                className="flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-white transition-colors hover:bg-[#2E2E2B] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <Plus size={18} strokeWidth={2.5} />
                <span className="hidden text-sm font-bold sm:inline">{t('common.create', 'Create')}</span>
              </button>
              {showCreate && (
                <div className="pop absolute right-0 top-full z-[80] mt-2 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:flex-row" style={{ minWidth: 260 }}>
                  <div className="flex gap-1 overflow-x-auto bg-paper-2 p-2 sm:w-[140px] sm:flex-col sm:overflow-visible">
                    {CREATE_MENU.map(g => (
                      <button
                        key={g.label}
                        onMouseEnter={() => setHoverGroup(g.label)}
                        onClick={() => setHoverGroup(g.label)}
                        className={`flex flex-shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:w-full ${
                          hoverGroup === g.label ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-soft hover:text-ink hover:bg-surface/50'
                        }`}
                      >
                        {lt(g.label)}<ChevronRight size={14} strokeWidth={2} className="hidden sm:block opacity-50" />
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 p-2 sm:min-w-[220px]">
                    {CREATE_MENU.find(g => g.label === hoverGroup)?.items.map(([label, kind]) => (
                      <button
                        key={kind}
                        data-testid={`create-${kind}`}
                        onClick={() => { openCreate(kind); setShowCreate(false); }}
                        className="w-full rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-cream"
                      >
                        {lt(label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-8">
          <div className="w-full px-4 sm:px-6 lg:px-2">
            <CreateContext.Provider value={openCreate}>
              <Outlet />
            </CreateContext.Provider>
          </div>
        </main>
      </div>

      <CreateDrawer kind={createReq?.kind} prefill={createReq?.prefill} open={!!createReq} onClose={() => setCreateReq(null)} />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
