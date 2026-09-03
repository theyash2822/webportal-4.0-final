// Notifications live in a side drawer — same live /api/notifications as mobile.
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, HandCoins, ReceiptText, ArrowDownLeft, RefreshCw, ChevronRight, FileText } from 'lucide-react';
import { Drawer, Button, Empty, Skeleton, useLabelT } from './kit';
import { useNotifications } from '../services/notifications';
import { useAuth } from '../contexts/AuthContext';

const META = {
  Stock: { icon: Package, color: '#BB7836', tint: '#FEFBEC' },
  Receivables: { icon: HandCoins, color: '#B14435', tint: '#FBEDEB' },
  Compliance: { icon: ReceiptText, color: '#3963E4', tint: '#F0F5FD' },
  Invoices: { icon: FileText, color: '#447B4B', tint: '#F2FCF4' },
  Payments: { icon: ArrowDownLeft, color: '#447B4B', tint: '#F2FCF4' },
  System: { icon: RefreshCw, color: '#181818', tint: '#F1F1F0' },
};
const GROUPS = ['Today', 'Yesterday', 'Earlier'];
const FILTERS = ['All', 'Stock', 'Receivables', 'Compliance', 'Invoices', 'Payments', 'System'];

export default function NotificationDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const { items, unread, loading, error, markAllRead, markRead, refresh } = useNotifications(guid);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (open && guid) refresh();
  }, [open, guid, refresh]);

  const counts = useMemo(() => {
    const c = { All: items.filter(n => !n.read).length };
    FILTERS.slice(1).forEach(f => { c[f] = items.filter(n => n.category === f && !n.read).length; });
    return c;
  }, [items]);

  const rows = filter === 'All' ? items : items.filter(n => n.category === filter);

  const openAction = n => {
    markRead(n.id);
    if (n.action?.to) { navigate(n.action.to); onClose(); }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      eyebrow="Alerts"
      testid="notifications-drawer"
      title="Notifications"
      sub={unread ? <>{unread} {lt('unread')}</> : 'You are all caught up'}
      actions={<Button data-testid="mark-all-read" onClick={markAllRead} disabled={!unread}>{lt('Mark all read')}</Button>}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5" data-testid="notification-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              data-testid={`notification-filter-${f.toLowerCase()}`}
              onClick={() => setFilter(f)}
              className={`flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-150 ${
                filter === f ? 'bg-ink text-white' : 'bg-cream text-ink-soft hover:bg-cream-active hover:text-ink'
              }`}
            >
               {lt(f)}
              {counts[f] > 0 && (
                <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1 text-[11px] font-semibold ${
                  filter === f ? 'bg-white text-ink' : 'bg-surface text-ink'
                }`}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && !items.length ? <Skeleton rows={4} /> : null}
        {error && !loading ? (
          <Empty message={error} hint={<Button onClick={refresh}>{lt('Retry')}</Button>} />
        ) : null}
        {!loading && !error && rows.length === 0 && <Empty message="Nothing here" hint="No alerts in this category." />}

        {GROUPS.map(g => {
          const list = rows.filter(n => n.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="space-y-2.5">
               <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{lt(g)}</p>
              {list.map(n => {
                const meta = META[n.category] || META.System;
                const Icon = meta.icon;
                return (
                  <div
                    key={n.id}
                    data-testid={`notification-${n.id}`}
                    className={`flex gap-3.5 rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-sm ${
                      n.read ? 'opacity-70' : ''
                    }`}
                    style={n.read ? undefined : { borderLeft: `3px solid ${meta.color}` }}
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md" style={{ background: meta.tint }}>
                      <Icon size={17} strokeWidth={1.75} style={{ color: meta.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{n.title}</p>
                        <span className="flex-shrink-0 text-[11px] text-ink-faint">{n.time}</span>
                        {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-[3px] bg-ink" />}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{n.body}</p>
                      {n.action && (
                        <button
                          data-testid={`notification-action-${n.id}`}
                          onClick={() => openAction(n)}
                          className="mt-3 inline-flex items-center gap-1 rounded-md bg-cream px-3 py-1.5 text-[11px] font-medium text-ink transition-colors hover:bg-cream-active"
                        >
                          {n.action.label} <ChevronRight size={13} strokeWidth={2} />
                        </button>
                      )}
                      {!n.action && !n.read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="mt-3 inline-flex items-center gap-1 rounded-md bg-cream px-3 py-1.5 text-[11px] font-medium text-ink transition-colors hover:bg-cream-active"
                        >
                          {lt('Mark read')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
