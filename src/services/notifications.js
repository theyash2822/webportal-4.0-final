// Live notifications — same /api/notifications contract as mobile.
import { useState, useEffect, useCallback } from 'react';
import {
  fetchNotifications,
  markNotificationRead as apiMarkRead,
  markAllNotificationsRead as apiMarkAllRead,
} from './api';

const CATEGORY_ALIASES = {
  stock: 'Stock',
  receivable: 'Receivables',
  receivables: 'Receivables',
  gst: 'Compliance',
  compliance: 'Compliance',
  invoice: 'Invoices',
  invoices: 'Invoices',
  payment: 'Payments',
  payments: 'Payments',
  system: 'System',
  warning: 'System',
  info: 'System',
};

function titleCaseGroup(g) {
  const s = String(g || '').toLowerCase();
  if (s === 'today') return 'Today';
  if (s === 'yesterday') return 'Yesterday';
  return 'Earlier';
}

export function normalizeNotification(n) {
  const message = n.message || n.body || '';
  const createdAt = n.created_at ? new Date(n.created_at) : new Date();
  const isToday = createdAt.toDateString() === new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = createdAt.toDateString() === yesterday.toDateString();
  const rawCat = n.category || n.type || 'info';
  const category = CATEGORY_ALIASES[String(rawCat).toLowerCase()] || (rawCat.charAt(0).toUpperCase() + String(rawCat).slice(1));
  return {
    id: n.id,
    type: n.type || 'info',
    category,
    title: n.title || 'Notification',
    body: message,
    time: n.time || createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    group: n.group
      ? titleCaseGroup(n.group)
      : (isToday ? 'Today' : isYesterday ? 'Yesterday' : 'Earlier'),
    route: n.route || n.action?.to || null,
    actionLabel: n.actionLabel || n.action?.label || null,
    action: (n.route || n.action?.to)
      ? { label: n.actionLabel || n.action?.label || 'Open', to: n.route || n.action?.to }
      : null,
    read: !!(n.read ?? false),
    created_at: n.created_at,
  };
}

let items = [];
let loading = false;
let error = '';
let lastCompanyGuid = null;
const listeners = new Set();

const emit = () => listeners.forEach((l) => l({ items, loading, error }));

async function load(companyGuid) {
  if (!companyGuid) {
    items = [];
    lastCompanyGuid = null;
    error = '';
    emit();
    return;
  }
  loading = true;
  error = '';
  lastCompanyGuid = companyGuid;
  emit();
  try {
    const res = await fetchNotifications(companyGuid);
    const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    items = data.map(normalizeNotification);
  } catch (e) {
    error = e?.message || 'Failed to load notifications';
    items = [];
  } finally {
    loading = false;
    emit();
  }
}

export function useNotifications(companyGuid) {
  const [state, setState] = useState({ items, loading, error });

  useEffect(() => {
    const listener = (next) => setState(next);
    listeners.add(listener);
    setState({ items, loading, error });
    return () => listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (companyGuid && companyGuid !== lastCompanyGuid) load(companyGuid);
    if (!companyGuid && lastCompanyGuid) load(null);
  }, [companyGuid]);

  const refresh = useCallback(() => load(companyGuid || lastCompanyGuid), [companyGuid]);

  const markRead = useCallback((id) => {
    items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
    emit();
    apiMarkRead(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    const guid = companyGuid || lastCompanyGuid;
    items = items.map((n) => ({ ...n, read: true }));
    emit();
    if (guid) apiMarkAllRead(guid).catch(() => {});
  }, [companyGuid]);

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    unread: state.items.filter((n) => !n.read).length,
    markRead,
    markAllRead,
    refresh,
  };
}
