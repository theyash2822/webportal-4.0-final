/**
 * Invitation inbox — Received (me) + Sent pending (workspace).
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, Button, useLabelT } from '../../components/kit';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

function unwrap(res) {
  return res?.data ?? res;
}

export function SettingsInvitations() {
  const lt = useLabelT();
  const { showToast } = useAuth();
  const {
    invitations, refreshInvitations, switchWorkspace, reloadWorkspaces,
    currentWorkspace, can, membershipType,
  } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const canManageSent = membershipType === 'OWNER' || can('members.invite');

  const [rows, setRows] = useState(invitations || []);
  const [sent, setSent] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSent = useCallback(async () => {
    if (!wsId || !canManageSent) {
      setSent([]);
      return;
    }
    try {
      const res = await api.fetchWorkspaceInvitations(wsId);
      const list = unwrap(res);
      setSent(Array.isArray(list) ? list : []);
    } catch (e) {
      setSent([]);
      throw e;
    }
  }, [wsId, canManageSent]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await refreshInvitations?.();
      setRows(Array.isArray(list) ? list : []);
      if (canManageSent && wsId) {
        try {
          await loadSent();
        } catch (e) {
          setError(e?.data?.error?.message || e.message || lt('Unable to load sent invitations'));
        }
      } else {
        setSent([]);
      }
    } catch (e) {
      setError(e?.data?.error?.message || e?.message || lt('Unable to load invitations'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [refreshInvitations, lt, canManageSent, wsId, loadSent]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (Array.isArray(invitations)) setRows(invitations);
  }, [invitations]);

  const onDecline = async (id) => {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      await api.declineInvitation(id);
      const msg = lt('Invitation declined.');
      setMessage(msg);
      showToast?.(msg, 'success');
      await load();
    } catch (e) {
      const msg = e?.data?.error?.message || e.message || lt('Decline failed');
      setError(msg);
      showToast?.(msg, 'warning');
    } finally {
      setBusy(null);
    }
  };

  const onAccept = async (inv) => {
    const id = inv.id;
    setBusy(id);
    setError('');
    setMessage('');
    try {
      const res = await api.acceptInvitation(id);
      const data = unwrap(res);
      const newWsId = data?.workspaceId || data?.workspace_id || data?.workspace?.id;
      const wsName = inv.workspace_name || inv.workspaceName || inv.workspace?.name || 'Workspace';
      const msg = lt('Invitation accepted.');
      setMessage(msg);
      showToast?.(msg, 'success');
      await refreshInvitations?.().catch(() => []);
      await reloadWorkspaces?.();
      if (newWsId && window.confirm(`${lt('Switch to')} ${wsName}?`)) {
        await switchWorkspace?.(String(newWsId));
      } else {
        await load();
      }
    } catch (e) {
      const msg = e?.data?.error?.message || e.message || lt('Accept failed');
      setError(msg);
      showToast?.(msg, 'warning');
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = async (id) => {
    if (!wsId) return;
    if (!window.confirm(lt('Revoke this invitation?'))) return;
    setBusy(id);
    setError('');
    setMessage('');
    try {
      await api.revokeWorkspaceInvitation(wsId, id);
      const msg = lt('Invitation revoked.');
      setMessage(msg);
      showToast?.(msg, 'success');
      await loadSent();
    } catch (e) {
      const msg = e?.data?.error?.message || e.message || lt('Revoke failed');
      setError(msg);
      showToast?.(msg, 'warning');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-invitations">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{lt('Invitations')}</h2>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {lt('Received invites for you, and pending invites sent from this workspace.')}
          </p>
        </div>
        <Button type="button" onClick={load} disabled={loading}>{lt('Refresh')}</Button>
      </div>
      {error && <p className="text-sm font-medium text-alert">{error}</p>}
      {message && <p className="text-sm font-medium text-emerald-700">{message}</p>}
      {loading && <p className="text-sm text-ink-soft">{lt('Loading…')}</p>}

      {!loading && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{lt('Received')}</p>
          {rows.length === 0 && (
            <Card className="p-5">
              <p className="text-sm text-ink-soft">{lt('No pending invitations for you.')}</p>
            </Card>
          )}
          {rows.map((inv) => {
            const id = inv.id;
            const wsName = inv.workspace_name || inv.workspaceName || inv.workspace?.name || 'Workspace';
            const roleName =
              inv.role_display_name || inv.role_name || inv.roleName
              || inv.role?.display_name || inv.role?.displayName || 'Member';
            return (
              <Card key={id} className="space-y-3 p-5" data-testid={`invitation-row-${id}`}>
                <p className="text-sm font-semibold text-ink">{wsName} {lt('invited you')}</p>
                <p className="text-[13px] text-ink-soft">{lt('Role')}: {roleName}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={!!busy} onClick={() => onDecline(id)} className="text-alert">
                    {busy === id ? lt('Working…') : lt('Decline')}
                  </Button>
                  <Button type="button" variant="primary" disabled={!!busy} onClick={() => onAccept(inv)}>
                    {busy === id ? lt('Working…') : lt('Accept')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && canManageSent && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{lt('Sent (pending)')}</p>
          {!wsId && (
            <Card className="p-5">
              <p className="text-sm text-ink-soft">{lt('Select a workspace to see sent invitations.')}</p>
            </Card>
          )}
          {wsId && sent.length === 0 && (
            <Card className="p-5">
              <p className="text-sm text-ink-soft">{lt('No pending invitations sent from this workspace.')}</p>
            </Card>
          )}
          {sent.map((inv) => {
            const id = inv.id;
            const who = inv.invitee_name || inv.invitee_mobile || `User ${inv.invitee_user_id}`;
            const roleName = inv.role_display_name || 'Member';
            const exp = inv.expires_at
              ? new Date(Number(inv.expires_at) * 1000).toLocaleString()
              : '';
            return (
              <Card key={id} className="space-y-3 p-5" data-testid={`invitation-sent-${id}`}>
                <p className="text-sm font-semibold text-ink">{lt('Invited')} {who}</p>
                <p className="text-[13px] text-ink-soft">
                  {lt('Role')}: {roleName}
                  {exp ? ` · ${lt('Expires')} ${exp}` : ''}
                </p>
                <Button type="button" disabled={!!busy} onClick={() => onRevoke(id)} className="text-alert">
                  {busy === id ? lt('Working…') : lt('Revoke')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SettingsInvitations;
