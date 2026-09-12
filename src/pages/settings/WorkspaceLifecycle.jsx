/**
 * Workspace lifecycle — MD §30–32 (Transfer / Reset / Close).
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, Button, Input, useLabelT } from '../../components/kit';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import api from '../../services/api';

function unwrap(res) {
  return res?.data ?? res;
}

function TripleConfirm({ phrase, value, onChange, checks, onCheck, labels }) {
  const lt = useLabelT();
  return (
    <div className="space-y-3">
      {labels.map((label, i) => (
        <label key={label} className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!checks[i]}
            onChange={(e) => onCheck(i, e.target.checked)}
          />
          <span>{lt(label)}</span>
        </label>
      ))}
      <div>
        <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">
          {lt('Type')} {phrase} {lt('to confirm')}
        </label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={phrase} />
      </div>
      <p className="text-xs text-ink-soft">{lt('Three acknowledgements required before submit.')}</p>
    </div>
  );
}

export function SettingsWorkspaceLifecycle() {
  const lt = useLabelT();
  const { currentWorkspace, membershipType, reloadWorkspaces } = useWorkspace();
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [outgoingRoleId, setOutgoingRoleId] = useState('');
  const [transfer, setTransfer] = useState(null);
  const [confirmToken, setConfirmToken] = useState('');
  const [lifecycle, setLifecycle] = useState(null);
  const [resetPhrase, setResetPhrase] = useState('');
  const [closePhrase, setClosePhrase] = useState('');
  const [resetChecks, setResetChecks] = useState([false, false, false]);
  const [closeChecks, setCloseChecks] = useState([false, false, false]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const wsId = currentWorkspace?.id;
  const isOwner = membershipType === 'OWNER';
  const isBase = currentWorkspace?.isBase !== false;

  const load = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    try {
      const [m, r, tr, lc] = await Promise.all([
        api.fetchWorkspaceMembers(wsId).catch(() => ({ data: [] })),
        api.fetchWorkspaceRoles(wsId).catch(() => ({ data: [] })),
        api.fetchWorkspaceTransfer(wsId).catch(() => null),
        api.fetchWorkspaceLifecycle(wsId).catch(() => null),
      ]);
      const memberList = unwrap(m) || [];
      setMembers(memberList.filter((x) => x.membership_type !== 'OWNER' && x.status !== 'SUSPENDED'));
      const roleList = unwrap(r) || [];
      setRoles(roleList);
      setOutgoingRoleId((prev) => prev || roleList[0]?.id || '');
      const trData = unwrap(tr);
      if (trData) setTransfer(Array.isArray(trData) ? trData[0] : (trData.transfer || trData));
      setLifecycle(unwrap(lc));
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    setErr(''); setMsg('');
    try {
      const res = await fn();
      setMsg(okMsg);
      const data = unwrap(res);
      if (data?.transferId || data?.status?.includes?.('PENDING') || data?.status === 'COMPLETED') {
        setTransfer((t) => ({ ...(t || {}), ...data }));
      }
      if (data?.status === 'PENDING_GRACE' || data?.status === 'PENDING_CONFIRM' || data?.confirm_count != null) {
        setLifecycle((lc) => ({ ...(lc || {}), ...data }));
      }
      await reloadWorkspaces?.();
      await load();
      return data;
    } catch (e) {
      setErr(e?.status === 404
        ? lt('This lifecycle step API is not available on the current backend yet.')
        : (e?.data?.error?.message || e.message || 'Request failed'));
      return null;
    }
  };

  const resetReady = resetChecks.every(Boolean) && resetPhrase === 'RESET WORKSPACE';
  const closeReady = closeChecks.every(Boolean) && closePhrase === 'CLOSE WORKSPACE';
  const transferStatus = transfer?.status || lifecycle?.transfer?.status;
  const gracePending = ['PENDING_GRACE'].includes(String(lifecycle?.status || transferStatus || ''));

  if (!wsId) {
    return <Card className="p-5"><p className="text-sm text-ink-soft">{lt('Select a workspace.')}</p></Card>;
  }

  return (
    <div className="space-y-4" data-testid="settings-workspace-lifecycle">
      <div>
        <h2 className="text-base font-semibold text-ink">{lt('Workspace lifecycle')}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{lt('Owner-only guarded workflows with email confirmations and 24h grace.')}</p>
      </div>
      {err && <p className="text-sm font-medium text-alert">{err}</p>}
      {msg && <p className="text-sm font-medium text-emerald-700">{msg}</p>}
      {loading && <p className="text-sm text-ink-soft">{lt('Loading…')}</p>}
      {!isOwner && <Card className="p-5"><p className="text-sm text-ink-soft">{lt('Only the Owner can transfer, reset, or close a workspace.')}</p></Card>}

      {isOwner && !loading && (
        <>
          <Card className="space-y-3 p-5">
            <p className="text-sm font-semibold text-ink">{lt('Ownership transfer')}</p>
            <p className="text-xs text-ink-soft">{lt('Pick an active member and the role you will keep after transfer. Three email confirms, then 24h grace.')}</p>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Target member')}</label>
              <select
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              >
                <option value="">{lt('Select member')}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_name || m.name || m.user_mobile || m.mobile || `User ${m.user_id}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Your outgoing role')}</label>
              <select
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                value={outgoingRoleId}
                onChange={(e) => setOutgoingRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.display_name || r.name}</option>
                ))}
              </select>
            </div>
            <Button
              disabled={!targetUserId}
              onClick={() => run(
                () => api.initiateWorkspaceTransfer(wsId, {
                  targetUserId: Number(targetUserId),
                  outgoingRoleId: outgoingRoleId || undefined,
                }),
                lt('Transfer initiated (pending email confirmations).'),
              )}
            >
              {lt('Initiate transfer')}
            </Button>

            {(transfer || transferStatus) && (
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">{lt('Status')}: {transferStatus || transfer?.status || '—'}</p>
                <p className="text-xs text-ink-soft">
                  {lt('Transfer id')}: {transfer?.transferId || transfer?.id || '—'}
                  {transfer?.confirm_count != null ? ` · ${lt('Confirms')}: ${transfer.confirm_count}/3` : ''}
                  {transfer?.grace_ends_at ? ` · ${lt('Grace ends')}: ${new Date(Number(transfer.grace_ends_at) * 1000).toLocaleString()}` : ''}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-soft">
                  <li>{lt('PENDING_CONFIRM — click email links (or paste token below for dev)')}</li>
                  <li>{lt('PENDING_GRACE — 24h revocation window')}</li>
                  <li>{lt('COMPLETED — ownership flipped')}</li>
                </ul>
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder={lt('Confirm token (dev / email link)')}
                    value={confirmToken}
                    onChange={(e) => setConfirmToken(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => run(
                        () => api.confirmWorkspaceTransfer(
                          wsId,
                          transfer?.transferId || transfer?.id,
                          { token: confirmToken },
                        ),
                        lt('Email confirmation recorded.'),
                      )}
                    >
                      {lt('Confirm email step')}
                    </Button>
                    <Button
                      onClick={() => run(
                        () => api.completeWorkspaceTransfer(
                          wsId,
                          transfer?.transferId || transfer?.id,
                          {},
                        ),
                        lt('Transfer completed (or queued after grace).'),
                      )}
                    >
                      {lt('Complete after grace')}
                    </Button>
                    <Button
                      onClick={() => run(
                        () => api.revokeWorkspaceTransfer(
                          wsId,
                          transfer?.transferId || transfer?.id,
                          {},
                        ),
                        lt('Transfer revoked.'),
                      )}
                    >
                      {lt('Revoke')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {isBase && (
            <Card className="space-y-3 border-alert/30 p-5">
              <p className="text-sm font-semibold text-alert">{lt('Reset workspace')}</p>
              <p className="text-xs text-ink-soft">
                {lt('Deletes Tally data, backups, members, scopes/roles/config. Wallet and Owner remain. Three confirmations + 24h grace.')}
              </p>
              {gracePending && lifecycle?.kind === 'RESET' && (
                <p className="text-sm font-medium text-amber-700">
                  {lt('Grace pending')}{lifecycle?.grace_ends_at ? ` · ${new Date(Number(lifecycle.grace_ends_at) * 1000).toLocaleString()}` : ''}
                  {lifecycle?.confirm_count != null ? ` · ${lifecycle.confirm_count}/3` : ''}
                </p>
              )}
              <TripleConfirm
                phrase="RESET WORKSPACE"
                value={resetPhrase}
                onChange={setResetPhrase}
                checks={resetChecks}
                onCheck={(i, v) => setResetChecks((c) => c.map((x, idx) => (idx === i ? v : x)))}
                labels={[
                  'I understand all Tally data and cloud backups will be deleted.',
                  'I understand members, scopes, and roles will be removed/reset.',
                  'I understand this cannot be undone after the grace period.',
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!resetReady}
                  onClick={() => run(
                    () => api.requestWorkspaceReset(wsId, { phrase: 'RESET WORKSPACE' }),
                    lt('Reset requested — confirm 3 times with phrase.'),
                  )}
                >
                  {lt('Request reset')}
                </Button>
                <Button
                  disabled={!resetReady}
                  onClick={() => run(
                    () => api.confirmWorkspaceReset(wsId, { phrase: 'RESET WORKSPACE' }),
                    lt('Reset confirmation recorded.'),
                  )}
                >
                  {lt('Confirm reset step')}
                </Button>
                <Button
                  onClick={() => run(
                    () => api.completeWorkspaceReset(wsId),
                    lt('Reset completed (or still in grace).'),
                  )}
                >
                  {lt('Complete after grace')}
                </Button>
              </div>
            </Card>
          )}

          {!isBase && (
            <Card className="space-y-3 border-alert/30 p-5">
              <p className="text-sm font-semibold text-alert">{lt('Close workspace')}</p>
              <p className="text-xs text-ink-soft">{lt('Additional paid workspaces only. Destructive purge. Three confirmations + grace.')}</p>
              {gracePending && lifecycle?.kind === 'CLOSE' && (
                <p className="text-sm font-medium text-amber-700">
                  {lt('Grace pending')}{lifecycle?.grace_ends_at ? ` · ${new Date(Number(lifecycle.grace_ends_at) * 1000).toLocaleString()}` : ''}
                </p>
              )}
              <TripleConfirm
                phrase="CLOSE WORKSPACE"
                value={closePhrase}
                onChange={setClosePhrase}
                checks={closeChecks}
                onCheck={(i, v) => setCloseChecks((c) => c.map((x, idx) => (idx === i ? v : x)))}
                labels={[
                  'I understand this workspace will be permanently closed.',
                  'I understand members and synced data will be purged.',
                  'I understand renewal charges stop and this cannot be undone after grace.',
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!closeReady}
                  onClick={() => run(
                    () => api.requestWorkspaceClose(wsId, { phrase: 'CLOSE WORKSPACE' }),
                    lt('Close requested — confirm 3 times with phrase.'),
                  )}
                >
                  {lt('Request close')}
                </Button>
                <Button
                  disabled={!closeReady}
                  onClick={() => run(
                    () => api.confirmWorkspaceClose(wsId, { phrase: 'CLOSE WORKSPACE' }),
                    lt('Close confirmation recorded.'),
                  )}
                >
                  {lt('Confirm close step')}
                </Button>
                <Button
                  onClick={() => run(
                    () => api.completeWorkspaceClose(wsId),
                    lt('Close completed (or still in grace).'),
                  )}
                >
                  {lt('Complete after grace')}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default SettingsWorkspaceLifecycle;
