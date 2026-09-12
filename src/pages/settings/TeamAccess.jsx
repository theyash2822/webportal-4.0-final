/**
 * Team & Access — Web MD §15–23 (Members, Roles editor, Activity, Data Access).
 * Uses kit Modal/Card/Button; capability registry from backend (no hardcoded role names).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Shield, Activity } from 'lucide-react';
import { Card, Button, Input, Modal, useLabelT } from '../../components/kit';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const TABS = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const MODE_OPTS = [
  { value: 'ALL', label: 'All' },
  { value: 'SELECTED', label: 'Selected only' },
  { value: 'NONE', label: 'None' },
];

function unwrap(res) {
  return res?.data ?? res;
}

function PageSection({ title, sub, children, testid }) {
  const lt = useLabelT();
  return (
    <div className="space-y-4" data-testid={testid}>
      <div>
        <h2 className="text-base font-semibold text-ink">{lt(title)}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-soft">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function ModeSelect({ value, onChange, testid }) {
  const lt = useLabelT();
  return (
    <select
      className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
    >
      {MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{lt(o.label)}</option>)}
    </select>
  );
}

function GuidChecklist({ options, selected, onToggle, emptyLabel }) {
  const lt = useLabelT();
  if (!options?.length) {
    return <p className="text-xs text-ink-soft">{lt(emptyLabel || 'Nothing available yet.')}</p>;
  }
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-3">
      {options.map((o) => {
        const guid = o.guid || o.id || o;
        const label = o.name || o.display_name || guid;
        const id = String(guid);
        return (
          <li key={id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={selected.includes(id)} onChange={() => onToggle(id)} />
              <span className="truncate">{label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** MD §21 — categorize by party parent/group for Sales / Purchase / Accountant. */
function partyCategory(p) {
  const parent = String(p.parent || p.group || p.type || '').toLowerCase();
  if (/sundry\s*debtor|customer|receivable/.test(parent)) return 'sales';
  if (/sundry\s*creditor|vendor|supplier|payable/.test(parent)) return 'purchase';
  if (/cash|bank|od\b|overdraft|loan|expense|indirect|direct expense|duties|tax|capital|current asset|current liabilit|deposit|branch|stock/.test(parent)) {
    return 'accountant';
  }
  const tip = String(p.type || p.party_type || '').toLowerCase();
  if (/customer|debtor/.test(tip)) return 'sales';
  if (/vendor|supplier|creditor/.test(tip)) return 'purchase';
  return 'other';
}

function ModuleAwareLedgerChecklist({ options, selected, onToggle, emptyLabel }) {
  const lt = useLabelT();
  const groups = useMemo(() => {
    const map = { sales: [], purchase: [], accountant: [], other: [] };
    for (const o of options || []) {
      map[partyCategory(o)].push(o);
    }
    return map;
  }, [options]);

  if (!options?.length) {
    return <p className="text-xs text-ink-soft">{lt(emptyLabel || 'Nothing available yet.')}</p>;
  }

  const sections = [
    { key: 'sales', title: 'Sales — Sundry Debtors / customers' },
    { key: 'purchase', title: 'Purchase — Sundry Creditors / vendors' },
    { key: 'accountant', title: 'Accountant — Cash / Bank / other' },
    { key: 'other', title: 'Other ledgers' },
  ];

  return (
    <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
      {sections.map(({ key, title }) => {
        const rows = groups[key];
        if (!rows?.length) return null;
        return (
          <div key={key}>
            <p className="mb-1 text-xs font-bold uppercase text-ink-soft">{lt(title)}</p>
            <ul className="space-y-1">
              {rows.map((o) => {
                const id = String(o.guid || o.id);
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={selected.includes(id)} onChange={() => onToggle(id)} />
                      <span className="truncate">{o.name || id}</span>
                      {o.parent ? <span className="truncate text-[11px] text-ink-faint">({o.parent})</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsTeamAccess() {
  const lt = useLabelT();
  const { currentWorkspace, can, reloadWorkspaces, pairing } = useWorkspace();
  const { selectedCompany, companies: authCompanies } = useAuth();
  const [partyOptions, setPartyOptions] = useState([]);
  const [godownOptions, setGodownOptions] = useState([]);
  const [costCentreOptions, setCostCentreOptions] = useState([]);
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [audit, setAudit] = useState([]);
  const [seats, setSeats] = useState([]);
  const [wsCompanies, setWsCompanies] = useState([]);
  const [registry, setRegistry] = useState({ capabilities: [], sensitivePolicies: [] });
  const [inviteMobile, setInviteMobile] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteCompanyMode, setInviteCompanyMode] = useState('ALL');
  const [inviteCompanyGuids, setInviteCompanyGuids] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', message: '' });

  const [scopeMember, setScopeMember] = useState(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeForm, setScopeForm] = useState({
    company_mode: 'ALL', fy_mode: 'ALL', ledger_mode: 'ALL', godown_mode: 'ALL', cost_centre_mode: 'ALL',
    companies: [], financialYears: [], ledgers: [], godowns: [], costCentres: [],
  });

  const [roleEdit, setRoleEdit] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleForm, setRoleForm] = useState({ displayName: '', entryMode: 'BOTH', capabilities: {}, sensitivePolicies: {} });

  const [changeRoleMember, setChangeRoleMember] = useState(null);
  const [changeRoleId, setChangeRoleId] = useState('');

  const wsId = currentWorkspace?.id;
  const companyOptions = (wsCompanies?.length ? wsCompanies : authCompanies) || [];
  const availableSeats = seats.filter((s) => s.status === 'AVAILABLE' && s.seat_kind === 'PAID');
  const tallyConnected = ['CONNECTED', 'connected'].includes(pairing?.status || currentWorkspace?.tallyConnection || '');

  const capsByCategory = useMemo(() => {
    const map = {};
    for (const c of registry.capabilities || []) {
      if (!c.customer_surface && c.customer_surface !== undefined) continue;
      const cat = c.category || 'OTHER';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    }
    return map;
  }, [registry]);

  const load = useCallback(async () => {
    if (!wsId) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [m, r, a, ctx, seatRes, reg] = await Promise.all([
        api.fetchWorkspaceMembers(wsId).catch(() => ({ data: [] })),
        api.fetchWorkspaceRoles(wsId).catch(() => ({ data: [] })),
        api.fetchWorkspaceAudit(wsId).catch(() => ({ data: [] })),
        api.fetchWorkspaceContext(wsId).catch(() => null),
        api.fetchWorkspaceSeats(wsId).catch(() => ({ data: [] })),
        api.fetchCapabilityRegistry().catch(() => ({ data: { capabilities: [], sensitivePolicies: [] } })),
      ]);
      setMembers(unwrap(m) || []);
      const roleList = unwrap(r) || [];
      setRoles(roleList);
      setInviteRoleId((prev) => prev || roleList[0]?.id || '');
      setAudit(unwrap(a) || []);
      setWsCompanies(unwrap(ctx)?.companies || []);
      setSeats(unwrap(seatRes) || []);
      const regData = unwrap(reg) || {};
      setRegistry({
        capabilities: regData.capabilities || [],
        sensitivePolicies: regData.sensitivePolicies || regData.sensitive_policies || [],
      });
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Failed to load' }));
    }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  const toggleList = (id, key) => {
    setScopeForm((f) => {
      const arr = f[key] || [];
      return { ...f, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });
  };

  const openDataAccess = async (member) => {
    if (!can('members.scope_manage') && !can('workspace.scope.manage')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    setScopeMember(member);
    setScopeLoading(true);
    try {
      const scopes = unwrap(await api.fetchMemberScopes(wsId, member.id)) || {};
      const policy = scopes.policy || {};
      setScopeForm({
        company_mode: policy.company_mode || 'ALL',
        fy_mode: policy.fy_mode || 'ALL',
        ledger_mode: policy.ledger_mode || 'ALL',
        godown_mode: policy.godown_mode || 'ALL',
        cost_centre_mode: policy.cost_centre_mode || 'ALL',
        companies: scopes.companies || [],
        financialYears: scopes.financialYears || [],
        ledgers: (scopes.ledgers || []).map((L) => (typeof L === 'string' ? L : L.ledger_guid)).filter(Boolean),
        godowns: (scopes.godowns || []).map((G) => (typeof G === 'string' ? G : G.godown_guid)).filter(Boolean),
        costCentres: (scopes.costCentres || []).map((C) => (typeof C === 'string' ? C : C.cost_centre_guid)).filter(Boolean),
      });
      const cg = selectedCompany?.guid || companyOptions[0]?.guid;
      if (cg) {
        const [parties, wh, ccs] = await Promise.all([
          api.fetchPartiesList(cg, { limit: 500 }).catch(() => ({ data: [] })),
          api.fetchWarehouses(cg).catch(() => ({ data: [] })),
          api.fetchCostCentres(cg).catch(() => ({ data: [] })),
        ]);
        const pList = unwrap(parties);
        const partyArr = Array.isArray(pList) ? pList : (pList?.parties || pList?.ledgers || []);
        setPartyOptions(partyArr.map((p) => ({
          guid: p.guid || p.ledger_guid,
          name: p.name || p.ledger_name,
          parent: p.parent || p.group || p.type || '',
          type: p.type || p.party_type || '',
        })));
        const wList = unwrap(wh);
        const whArr = Array.isArray(wList) ? wList : (wList?.warehouses || wList?.godowns || []);
        setGodownOptions(whArr.map((g) => ({ guid: g.guid || g.godown_guid || g.name, name: g.name || g.godown_name })));
        const ccList = unwrap(ccs);
        const ccArr = Array.isArray(ccList) ? ccList : (ccList?.costCentres || ccList?.cost_centres || []);
        setCostCentreOptions(ccArr.map((c) => ({
          guid: c.guid || c.cost_centre_guid || c.id,
          name: c.name || c.cost_centre_name || c.display_name,
        })).filter((c) => c.guid));
      } else {
        setCostCentreOptions([]);
      }
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    } finally {
      setScopeLoading(false);
    }
  };

  const saveDataAccess = async () => {
    if (!scopeMember?.id) return;
    setScopeSaving(true);
    try {
      await api.putMemberScopes(wsId, scopeMember.id, {
        policy: {
          company_mode: scopeForm.company_mode,
          fy_mode: scopeForm.fy_mode,
          ledger_mode: scopeForm.ledger_mode,
          godown_mode: scopeForm.godown_mode,
          cost_centre_mode: scopeForm.cost_centre_mode,
        },
        companies: scopeForm.company_mode === 'SELECTED' ? scopeForm.companies : [],
        financialYears: scopeForm.fy_mode === 'SELECTED' ? scopeForm.financialYears : [],
        ledgers: scopeForm.ledger_mode === 'SELECTED' ? scopeForm.ledgers.map((g) => ({ ledger_guid: g })) : [],
        godowns: scopeForm.godown_mode === 'SELECTED' ? scopeForm.godowns.map((g) => ({ godown_guid: g })) : [],
        costCentres: scopeForm.cost_centre_mode === 'SELECTED' ? scopeForm.costCentres.map((g) => ({ cost_centre_guid: g })) : [],
      });
      setState((s) => ({ ...s, message: lt('Data access saved.'), error: '' }));
      setScopeMember(null);
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    } finally {
      setScopeSaving(false);
    }
  };

  const openRoleEditor = async (role) => {
    if (!can('roles.edit') && !can('workspace.roles.manage')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    setRoleEdit(role);
    setRoleLoading(true);
    try {
      const full = unwrap(await api.fetchWorkspaceRole(wsId, role.id)) || role;
      setRoleForm({
        displayName: full.display_name || full.displayName || '',
        entryMode: full.entry_mode || full.entryMode || 'BOTH',
        capabilities: full.capabilities || {},
        sensitivePolicies: full.sensitivePolicies || full.sensitive_policies || {},
      });
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setRoleLoading(false);
    }
  };

  const saveRole = async () => {
    if (!roleEdit?.id) return;
    setRoleSaving(true);
    try {
      await api.patchWorkspaceRole(wsId, roleEdit.id, {
        displayName: roleForm.displayName,
        entryMode: roleForm.entryMode,
        capabilities: roleForm.capabilities,
        sensitivePolicies: roleForm.sensitivePolicies,
      });
      setState((s) => ({ ...s, message: lt('Role saved.'), error: '' }));
      setRoleEdit(null);
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    } finally {
      setRoleSaving(false);
    }
  };

  const saveChangeRole = async () => {
    if (!changeRoleMember || !changeRoleId) return;
    try {
      await api.patchWorkspaceMemberRole(wsId, changeRoleMember.user_id, { roleId: changeRoleId });
      setState((s) => ({ ...s, message: lt('Role updated.'), error: '' }));
      setChangeRoleMember(null);
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || 'Change role failed — API may still be deploying.' }));
    }
  };

  const invite = async () => {
    if (!wsId || !can('members.invite')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    if (!tallyConnected) {
      setState((s) => ({ ...s, error: lt('Workspace must be Tally-connected before inviting members.') }));
      return;
    }
    if (!availableSeats.length) {
      // MD prefers an available paid seat; backend may still accept and leave seat null.
      console.warn('[TeamAccess] No AVAILABLE paid seat — invite may fail or join without seat.');
    }
    setState((s) => ({ ...s, message: '', error: '' }));
    try {
      await api.createWorkspaceInvitation(wsId, {
        mobile: inviteMobile,
        roleId: inviteRoleId,
        scopes: {
          policy: {
            company_mode: inviteCompanyMode,
            fy_mode: 'ALL',
            ledger_mode: 'ALL',
            godown_mode: 'ALL',
            cost_centre_mode: 'ALL',
          },
          companies: inviteCompanyMode === 'SELECTED' ? inviteCompanyGuids : [],
        },
      });
      setInviteMobile('');
      setInviteCompanyMode('ALL');
      setInviteCompanyGuids([]);
      setState((s) => ({ ...s, message: lt('Invitation sent.') }));
      await load();
      await reloadWorkspaces?.();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || 'Invite failed' }));
    }
  };

  const suspend = async (userId) => {
    if (!can('members.remove')) return;
    await api.suspendWorkspaceMember(wsId, userId);
    await load();
  };
  const unsuspend = async (userId) => {
    if (!can('members.remove')) return;
    await api.unsuspendWorkspaceMember(wsId, userId);
    await load();
  };
  const remove = async (userId) => {
    if (!can('members.remove')) return;
    if (!window.confirm(lt('Remove this member from the workspace?'))) return;
    await api.removeWorkspaceMember(wsId, userId);
    await load();
  };

  const canEditScopes = can('members.scope_manage') || can('workspace.scope.manage');
  const canEditRoles = can('roles.edit') || can('workspace.roles.manage');
  const canAssignRole = can('members.role_assign') || canEditRoles;

  if (!wsId) {
    return (
      <PageSection title="Team & Access" testid="settings-team-access">
        <Card className="p-5"><p className="text-sm text-ink-soft">{lt('Select a workspace to manage team access.')}</p></Card>
      </PageSection>
    );
  }

  return (
    <PageSection title="Team & Access" sub={currentWorkspace?.name} testid="settings-team-access">
      {state.error && <p className="text-sm font-medium text-alert">{state.error}</p>}
      {state.message && <p className="text-sm font-medium text-emerald-700">{state.message}</p>}

      <div className="flex gap-2 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream'
            }`}
          >
            <t.icon size={14} /> {lt(t.label)}
          </button>
        ))}
      </div>

      {state.loading && <p className="text-sm text-ink-soft">{lt('Loading…')}</p>}

      {tab === 'members' && !state.loading && (
        <div className="space-y-4">
          {can('members.invite') && (
            <Card className="space-y-3 p-5">
              <p className="text-sm font-semibold text-ink">{lt('Invite member')}</p>
              <p className="text-xs text-ink-soft">
                {lt('Requires Tally-connected workspace and an available paid seat.')}
                {' '}
                {tallyConnected ? lt('Tally: connected.') : lt('Tally: not connected.')}
                {' · '}
                {lt('Available seats:')} {availableSeats.length}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Mobile')}</label>
                  <Input value={inviteMobile} onChange={(e) => setInviteMobile(e.target.value)} placeholder="10-digit mobile" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Role')}</label>
                  <select className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name || r.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Company access')}</label>
                <ModeSelect value={inviteCompanyMode} onChange={setInviteCompanyMode} />
                {inviteCompanyMode === 'SELECTED' && (
                  <div className="mt-2">
                    <GuidChecklist
                      options={companyOptions}
                      selected={inviteCompanyGuids}
                      onToggle={(id) => setInviteCompanyGuids((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                      emptyLabel="No companies in this workspace yet. Pair Tally or sync first."
                    />
                  </div>
                )}
              </div>
              <Button onClick={invite}>{lt('Send invite')}</Button>
            </Card>
          )}

          <Card className="p-5">
            <p className="mb-2 text-sm font-semibold text-ink">{lt('Members')}</p>
            <ul className="divide-y divide-line">
              {(members || []).map((m) => (
                <li key={m.id || m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{m.user_name || m.name || m.user_mobile || m.mobile || `User ${m.user_id}`}</p>
                    <p className="text-xs text-ink-soft">
                      {m.membership_type || m.membershipType}
                      {m.role_display_name ? ` · ${m.role_display_name}` : ''}
                      {m.status ? ` · ${m.status}` : ''}
                      {m.seat_id ? ` · Seat assigned` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.membership_type !== 'OWNER' && canAssignRole && (
                      <Button onClick={() => { setChangeRoleMember(m); setChangeRoleId(m.role_id || roles[0]?.id || ''); }}>{lt('Change role')}</Button>
                    )}
                    {m.membership_type !== 'OWNER' && canEditScopes && (
                      <Button onClick={() => openDataAccess(m)} data-testid={`member-data-access-${m.user_id}`}>{lt('Data access')}</Button>
                    )}
                    {m.membership_type !== 'OWNER' && can('members.remove') && (
                      <>
                        {m.status === 'SUSPENDED'
                          ? <Button onClick={() => unsuspend(m.user_id)}>{lt('Unsuspend')}</Button>
                          : <Button onClick={() => suspend(m.user_id)}>{lt('Suspend')}</Button>}
                        <Button onClick={() => remove(m.user_id)}>{lt('Remove')}</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {!members?.length && <li className="py-3 text-sm text-ink-soft">{lt('No members yet.')}</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'roles' && !state.loading && (
        <Card className="p-5">
          <p className="mb-2 text-sm font-semibold text-ink">{lt('Roles')}</p>
          <p className="mb-3 text-xs text-ink-soft">{lt('Edit permissions, Entry Mode, and sensitive data from the backend registry. Owner is not a role.')}</p>
          <ul className="divide-y divide-line">
            {(roles || []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{r.display_name || r.name}</p>
                  <p className="text-xs text-ink-soft">
                    {r.system_key || 'Custom'} · Entry {r.entry_mode || 'BOTH'}
                    {r.is_builtin ? ' · Built-in' : ''}
                  </p>
                </div>
                {canEditRoles && (
                  <Button onClick={() => openRoleEditor(r)} data-testid={`role-edit-${r.id}`}>{lt('Edit role')}</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'activity' && !state.loading && (
        <Card className="p-5">
          <p className="mb-2 text-sm font-semibold text-ink">{lt('Activity')}</p>
          <ul className="divide-y divide-line">
            {(audit || []).map((row) => (
              <li key={row.id} className="py-3">
                <p className="text-sm font-semibold text-ink">{row.action || row.event}</p>
                <p className="text-xs text-ink-soft">
                  {row.created_at ? new Date(Number(row.created_at) * 1000).toLocaleString() : ''}
                  {row.actor_user_id ? ` · user ${row.actor_user_id}` : ''}
                </p>
              </li>
            ))}
            {!audit?.length && <li className="py-3 text-sm text-ink-soft">{lt('No activity yet.')}</li>}
          </ul>
        </Card>
      )}

      {/* Data access modal — MD §20 */}
      <Modal
        open={!!scopeMember}
        onClose={() => setScopeMember(null)}
        title={lt('Data access')}
        sub={scopeMember?.user_name || scopeMember?.user_mobile || ''}
        wide
        testid="member-data-access-modal"
        footer={(
          <>
            <Button onClick={() => setScopeMember(null)}>{lt('Cancel')}</Button>
            <Button variant="primary" disabled={scopeSaving || scopeLoading} onClick={saveDataAccess}>
              {scopeSaving ? lt('Saving…') : lt('Save')}
            </Button>
          </>
        )}
      >
        {scopeLoading ? <p className="text-sm text-ink-soft">{lt('Loading…')}</p> : (
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto sm:grid-cols-2">
            {[
              ['company_mode', 'Companies', 'companies', companyOptions, 'No companies synced yet.'],
              ['fy_mode', 'Financial years', 'financialYears', [], 'Enter FY keys when using Selected (e.g. 2025-2026).'],
              ['ledger_mode', 'Ledgers / Parties', 'ledgers', partyOptions, 'No parties loaded — select a company in the header first.'],
              ['godown_mode', 'Godowns / Warehouses', 'godowns', godownOptions, 'No warehouses loaded — select a company in the header first.'],
              ['cost_centre_mode', 'Cost centres', 'costCentres', costCentreOptions, 'No cost centres synced yet — select a company in the header, or paste GUIDs below.'],
            ].map(([modeKey, title, listKey, options, empty]) => (
              <div key={modeKey} className="space-y-2 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold text-ink">{lt(title)}</p>
                <ModeSelect value={scopeForm[modeKey]} onChange={(v) => setScopeForm((f) => ({ ...f, [modeKey]: v }))} />
                {scopeForm[modeKey] === 'SELECTED' && listKey === 'financialYears' && (
                  <Input
                    placeholder="2024-2025,2025-2026"
                    value={(scopeForm.financialYears || []).join(',')}
                    onChange={(e) => setScopeForm((f) => ({
                      ...f,
                      financialYears: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    }))}
                  />
                )}
                {scopeForm[modeKey] === 'SELECTED' && listKey === 'ledgers' && (
                  <ModuleAwareLedgerChecklist
                    options={options}
                    selected={scopeForm[listKey]}
                    onToggle={(id) => toggleList(id, listKey)}
                    emptyLabel={empty}
                  />
                )}
                {scopeForm[modeKey] === 'SELECTED' && ['companies', 'godowns'].includes(listKey) && (
                  <GuidChecklist options={options} selected={scopeForm[listKey]} onToggle={(id) => toggleList(id, listKey)} emptyLabel={empty} />
                )}
                {scopeForm[modeKey] === 'SELECTED' && listKey === 'costCentres' && (
                  <div className="space-y-2">
                    {options?.length ? (
                      <GuidChecklist
                        options={options}
                        selected={scopeForm.costCentres}
                        onToggle={(id) => toggleList(id, 'costCentres')}
                        emptyLabel={empty}
                      />
                    ) : (
                      <>
                        <p className="text-xs text-ink-soft">{lt(empty)}</p>
                        <Input
                          placeholder={lt('Optional: comma-separated GUIDs')}
                          value={(scopeForm.costCentres || []).join(',')}
                          onChange={(e) => setScopeForm((f) => ({
                            ...f,
                            costCentres: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          }))}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Role editor — MD §18–19, §23 */}
      <Modal
        open={!!roleEdit}
        onClose={() => setRoleEdit(null)}
        title={lt('Edit role')}
        sub={roleEdit?.system_key || ''}
        wide
        testid="role-editor-modal"
        footer={(
          <>
            <Button onClick={() => setRoleEdit(null)}>{lt('Cancel')}</Button>
            <Button variant="primary" disabled={roleSaving || roleLoading} onClick={saveRole}>
              {roleSaving ? lt('Saving…') : lt('Save role')}
            </Button>
          </>
        )}
      >
        {roleLoading ? <p className="text-sm text-ink-soft">{lt('Loading…')}</p> : (
          <div className="max-h-[65vh] space-y-5 overflow-y-auto">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Display name')}</label>
              <Input value={roleForm.displayName} onChange={(e) => setRoleForm((f) => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">{lt('1. Permissions')}</p>
              <div className="space-y-3">
                {Object.entries(capsByCategory).map(([cat, caps]) => (
                  <div key={cat} className="rounded-lg border border-line p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-ink-soft">{cat}</p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {caps.map((c) => (
                        <li key={c.key}>
                          <label className="flex items-start gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!roleForm.capabilities[c.key]}
                              disabled={c.protected_authority === 'OWNER'}
                              onChange={(e) => setRoleForm((f) => ({
                                ...f,
                                capabilities: { ...f.capabilities, [c.key]: e.target.checked },
                              }))}
                            />
                            <span>{c.display_name || c.key}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">{lt('2. Entry Mode')}</p>
              <p className="mb-2 text-xs text-ink-soft">{lt('Applies to Sales Invoice / Sales Order create only.')}</p>
              {['OPTIONAL', 'REGULAR', 'BOTH'].map((m) => (
                <label key={m} className="mr-4 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entryMode"
                    checked={roleForm.entryMode === m}
                    onChange={() => setRoleForm((f) => ({ ...f, entryMode: m }))}
                  />
                  {m === 'OPTIONAL' ? lt('Optional only') : m === 'REGULAR' ? lt('Regular only') : lt('Both')}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">{lt('3. Sensitive data')}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(registry.sensitivePolicies || []).map((p) => (
                  <li key={p.key}>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={roleForm.sensitivePolicies[p.key] !== false}
                        onChange={(e) => setRoleForm((f) => ({
                          ...f,
                          sensitivePolicies: { ...f.sensitivePolicies, [p.key]: e.target.checked },
                        }))}
                      />
                      {p.display_name || p.key}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!changeRoleMember}
        onClose={() => setChangeRoleMember(null)}
        title={lt('Change role')}
        footer={(
          <>
            <Button onClick={() => setChangeRoleMember(null)}>{lt('Cancel')}</Button>
            <Button variant="primary" onClick={saveChangeRole}>{lt('Save')}</Button>
          </>
        )}
      >
        <select className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" value={changeRoleId} onChange={(e) => setChangeRoleId(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name || r.name}</option>)}
        </select>
      </Modal>
    </PageSection>
  );
}

export default SettingsTeamAccess;
