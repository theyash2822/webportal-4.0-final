/**
 * Billing & Credits — Web MD §27–29 (Owner-facing).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Input, useLabelT } from '../../components/kit';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { creditsToInrDisplay } from '../../utils/billingCredits';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'usage', label: 'Usage' },
  { id: 'seats', label: 'Workspaces & Seats' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'integrations', label: 'Integrations' },
];

function unwrap(res) {
  return res?.data ?? res;
}

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[data-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.dataset.razorpay = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(s);
  });
}

function parseMeta(row) {
  const raw = row?.meta_json ?? row?.meta;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function usageLabel(row) {
  const meta = parseMeta(row);
  const ws = row.workspace_id || row.workspaceId || meta.workspaceId || meta.workspace_name || '—';
  const user = row.user_id || row.userId || meta.userId || meta.user_name
    || (meta.system ? 'System Automation' : '—');
  const type = row.kind || row.usage_type || meta.usageType || row.reference || '—';
  const event = row.reference || meta.event || row.id || '—';
  return { ws, user, type, event, amount: row.amount, created: row.created_at };
}

export function SettingsBilling() {
  const lt = useLabelT();
  const { showToast } = useAuth();
  const { currentWorkspace, membershipType, reloadWorkspaces, workspaces } = useWorkspace();
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [rates, setRates] = useState([]);
  const [seats, setSeats] = useState([]);
  const [txns, setTxns] = useState([]);
  const [usage, setUsage] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rechargeCredits, setRechargeCredits] = useState('100');
  const [razorpayConfigured, setRazorpayConfigured] = useState(null); // null unknown, true/false after probe
  const [rechargeBusy, setRechargeBusy] = useState(false);
  const [state, setState] = useState({ loading: true, error: '', message: '' });
  const rechargeAmountInr = useMemo(() => creditsToInrDisplay(rechargeCredits), [rechargeCredits]);
  const wsId = currentWorkspace?.id;
  // Wave 4: Billing Owner-only (Admin GST/EWB ≠ Billing)
  const isOwner = membershipType === 'OWNER';
  // Never show Complete order (dev) in production; non-prod requires explicit ALLOW_DEV
  const allowDevCompleteOrder =
    import.meta.env.PROD !== true
    && String(import.meta.env.VITE_ALLOW_DEV || '').toLowerCase() === 'true';

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [ov, rt, st, tx, us, inv, ord] = await Promise.all([
        api.fetchBillingOverview().catch(() => null),
        api.fetchBillingRates().catch(() => ({ data: [] })),
        wsId ? api.fetchWorkspaceSeats(wsId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        api.fetchBillingTransactions().catch(() => ({ data: [] })),
        api.fetchBillingUsage({ limit: 100 }).catch(() => ({ data: [] })),
        api.fetchBillingInvoices().catch(() => ({ data: [] })),
        api.fetchBillingPaymentOrders().catch(() => ({ data: [] })),
      ]);
      setOverview(unwrap(ov));
      setRates(unwrap(rt) || []);
      setSeats(unwrap(st) || []);
      setTxns(unwrap(tx) || []);
      const usageRows = unwrap(us);
      setUsage(Array.isArray(usageRows) ? usageRows : (usageRows?.events || usageRows?.rows || []));
      const invRows = unwrap(inv);
      setInvoices(Array.isArray(invRows) ? invRows : (invRows?.invoices || []));
      const ordRows = unwrap(ord);
      setOrders(Array.isArray(ordRows) ? ordRows : (ordRows?.orders || []));
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  const pendingOrders = useMemo(
    () => (orders || []).filter((o) => String(o.status || '').toUpperCase() === 'PENDING'),
    [orders],
  );

  const seatKpis = useMemo(() => {
    const list = seats || [];
    const purchased = list.filter((s) => String(s.seat_kind || '').toUpperCase() === 'PAID').length;
    const available = list.filter(
      (s) => String(s.seat_kind || '').toUpperCase() === 'PAID'
        && String(s.status || '').toUpperCase() === 'AVAILABLE',
    ).length;
    const assigned = list.filter((s) => String(s.status || '').toUpperCase() === 'ASSIGNED').length;
    const total = list.length;
    return { purchased, available, assigned, total };
  }, [seats]);

  const seatRoleLabel = (s) => {
    if (String(s.membership_type || s.membershipType || '').toUpperCase() === 'OWNER'
      || String(s.seat_kind || '').toUpperCase() === 'OWNER') {
      return 'Owner';
    }
    return s.role_display_name || s.roleDisplayName || s.role_system_key || s.roleSystemKey || 'Member';
  };

  const seatUserLabel = (s) => {
    const name = s.assigned_user_name || s.assignedUserName || '';
    const mobile = s.assigned_user_mobile || s.assignedUserMobile || '';
    if (name && mobile) return { name, mobile };
    if (name) return { name, mobile: '' };
    if (s.assigned_user_id || s.assignedUserId) {
      return { name: `User ${s.assigned_user_id || s.assignedUserId}`, mobile: '' };
    }
    return { name: '', mobile: '' };
  };

  const purchaseSeat = async () => {
    if (!isOwner || !wsId) return;
    setState((s) => ({ ...s, message: '', error: '' }));
    try {
      await api.purchaseWorkspaceSeat(wsId);
      const msg = lt('Seat purchased.');
      setState((s) => ({ ...s, message: msg }));
      showToast?.(msg, 'success');
      await load();
    } catch (err) {
      const msg = err?.data?.error?.message || err.message || lt('Seat purchase failed');
      setState((s) => ({ ...s, error: msg }));
      showToast?.(msg, 'warning');
    }
  };

  const createWs = async () => {
    if (!isOwner) return;
    const name = window.prompt(lt('New workspace name'));
    if (!name?.trim()) return;
    setState((s) => ({ ...s, message: '', error: '' }));
    try {
      await api.createWorkspace({ name: name.trim() });
      const msg = lt('Workspace created.');
      setState((s) => ({ ...s, message: msg }));
      showToast?.(msg, 'success');
      await reloadWorkspaces?.();
      await load();
    } catch (err) {
      const msg = err?.data?.error?.message || err.message || lt('Could not create workspace');
      setState((s) => ({ ...s, error: msg }));
      showToast?.(msg, 'warning');
    }
  };

  const createOrder = async () => {
    if (!isOwner) return;
    if (razorpayConfigured === false) {
      setState((s) => ({
        ...s,
        error: lt('Payment checkout is unavailable until Razorpay is configured.'),
        message: '',
      }));
      return;
    }
    const credits = Number(rechargeCredits);
    if (!Number.isInteger(credits) || credits <= 0) {
      setState((s) => ({ ...s, error: lt('Enter a valid credits amount.') }));
      return;
    }
    if (rechargeBusy) return;
    setRechargeBusy(true);
    setState((s) => ({ ...s, message: '', error: '' }));
    try {
      const res = await api.createBillingRechargeOrder({
        credits,
        workspaceId: wsId,
      });
      const razorpayPayload = unwrap(res);

      if (razorpayPayload?.configured === false) {
        setRazorpayConfigured(false);
        setState((s) => ({
          ...s,
          error: lt('Payment checkout is unavailable until Razorpay is configured.'),
          message: '',
        }));
        return;
      }

      const keyId = razorpayPayload?.razorpayKeyId || razorpayPayload?.key_id;
      const orderId = razorpayPayload?.razorpayOrderId || razorpayPayload?.razorpay_order_id;
      const amountPaise = razorpayPayload?.amountPaise
        ?? (Number.isInteger(Number(razorpayPayload?.amountInr)) ? Number(razorpayPayload.amountInr) * 100 : null);

      if (!keyId || !orderId) {
        setRazorpayConfigured(false);
        setState((s) => ({
          ...s,
          error: lt('Payment checkout is unavailable until Razorpay is configured.'),
          message: '',
        }));
        return;
      }

      setRazorpayConfigured(true);
      if (typeof window !== 'undefined') {
        await loadRazorpayScript();
        const options = {
          key: keyId,
          amount: amountPaise,
          currency: razorpayPayload?.currency || 'INR',
          name: 'TallyDekho',
          description: `${credits} credits`,
          order_id: orderId,
          handler: async (response) => {
            try {
              await api.verifyBillingRecharge({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setState((s) => ({ ...s, message: lt('Payment verified — credits applied.') }));
              await load();
            } catch (vErr) {
              setState((s) => ({ ...s, error: vErr?.data?.error?.message || vErr.message }));
            }
          },
        };
        // eslint-disable-next-line no-undef
        const rzp = new window.Razorpay(options);
        rzp.open();
        setState((s) => ({ ...s, message: lt('Razorpay checkout opened.') }));
      }
    } catch (err) {
      const code = err?.data?.error?.code || err?.code || '';
      const status = err?.status;
      if (status === 503 || code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
        setRazorpayConfigured(false);
        setState((s) => ({
          ...s,
          error: lt('Payment checkout is unavailable until Razorpay is configured.'),
          message: '',
        }));
        return;
      }
      setState((s) => ({
        ...s,
        error: status === 404
          ? lt('Payment order API not available yet on this backend.')
          : (err?.data?.error?.message || err.message),
      }));
    } finally {
      setRechargeBusy(false);
    }
  };

  const completeOrder = async (orderId) => {
    setState((s) => ({ ...s, message: '', error: '' }));
    try {
      await api.completeBillingPaymentOrder(orderId);
      setState((s) => ({ ...s, message: lt('Order completed — credits applied.') }));
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    }
  };

  const balance = overview?.wallet?.balanceCredits ?? overview?.wallet?.balance_credits ?? overview?.balanceCredits;

  return (
    <div className="space-y-4" data-testid="settings-billing">
      <div>
        <h2 className="text-base font-semibold text-ink">{lt('Billing & Credits')}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{lt('Owner-only wallet, seats, recharge, and usage. Rates from backend.')}</p>
      </div>
      {state.error && <p className="text-sm font-medium text-alert">{state.error}</p>}
      {state.message && <p className="text-sm font-medium text-emerald-700">{state.message}</p>}
      {state.loading && <p className="text-sm text-ink-soft">{lt('Loading…')}</p>}

      {!isOwner && !state.loading && (
        <Card className="p-5"><p className="text-sm text-ink-soft">{lt('Only the Workspace Owner can manage billing and recharge.')}</p></Card>
      )}

      {isOwner && !state.loading && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  tab === t.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream'
                }`}
              >
                {lt(t.label)}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <Card className="space-y-2 p-5">
                <p className="text-sm font-semibold text-ink">{lt('Overview')}</p>
                <p className="text-2xl font-bold text-ink">{balance != null ? `${balance} ${lt('credits')}` : '—'}</p>
                <p className="text-xs text-ink-soft">{lt('Signup bonus and top-ups appear as credit lots on the backend wallet.')}</p>
                {(overview?.lots || []).length > 0 && (
                  <ul className="mt-2 divide-y divide-line">
                    {overview.lots.map((lot) => (
                      <li key={lot.id} className="flex justify-between py-1.5 text-xs text-ink-soft">
                        <span>{lot.source || 'lot'} · {lot.credits_remaining ?? lot.creditsRemaining} left</span>
                        <span>{lot.expires_at ? new Date(Number(lot.expires_at) * 1000).toLocaleDateString() : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3 p-5" data-testid="billing-recharge">
                <p className="text-sm font-semibold text-ink">{lt('Recharge Credits')}</p>
                <p className="text-xs text-ink-soft">{lt('Pay with Razorpay when configured. Checkout is disabled until payment is ready.')}</p>
                {razorpayConfigured === false && (
                  <p className="rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] font-medium text-ink">
                    {lt('Payment checkout is unavailable until Razorpay is configured.')}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Credits')}</label>
                    <Input value={rechargeCredits} onChange={(e) => setRechargeCredits(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Amount (INR)')}</label>
                    <Input value={rechargeAmountInr} readOnly data-testid="billing-recharge-inr" />
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={createOrder}
                  disabled={razorpayConfigured === false || rechargeBusy}
                  data-testid="billing-recharge-submit"
                >
                  {lt('Recharge')}
                </Button>
                {allowDevCompleteOrder && pendingOrders.length > 0 && (
                  <ul className="divide-y divide-line">
                    {pendingOrders.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="text-ink">{o.credits} {lt('credits')} · ₹{o.amount_inr ?? o.amountInr} · {o.status}</span>
                        <Button onClick={() => completeOrder(o.id)}>{lt('Complete order (dev)')}</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <p className="mb-2 text-sm font-semibold text-ink">{lt('Rates')}</p>
                <ul className="divide-y divide-line">
                  {(rates || []).map((r) => (
                    <li key={r.key} className="flex justify-between py-2 text-sm">
                      <span className="font-medium text-ink">{r.key}</span>
                      <span className="text-ink-soft">{r.credits} {lt('credits')}</span>
                    </li>
                  ))}
                  {!rates?.length && <li className="py-2 text-sm text-ink-soft">{lt('No rates loaded.')}</li>}
                </ul>
              </Card>
            </div>
          )}

          {tab === 'usage' && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-ink">{lt('Usage')}</p>
              <p className="mb-3 text-xs text-ink-soft">{lt('Drilldown: Workspace → User → Type → Event')}</p>
              <ul className="divide-y divide-line">
                {(usage || []).slice(0, 50).map((row) => {
                  const u = usageLabel(row);
                  return (
                    <li key={row.id || `${u.ws}-${u.event}`} className="py-2 text-sm">
                      <p className="font-medium text-ink">{u.ws} → {u.user}</p>
                      <p className="text-xs text-ink-soft">{u.type} · {u.event}{u.amount != null ? ` · ${u.amount}` : ''}</p>
                      {u.created && (
                        <p className="text-[11px] text-ink-faint">{new Date(Number(u.created) * 1000).toLocaleString()}</p>
                      )}
                    </li>
                  );
                })}
                {!usage?.length && <li className="py-2 text-sm text-ink-soft">{lt('No usage events yet.')}</li>}
              </ul>
            </Card>
          )}

          {tab === 'seats' && (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{lt('Workspaces & Seats')}</p>
                <div className="flex gap-2">
                  <Button onClick={createWs}>{lt('Create workspace')}</Button>
                  <Button variant="primary" onClick={purchaseSeat} disabled={!wsId}>{lt('Buy seat')}</Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-cream/40 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{lt('Seats purchased')}</p>
                  <p className="mt-1 text-2xl font-bold tabular text-ink">{seatKpis.purchased}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{lt('Paid seats on this workspace')}</p>
                </div>
                <div className="rounded-xl border border-line bg-cream/40 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{lt('Seats available')}</p>
                  <p className="mt-1 text-2xl font-bold tabular text-ink">{seatKpis.available}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{lt('Ready to assign')}</p>
                </div>
                <div className="rounded-xl border border-line bg-cream/40 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{lt('Seats assigned')}</p>
                  <p className="mt-1 text-2xl font-bold tabular text-ink">{seatKpis.assigned}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{lt('Total seats:')} {seatKpis.total}</p>
                </div>
              </div>

              <p className="text-xs text-ink-soft">{lt('Current workspace:')} {currentWorkspace?.name || '—'}</p>
              {(workspaces || []).length > 0 && (
                <ul className="mb-1 divide-y divide-line text-sm">
                  {workspaces.map((w) => (
                    <li key={w.id} className="flex justify-between py-1.5">
                      <span className="text-ink">{w.name}{w.isBase ? ' · Base' : ''}</span>
                      <span className="text-ink-soft">{w.membershipStatus || w.membership_status || ''}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="overflow-hidden rounded-xl border border-line">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-2 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <span>{lt('Name')}</span>
                  <span>{lt('Number')}</span>
                  <span>{lt('Role')}</span>
                  <span className="text-right">{lt('Seat')}</span>
                </div>
                <ul className="divide-y divide-line">
                  {(seats || []).map((s) => {
                    const user = seatUserLabel(s);
                    const role = seatRoleLabel(s);
                    const kind = String(s.seat_kind || s.seatKind || '—').toUpperCase();
                    const status = String(s.status || '—').toUpperCase();
                    return (
                      <li key={s.id} className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-2 px-3 py-2.5 text-sm">
                        <span className="truncate font-medium text-ink">
                          {user.name || lt('Unassigned')}
                        </span>
                        <span className="truncate text-ink-soft tabular">{user.mobile || '—'}</span>
                        <span className="truncate text-ink">{role}</span>
                        <span className="text-right text-xs font-semibold text-ink-soft">
                          {kind} · {status}
                        </span>
                      </li>
                    );
                  })}
                  {!seats?.length && (
                    <li className="px-3 py-3 text-sm text-ink-soft">{lt('No seats yet.')}</li>
                  )}
                </ul>
              </div>
            </Card>
          )}

          {tab === 'transactions' && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-ink">{lt('Transactions')}</p>
              <ul className="divide-y divide-line">
                {(txns || []).slice(0, 40).map((t) => (
                  <li key={t.id} className="flex justify-between py-2 text-sm">
                    <span className="text-ink">{t.kind || t.reference}{t.workspace_id ? ` · ${t.workspace_id}` : ''}</span>
                    <span className="text-ink-soft">{t.amount}</span>
                  </li>
                ))}
                {!txns?.length && <li className="py-2 text-sm text-ink-soft">{lt('No transactions yet.')}</li>}
              </ul>
            </Card>
          )}

          {tab === 'invoices' && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-ink">{lt('Invoices')}</p>
              <ul className="divide-y divide-line">
                {(invoices || []).map((inv) => (
                  <li key={inv.id} className="flex justify-between py-2 text-sm">
                    <span className="text-ink">{inv.invoice_number || inv.id} · {inv.status}</span>
                    <span className="text-ink-soft">{inv.credits} {lt('credits')} · ₹{inv.amount_inr ?? inv.amountInr}</span>
                  </li>
                ))}
                {!invoices?.length && <li className="py-2 text-sm text-ink-soft">{lt('No invoices yet.')}</li>}
              </ul>
            </Card>
          )}

          {tab === 'integrations' && (
            <Card className="space-y-2 p-5">
              <p className="text-sm font-semibold text-ink">{lt('Integrations')}</p>
              <p className="text-sm text-ink-soft">{lt('GST / E-Invoice / E-Way activation charges the Owner wallet. Configure credentials in Settings.')}</p>
              <div className="flex flex-wrap gap-2">
                <Link to="/settings/einvoice" className="text-sm font-semibold text-ink underline">{lt('E-Invoice settings')}</Link>
                <Link to="/settings/ewb" className="text-sm font-semibold text-ink underline">{lt('E-Way Bill settings')}</Link>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default SettingsBilling;
