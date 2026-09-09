// TallyDekho UI kit — soft rounded widget surfaces on cream, ink accents.
import { useState, useMemo, useEffect, useRef, useContext, createContext, forwardRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useSearchParams } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, X, Inbox, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpRight, Download, SlidersHorizontal, Check, Bell,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/* ── i18n label helper ─────────────────────────────────────────────────────
   Portal strings live in a flat `portal.labels` dictionary keyed by a slug of
   the English text (shared-format with mobile locale JSONs). Unknown strings
   fall back to the English default, so untranslated labels never break. */
export const labelKey = s =>
  `portal.labels.${String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

/** Returns lt(str): translates a static English UI string, falling back to itself. Stable ref — safe in useCallback/useEffect deps. */
export function useLabelT() {
  const { t } = useTranslation();
  return useCallback(
    s => (typeof s === 'string' && /[a-zA-Z]/.test(s) ? t(labelKey(s), s) : s),
    [t],
  );
}

/* ── Page scaffolding ─────────────────────────────────────────────────────── */
export function Page({ title, subtitle, actions, children, testid }) {
  const lt = useLabelT();
  return (
    <div data-testid={testid} className="rise space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div className="min-w-0">
          <h1 className="display text-3xl font-bold text-ink">{lt(title)}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{lt(subtitle)}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Card({ className = '', children, ...rest }) {
  return <div className={`rounded-xl border border-line bg-surface shadow-none ${className}`} {...rest}>{children}</div>;
}

export function SectionTitle({ children, right }) {
  const lt = useLabelT();
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <p className="overline text-ink">{lt(children)}</p>
      {right}
    </div>
  );
}

export function Panel({ title, sub, right, children, className = '', testid }) {
  const lt = useLabelT();
  return (
    <section className={`rounded-xl border border-line bg-surface p-6 shadow-none ${className}`} data-testid={testid}>
      {(title || right) && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="display text-xl font-bold text-ink">{lt(title)}</h3>}
            {sub && <p className="mt-1 text-xs text-ink-faint">{lt(sub)}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */
const base =
  'group inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-bold whitespace-nowrap select-none disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper';
const kinds = {
  primary: 'bg-ink text-white hover:bg-ink/90 shadow-sm border border-transparent',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-cream shadow-sm',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-cream hover:text-ink',
  danger: 'bg-neg text-white hover:bg-neg/90 shadow-sm border border-transparent',
};
export const Button = forwardRef(({ variant = 'secondary', className = '', children, ...rest }, ref) => {
  return <button ref={ref} className={`${base} ${kinds[variant]} ${className}`} {...rest}>{children}</button>;
});
Button.displayName = 'Button';

export function IconButton({ className = '', children, ...rest }) {
  return (
    <button className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 transition-colors duration-150 hover:bg-cream hover:text-ink ${className}`} {...rest}>
      {children}
    </button>
  );
}

/* ── Pills / status ───────────────────────────────────────────────────────── */
const tones = {
  pos: 'text-pos bg-pos-bg',
  neg: 'text-neg bg-neg-bg',
  warn: 'text-warn bg-warn-bg',
  note: 'text-note bg-note-bg',
  neutral: 'text-ink-soft bg-paper-2',
  ink: 'text-white bg-ink',
};
export function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold uppercase tracking-wider ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

export const STATUS_TONE = {
  Paid: 'pos', Synced: 'pos', synced: 'pos', Active: 'pos', Matched: 'pos', Generated: 'pos', Filed: 'pos', OK: 'pos', Accepted: 'pos', Connected: 'pos',
  Pending: 'warn', pending: 'warn', Low: 'warn', Due: 'warn', Partial: 'warn', Unmatched: 'warn',
  Overdue: 'neg', Failed: 'neg', failed: 'neg', Negative: 'neg', Cancelled: 'neg', Expired: 'neg', Rejected: 'neg',
  Draft: 'neutral', Closed: 'neutral',
};
export function Status({ value }) {
  if (value == null || value === '') return <span className="text-ink-faint">—</span>;
  return <Pill tone={STATUS_TONE[value] || 'neutral'}>{String(value)}</Pill>;
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */
export function Stat({ label, value, sub, tone = '#181818', icon: Icon, delta, deltaInvert = false, onClick, loading, testid }) {
  const lt = useLabelT();
  label = lt(label);
  sub = lt(sub);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      data-testid={testid}
      className={`group relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface p-5 text-left transition-[box-shadow,transform,border-color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm' : ''
      }`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: tone }} />
      <div className="flex items-start justify-between gap-2">
        {Icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${tone}1A` }}>
            <Icon size={16} strokeWidth={2} style={{ color: tone }} />
          </span>
        ) : (
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-soft uppercase tracking-wider">
            <span className="h-2 w-2 rounded-sm" style={{ background: tone }} />
            {label}
          </span>
        )}
        {onClick && <ArrowUpRight size={16} strokeWidth={2} className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      {Icon && <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>}
      {loading ? (
        <div className="mt-4 h-8 w-28 animate-pulse rounded-md bg-cream" />
      ) : (
        <p className={`display text-3xl font-bold leading-none tabular text-ink ${Icon ? 'mt-1.5' : 'mt-4'}`}>{value}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {delta != null && Number(delta) === 0 && (
          <span className="inline-flex items-center rounded-full bg-paper-2 px-2 py-0.5 text-xs font-bold text-ink">0%</span>
        )}
        {delta != null && Number(delta) !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${(deltaInvert ? delta > 0 : delta < 0) ? 'text-neg' : 'text-pos'}`}>
            {delta < 0 ? <ArrowDown size={12} strokeWidth={2.5} /> : <ArrowUp size={12} strokeWidth={2.5} />}
            {Math.abs(delta)}%
          </span>
        )}
        {sub && <p className="truncate text-xs text-ink-faint">{sub}</p>}
      </div>
    </Tag>
  );
}

/* ── Segment bar — mobile-style block meter ───────────────────────────────── */
export function SegmentBar({ pct, color = '#447B4B', blocks = 20 }) {
  const filled = Math.max(1, Math.round((Math.min(100, Math.max(0, pct)) / 100) * blocks));
  return (
    <span className="flex flex-1 items-center gap-1">
      {Array.from({ length: blocks }).map((_, i) => (
        <span
          key={i}
          className={`h-4 flex-1 rounded-sm ${i < filled ? 'seg-fill' : ''}`}
          style={{
            background: i < filled ? color : 'rgba(26,26,26,0.06)',
            ...(i < filled ? { animationDelay: `${0.15 + i * 0.035}s` } : {}),
          }}
        />
      ))}
    </span>
  );
}

export function StatGrid({ items, cols = 4, loading }) {
  const map = {
    2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5', 6: 'sm:grid-cols-3 lg:grid-cols-6', 8: 'sm:grid-cols-4 lg:grid-cols-8',
  };
  return (
    <div className={`stagger grid grid-cols-2 gap-4 ${map[cols] || map[4]}`}>
      {items.map((it, i) => <Stat key={i} loading={loading} {...it} />)}
    </div>
  );
}

/* ── Segmented tabs (pill) ────────────────────────────────────────────────── */
export function Tabs({ tabs, value, onChange, testid }) {
  const lt = useLabelT();
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm" data-testid={testid}>
      {tabs.map(t => {
        const key = t.key ?? t;
        const label = t.label ?? t;
        const active = key === value;
        return (
          <button
            key={key}
            data-testid={`tab-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            onClick={() => onChange(key)}
            className={`h-8 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${
              active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream hover:text-ink'
            }`}
          >
            {lt(label)}
            {t.count != null && <span className="ml-1.5 opacity-60">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Segmented route tabs — inner nav for small modules ───────────────────── */
export function SegTabs({ items, testid = 'module-tabs', variant = 'pill' }) {
  const lt = useLabelT();
  if (variant === 'underline') {
    return (
      <div className="flex border-b border-line" data-testid={testid}>
        <div className="-mb-px flex max-w-full flex-wrap items-center gap-4">
          {items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end !== false}
              data-testid={`module-tab-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              className={({ isActive }) =>
                `flex h-10 items-center whitespace-nowrap border-b-2 px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ink transition-colors duration-150 ${
                  isActive
                    ? 'border-ink font-bold text-ink'
                    : 'border-transparent font-semibold text-ink-soft hover:border-line-strong hover:text-ink'
                }`
              }
            >
              {lt(it.label)}
              {it.badge != null && (
                <span className="ml-1.5 rounded-full bg-cream px-1.5 text-xs tabular-nums text-ink-soft">{it.badge}</span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex" data-testid={testid}>
      <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end !== false}
            data-testid={`module-tab-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            className={({ isActive }) =>
              `flex h-8 items-center whitespace-nowrap rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 transition-colors duration-150 ${
                isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream hover:text-ink'
              }`
            }
          >
            {lt(it.label)}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

/* ── Module view — content block inside a module workspace ─────────────────── */
export function ModuleView({ title, sub, actions, children, testid = 'module-view' }) {
  const lt = useLabelT();
  title = lt(title);
  sub = lt(sub);
  return (
    <div className="space-y-6" data-testid={testid}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="display text-2xl font-bold text-ink">{title}</h2>}
            {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Drawer state in the URL so refresh / share keeps the panel open ──────── */
export function useDrawerParam(key) {
  const [sp, setSp] = useSearchParams();
  const value = sp.get(key);
  const set = v => {
    const next = new URLSearchParams(sp);
    if (v == null || v === '') next.delete(key);
    else next.set(key, String(v));
    setSp(next);
  };
  return [value, set];
}

/* ── Route sub-navigation ─────────────────────────────────────────────────── */
export function SubNav({ items, testid }) {
  const lt = useLabelT();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      {items.map(it => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          data-testid={`subnav-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          className={({ isActive }) =>
            `inline-flex h-9 items-center whitespace-nowrap rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 transition-colors duration-150 ${
              isActive ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
            }`
          }
        >
          {lt(it.label)}
        </NavLink>
      ))}
    </div>
  );
}

/* ── Period selector (7d ⌄ style) ─────────────────────────────────────────── */
export function PeriodSelect({ options, value, onChange, testid }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        data-testid={testid}
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 transition-colors hover:border-line-strong hover:bg-cream"
      >
        {value}
        <ChevronDown size={14} strokeWidth={2} className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pop absolute right-0 top-full z-[70] mt-2 w-40 overflow-hidden rounded-xl border border-line bg-surface shadow-md">
          {options.map(o => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${o === value ? 'bg-cream font-bold text-ink' : 'font-medium text-ink-soft hover:bg-cream hover:text-ink'}`}
            >
              {o}{o === value && <Check size={14} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Empty / loading ──────────────────────────────────────────────────────── */
export function Empty({ message = 'No records', hint }) {
  const lt = useLabelT();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-paper-2 mb-6">
        <Inbox size={20} strokeWidth={1.5} className="text-ink-soft" />
      </span>
      <p className="display text-xl font-bold text-ink mb-2">{lt(message)}</p>
      {hint && <p className="max-w-sm text-sm text-ink-soft leading-relaxed">{lt(hint)}</p>}
    </div>
  );
}

export function Skeleton({ rows = 7 }) {
  return (
    <div>
      <div className="loading-rule" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-cream" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </div>
  );
}

/* ── Data table ───────────────────────────────────────────────────────────── */
export function TableFilter({ label = 'Filter', value = [], onChange, options = [], testid, notification = false }) {
  const lt = useLabelT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const selected = Array.isArray(value)
    ? value.filter(item => item !== 'all')
    : value && value !== 'all' ? [value] : [];
  const allOption = options.find(option => option.value === 'all');
  const selectableOptions = options.filter(option => option.value !== 'all');
  const selectedOptions = selectableOptions.filter(option => selected.includes(option.value));
  const alertCount = notification ? selectableOptions.length : 0;
  const summary = selectedOptions.length === 0
    ? lt(notification ? label : (allOption?.label || 'All'))
    : selectedOptions.length === 1
      ? lt(selectedOptions[0].label)
      : `${selectedOptions.length} ${lt('selected')}`;

  const toggle = optionValue => {
    if (optionValue === 'all') {
      onChange?.([]);
      return;
    }
    const next = selected.includes(optionValue)
      ? selected.filter(item => item !== optionValue)
      : [...selected, optionValue];
    onChange?.(next);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        data-testid={testid}
        aria-label={lt(label)}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className={`inline-flex h-10 max-w-[240px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold outline-none transition-[border-color,background-color,color,box-shadow] duration-200 ease-out focus:ring-0 ${
          notification && alertCount
            ? 'border-warn/35 bg-warn-bg text-ink hover:border-warn/60'
            : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-cream'
        }`}
      >
        <span className="relative shrink-0">
          {notification ? <Bell size={15} strokeWidth={2.2} className={alertCount ? 'text-warn' : 'text-ink-soft'} /> : <SlidersHorizontal size={15} className="text-ink-soft" />}
          {notification && alertCount > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-warn-bg bg-neg" aria-hidden="true" />}
        </span>
        <span className="truncate">{summary}</span>
        {notification && alertCount > 0 && (
          <span className="rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">{alertCount}</span>
        )}
        {!notification && selectedOptions.length > 1 && (
          <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">{selectedOptions.length}</span>
        )}
        <ChevronDown size={13} className={`ml-auto shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="pop absolute left-0 top-full z-[90] mt-2 max-h-[min(60vh,420px)] min-w-[240px] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg"
          data-testid={`${testid}-menu`}
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{lt(label)}</div>
          {allOption && (
            <button
              type="button"
              role="option"
              aria-selected={selectedOptions.length === 0}
              onClick={() => toggle('all')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                selectedOptions.length === 0 ? 'bg-cream font-bold text-ink' : 'font-medium text-ink-soft hover:bg-cream hover:text-ink'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${selectedOptions.length === 0 ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`}>
                {selectedOptions.length === 0 && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="flex-1">{lt(allOption.label)}</span>
              {allOption.count != null && <span className="text-xs text-ink-faint tabular-nums">{allOption.count}</span>}
            </button>
          )}
          {selectableOptions.map(option => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option.value)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                  checked ? 'bg-cream font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-cream hover:text-ink'
                }`}
              >
                {notification && <span className={`h-2 w-2 shrink-0 rounded-full ${option.tone === 'critical' ? 'bg-neg' : 'bg-warn'}`} />}
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`}>
                  {checked && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="flex-1">{lt(option.label)}</span>
                {option.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${notification ? 'bg-warn-bg text-warn' : 'bg-paper-2 text-ink-soft'}`}>{option.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DataTable({
  columns,
  rows = [],
  onRowClick,
  searchKeys,
  searchPlaceholder = 'Quick search',
  pageSize = 12,
  loading,
  emptyMessage,
  toolbar,
  footer,
  scroll,
  testid = 'data-table',
  selectable,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  rowKey = r => r.id ?? r.guid,
  bottomOverlay,
}) {
  const lt = useLabelT();
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);
  const keys = searchKeys || columns.map(c => c.key);

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const n = q.toLowerCase();
      out = out.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(n)));
    }
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a[key], bv = b[key];
        if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
        return dir === 'asc'
          ? String(av ?? '').localeCompare(String(bv ?? ''))
          : String(bv ?? '').localeCompare(String(av ?? ''));
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort]);

  useEffect(() => { setPage(1); }, [q, sort, rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice((page - 1) * pageSize, page * pageSize);
  const foot = typeof footer === 'function' ? footer(filtered) : footer;

  const toggleSort = key =>
    setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  // Small, self-explanatory tables don't need a search bar.
  const showSearch = toolbar || rows.length > 6;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-none" data-testid={testid}>
      {showSearch && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full shrink-0 sm:w-80">
            <Search size={16} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              data-testid={`${testid}-search`}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={lt(searchPlaceholder)}
              className="h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-4 text-sm font-medium text-ink outline-none transition-[border-color,background-color,box-shadow] duration-200 ease-out placeholder:text-ink-faint hover:border-line-strong focus:border-ink/40 focus:bg-white focus:ring-0"
            />
          </div>
          {toolbar}
          <span className="ml-auto rounded-md bg-paper-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft tabular">
            {t('portal.labels.n-records', '{{count}} records', { count: filtered.length })}
          </span>
        </div>
      )}

      {loading ? (
        <div className="px-5 pb-5"><Skeleton /></div>
      ) : view.length === 0 ? (
        <Empty message={emptyMessage || 'No records'} hint={q ? t('portal.labels.nothing-matches', 'Nothing matches “{{q}}”', { q }) : undefined} />
      ) : (
        <div className={`overflow-x-auto ${scroll ? 'max-h-[min(460px,52vh)] overflow-y-auto' : ''}`}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {selectable && (
                  <th className="sticky top-0 z-10 w-12 bg-paper-2 px-5 py-3">
                    <input
                      type="checkbox"
                      data-testid={`${testid}-select-all`}
                      aria-label="Select all rows"
                      className="h-4 w-4 cursor-pointer accent-ink align-middle rounded-sm"
                      checked={filtered.length > 0 && filtered.every(r => selectedKeys?.has(rowKey(r)))}
                      onChange={() => onToggleAll?.(filtered)}
                    />
                  </th>
                )}
                {columns.map(c => (
                  <th
                    key={c.key}
                    onClick={c.sortable === false ? undefined : () => toggleSort(c.key)}
                    className={`sticky top-0 z-10 whitespace-nowrap bg-paper-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink-soft ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    } ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-ink'}`}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    <span className={`inline-flex items-center gap-1.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {lt(c.label)}
                      {sort?.key === c.key && (sort.dir === 'asc'
                        ? <ArrowUp size={12} strokeWidth={3} className="text-ink" />
                        : <ArrowDown size={12} strokeWidth={3} className="text-ink" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr
                  key={r.id ?? r.guid ?? i}
                  data-testid={`${testid}-row-${i}`}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`border-b border-line-subtle last:border-b-0 transition-colors duration-150 ${onRowClick ? 'cursor-pointer hover:bg-cream' : ''} ${selectable && selectedKeys?.has(rowKey(r)) ? 'bg-cream' : ''}`}
                >
                  {selectable && (
                    <td className="w-12 px-5 py-4 align-middle" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        data-testid={`${testid}-select-${i}`}
                        aria-label="Select row"
                        className="h-4 w-4 cursor-pointer accent-ink align-middle rounded-sm"
                        checked={!!selectedKeys?.has(rowKey(r))}
                        onChange={() => onToggleRow?.(r)}
                      />
                    </td>
                  )}
                  {columns.map(c => (
                    <td
                      key={c.key}
                      className={`px-5 py-4 align-middle text-sm font-medium text-ink ${c.align === 'right' ? 'text-right tabular' : ''}`}
                    >
                      {c.render ? c.render(r) : (r[c.key] ?? <span className="text-ink-faint">—</span>)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bottomOverlay && (
        <div className="flex justify-center border-t border-line px-4 py-4">
          {bottomOverlay}
        </div>
      )}

      {(foot || pages > 1) && (
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <div className="text-sm font-bold text-ink" data-testid={`${testid}-footer`}>{foot}</div>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <IconButton data-testid={`${testid}-prev`} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="h-9 w-9 disabled:opacity-30">
                <ChevronLeft size={16} strokeWidth={2} />
              </IconButton>
              <span className="px-3 text-xs font-bold text-ink-soft tabular">{page} / {pages}</span>
              <IconButton data-testid={`${testid}-next`} disabled={page === pages} onClick={() => setPage(p => Math.min(pages, p + 1))} className="h-9 w-9 disabled:opacity-30">
                <ChevronRight size={16} strokeWidth={2} />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, sub, children, footer, wide, testid = 'modal' }) {
  const lt = useLabelT();
  title = lt(title);
  sub = lt(sub);
  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (e.key !== 'Escape') return;
      // Let portal Select/SearchSelect (capture) consume Escape first.
      if (e.defaultPrevented) return;
      onClose?.();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 sm:p-8" data-testid={testid}>
      <div className="fade fixed inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`pop relative z-10 my-auto w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-2xl border border-line bg-surface shadow-xl`}>
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div>
            <h3 className="display text-xl font-bold text-ink">{title}</h3>
            {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
          </div>
          <IconButton onClick={onClose} data-testid={`${testid}-close`} className="flex-shrink-0"><X size={18} strokeWidth={2} /></IconButton>
        </div>
        <div className="max-h-[62vh] overflow-y-auto border-y border-line-subtle px-6 py-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 px-6 py-4 bg-paper/50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ── Drawer — full height, sized, back-affordance top-left ────────────────── */
const DRAWER_W = {
  md: 'sm:w-[560px]',
  lg: 'sm:w-[760px]',
  xl: 'sm:w-[min(1100px,92vw)]',
  full: 'sm:w-full',
};

const StackCtx = createContext(null);

/** Tracks mounted drawers so nested panels layer instead of replacing each other. */
export function DrawerStackProvider({ children }) {
  const [ids, setIds] = useState([]);
  const api = useMemo(() => ({
    ids,
    push: id => setIds(s => (s.includes(id) ? s : [...s, id])),
    pop: id => setIds(s => s.filter(x => x !== id)),
  }), [ids]);
  return <StackCtx.Provider value={api}>{children}</StackCtx.Provider>;
}

let drawerSeq = 0;

export function Drawer({ open, onClose, title, sub, children, footer, size = 'md', eyebrow = 'Record', actions, testid = 'drawer' }) {
  const lt = useLabelT();
  title = lt(title);
  sub = lt(sub);
  eyebrow = lt(eyebrow);
  const stack = useContext(StackCtx);
  const idRef = useRef(null);
  if (!idRef.current) idRef.current = `drawer-${++drawerSeq}`;
  const id = idRef.current;

  useEffect(() => {
    if (!open || !stack) return;
    stack.push(id);
    return () => stack.pop(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const ids = stack?.ids || [];
  const depth = Math.max(0, ids.indexOf(id));
  const isTop = ids.length === 0 || ids[ids.length - 1] === id;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { if (depth === 0) document.body.style.overflow = ''; };
  }, [open, depth]);

  useEffect(() => {
    if (!open || !isTop) return;
    const h = e => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, isTop, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 100 + depth * 10 }} data-testid={testid} data-depth={depth}>
      <div className="fade absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className={`slide-in absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden border-l border-line bg-paper shadow-2xl ${DRAWER_W[size] || DRAWER_W.md} sm:rounded-l-2xl`}
        role="dialog"
        aria-modal="true"
      >
        {/* sticky header with back at top-left */}
        <div className="flex flex-shrink-0 items-start gap-4 border-b border-line bg-surface px-6 py-5 sm:px-8">
          <button
            data-testid={`${testid}-back`}
            onClick={onClose}
            aria-label="Back"
            className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-cream hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="overline text-ink">{eyebrow}</p>}
            <h3 className="display mt-1 truncate text-2xl font-bold text-ink">{title}</h3>
            {sub && <p className="mt-1.5 text-sm text-ink-soft">{sub}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {actions}
            <IconButton onClick={onClose} data-testid={`${testid}-close`}><X size={20} strokeWidth={2} /></IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
        {footer && <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:gap-3 sm:px-8 sm:py-4">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

/* ── Inner rail — primary navigation inside large modules ─────────────────── */
export function Field({ label, hint, children, className = '' }) {
  const lt = useLabelT();
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft">{lt(label)}</span>
      {children}
      {hint && <span className="mt-2 block text-xs text-ink-faint">{lt(hint)}</span>}
    </label>
  );
}

const control =
  'w-full h-11 px-4 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-faint outline-none focus:border-ink focus:ring-1 focus:ring-ink transition-all';

export function Input({ className = '', ...rest }) {
  return <input className={`${control} ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }) {
  return <textarea rows={3} className={`w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-ink-faint focus:border-ink focus:ring-1 focus:ring-ink ${className}`} {...rest} />;
}

export function Select({ value, onChange, children, className = '', 'data-testid': testid, ...rest }) {
  const lt = useLabelT();
  const options = useMemo(() => {
    const out = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'option') {
        const label = node.props.children;
        out.push({ value: node.props.value !== undefined ? node.props.value : label, label });
      } else if (node.props?.children) walk(node.props.children);
    };
    walk(children);
    return out;
  }, [children]);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const current = options.find(o => String(o.value) === String(value));
  const pick = v => { onChange?.({ target: { value: v } }); setOpen(false); };

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const preferDown = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const maxH = Math.min(280, Math.max(120, (preferDown ? spaceBelow : spaceAbove) - 16));
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 190) - 8)),
      width: Math.max(r.width, 190),
      maxH,
      top: preferDown ? r.bottom + 4 : undefined,
      bottom: preferDown ? undefined : window.innerHeight - r.top + 4,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onReposition = () => place();
    const onDown = e => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, place]);

  const onKeyDown = e => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(options.length - 1, c + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    if (e.key === 'Home') { e.preventDefault(); setCursor(0); }
    if (e.key === 'End') { e.preventDefault(); setCursor(options.length - 1); }
    if (e.key === 'Enter' && options[cursor]) { e.preventDefault(); pick(options[cursor].value); }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid={testid}
        onKeyDown={onKeyDown}
        onClick={() => {
          setCursor(Math.max(0, options.findIndex(o => String(o.value) === String(value))));
          setOpen(o => !o);
        }}
        className={`${control} flex items-center justify-between gap-2 text-left hover:bg-cream`}
        {...rest}
      >
        <span className={current ? 'font-medium' : 'text-ink-faint'}>{current ? lt(current.label) : lt('Select')}</span>
        <ChevronDown size={16} strokeWidth={2} className={`flex-shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="pop fixed z-[320] overflow-y-auto rounded-xl border border-line bg-surface shadow-md"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {options.map((o, k) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={String(o.value) === String(value)}
              data-testid={testid ? `${testid}-option-${String(o.value)}` : undefined}
              onMouseEnter={() => setCursor(k)}
              onClick={() => pick(o.value)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                String(o.value) === String(value) ? 'bg-cream font-bold text-ink' : k === cursor ? 'bg-cream text-ink' : 'font-medium text-ink-soft hover:bg-cream'
              }`}
            >
              <span>{lt(o.label)}</span>
              {String(o.value) === String(value) && <Check size={14} className="text-ink" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
      <select value={value ?? ''} onChange={onChange} tabIndex={-1} aria-hidden className="sr-only absolute h-0 w-0 opacity-0">
        {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ checked, onChange, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${checked ? 'bg-ink' : 'bg-line-strong'}`}
    >
      <span
        className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left] duration-200"
        style={{ left: checked ? 23 : 3 }}
      />
    </button>
  );
}

export function SettingRow({ title, desc, children, testid }) {
  const lt = useLabelT();
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line px-6 py-5 last:border-0" data-testid={testid}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{lt(title)}</p>
        {desc && <p className="mt-1 text-xs text-ink-soft">{lt(desc)}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/* ── Key / value ──────────────────────────────────────────────────────────── */
/** `mono` = tabular figures for amounts/dates · `code` = true monospace for IRN / GSTIN style strings. */
export function KV({ label, value, mono, code }) {
  const lt = useLabelT();
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line-subtle py-3 last:border-0">
      <span className="text-sm font-medium text-ink-soft">{lt(label)}</span>
      <span className={`text-right font-bold text-ink ${code ? 'mono text-xs' : mono ? 'text-sm tabular' : 'text-sm'}`}>{value ?? '—'}</span>
    </div>
  );
}

/* ── Progress bar (hatched, reference style) ──────────────────────────────── */
export function Bar({ pct, color = '#1A1A1A', height = 8 }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-paper-2" style={{ height }}>
      <div
        className="grow-x hatched h-full origin-left rounded-full transition-[width] duration-700"
        style={{ width: `${Math.min(100, Math.max(3, pct))}%`, background: color }}
      />
    </div>
  );
}

/* ── Radial gauge ─────────────────────────────────────────────────────────── */
export function Gauge({ pct, label, sub, color = '#2D7D46', size = 190 }) {
  const r = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2;
  const arc = (from, to) => {
    const p = a => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const value = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={arc(0, 1)} fill="none" stroke="var(--rule)" strokeWidth={18} strokeLinecap="round" />
        <path d={arc(0, Math.max(0.02, value))} fill="none" stroke={color} strokeWidth={18} strokeLinecap="round" />
      </svg>
      <p className="display -mt-8 text-3xl font-bold text-ink tabular">{label}</p>
      {sub && <p className="mt-1 max-w-[180px] text-center text-xs font-semibold uppercase tracking-wider text-ink-soft">{sub}</p>}
    </div>
  );
}

/* ── Chips ────────────────────────────────────────────────────────────────── */
export function Chips({ options, value, onChange, testid }) {
  const lt = useLabelT();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`h-9 rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 transition-colors duration-150 ${
            value === o ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-cream hover:text-ink'
          }`}
        >
          {lt(o)}
        </button>
      ))}
    </div>
  );
}

export function ExportButton({ onClick }) {
  const lt = useLabelT();
  return <Button onClick={onClick} data-testid="export-button"><Download size={16} strokeWidth={2} /> {lt('Export')}</Button>;
}
export function FilterButton({ onClick }) {
  const lt = useLabelT();
  return <Button onClick={onClick} data-testid="filter-button"><SlidersHorizontal size={16} strokeWidth={2} /> {lt('Filters')}</Button>;
}

/* ── Chart helpers ────────────────────────────────────────────────────────── */
export function ChartTooltip({ active, payload, label, format = v => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="mt-2 flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />{p.name}
          </span>
          <span className="text-sm font-bold text-ink tabular">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export const CHART_AXIS = {
  tick: { fontSize: 11, fill: 'var(--ink-soft)', fontWeight: 600 },
  axisLine: false,
  tickLine: false,
};
export const CHART_GRID = { strokeDasharray: '3 5', stroke: 'var(--rule)', strokeOpacity: 1, vertical: false };
export const SERIES = ['var(--ink)', 'var(--pos)', 'var(--note)', 'var(--warn)', 'var(--neg)'];

/* ── Click outside ────────────────────────────────────────────────────────── */
export function useClickOutside(onOut) {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });
  return ref;
}
