/**
 * Team & Access — Web MD §15–23 (Members, Roles editor, Activity, Data Access).
 * Uses kit Modal/Card/Button; capability registry from backend (no hardcoded role names).
 */
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Users, Shield, Activity } from 'lucide-react';
import { Card, Button, Input, Modal, useLabelT } from '../../components/kit';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import api, { workspaceStamp, isWorkspaceCurrent } from '../../services/api';
import { isEventForActiveWorkspace } from '../../utils/workspaceEvents';
import { partyCategory } from '../../utils/partyCategory.js';
import wsService from '../../services/websocket';

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

const AUDIT_LABELS = {
  'workspace.entered': 'Entered workspace',
  'workspace.bootstrap': 'Workspace created',
  'workspace.renamed': 'Workspace renamed',
  'workspace.created_paid': 'Paid workspace created',
  'seat.purchased': 'Seat purchased',
  'invitation.created': 'Invitation sent',
  'invitation.accepted': 'Invitation accepted',
  'invitation.declined': 'Invitation declined',
  'invitation.revoked': 'Invitation revoked',
  'member.removed': 'Member removed',
  'member.suspended': 'Member suspended',
  'member.unsuspended': 'Member unsuspended',
  'member.role_changed': 'Member role changed',
  'tally.pair': 'Tally paired',
  'tally.unpair': 'Tally unpaired',
  'ownership.transfer_initiated': 'Ownership transfer started',
  'ownership.transfer_completed': 'Ownership transferred',
};

function humanizeAudit(row) {
  const key = row?.event_type || row?.action || row?.event || '';
  if (AUDIT_LABELS[key]) return AUDIT_LABELS[key];
  if (!key) return 'Activity';
  return String(key).replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function auditActorLabel(row) {
  if (row?.actor_name) return row.actor_name;
  if (row?.actor_mobile) return row.actor_mobile;
  if (row?.actor_user_id) return `User ${row.actor_user_id}`;
  return '';
}

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
  const { currentWorkspace, can, reloadWorkspaces, pairing, membershipType } = useWorkspace();
  const { selectedCompany, companies: authCompanies } = useAuth();
  const [partyOptions, setPartyOptions] = useState([]);
  const [godownOptions, setGodownOptions] = useState([]);
  const [costCentreOptions, setCostCentreOptions] = useState([]);
  const [fyOptions, setFyOptions] = useState([]);
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [audit, setAudit] = useState([]);
  const [seats, setSeats] = useState([]);
  const [wsCompanies, setWsCompanies] = useState([]);
  const [registry, setRegistry] = useState({ capabilities: [], sensitivePolicies: [] });
  const [inviteMobile, setInviteMobile] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteCompanyMode, setInviteCompanyMode] = useState('');
  const [inviteCompanyGuids, setInviteCompanyGuids] = useState([]);
  const [inviteFyMode, setInviteFyMode] = useState('ALL');
  const [inviteFys, setInviteFys] = useState([]);
  const [inviteLedgerMode, setInviteLedgerMode] = useState('ALL');
  const [inviteLedgers, setInviteLedgers] = useState([]);
  const [inviteGodownMode, setInviteGodownMode] = useState('ALL');
  const [inviteGodowns, setInviteGodowns] = useState([]);
  const [inviteCcMode, setInviteCcMode] = useState('ALL');
  const [inviteCostCentres, setInviteCostCentres] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', message: '' });

  const [scopeMember, setScopeMember] = useState(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeForm, setScopeForm] = useState({
    company_mode: 'NONE', fy_mode: 'NONE', ledger_mode: 'NONE', godown_mode: 'NONE', cost_centre_mode: 'NONE',
    companies: [], financialYears: [], ledgers: [], godowns: [], costCentres: [],
  });

  const [roleEdit, setRoleEdit] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleForm, setRoleForm] = useState({ displayName: '', entryMode: 'BOTH', capabilities: {}, sensitivePolicies: {} });
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [createRoleForm, setCreateRoleForm] = useState({ displayName: '', entryMode: 'BOTH' });
  const [createRoleSaving, setCreateRoleSaving] = useState(false);

  const [changeRoleMember, setChangeRoleMember] = useState(null);
  const [changeRoleId, setChangeRoleId] = useState('');
  const [removingUserId, setRemovingUserId] = useState(null);
  const inviteInFlight = useRef(false);

  const wsId = currentWorkspace?.id;
  const memberUserId = (m) => m?.user_id ?? m?.userId ?? null;
  const memberType = (m) => String(m?.membership_type || m?.membershipType || '').toUpperCase();
  /** Display: Owner, or role label (Admin / Accountant / …) — never raw MEMBER for admin-equivalent. */
  const memberRoleLabel = (m) => {
    if (memberType(m) === 'OWNER') return 'Owner';
    return m.role_display_name || m.roleDisplayName || m.role_system_key || m.roleSystemKey || 'Member';
  };

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
    const stamp = workspaceStamp();
    setMembers([]);
    setAudit([]);
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
      if (!isWorkspaceCurrent(stamp)) return;
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

  useEffect(() => {
    if (!wsId) return undefined;
    const refresh = (data) => {
      if (data && !isEventForActiveWorkspace(data, wsId)) return;
      const stamp = workspaceStamp();
      api.fetchWorkspaceAudit(wsId).then((res) => {
        if (!isWorkspaceCurrent(stamp)) return;
        setAudit(unwrap(res) || []);
      }).catch(() => {});
      if (tab === 'members') {
        api.fetchWorkspaceMembers(wsId).then((res) => {
          if (!isWorkspaceCurrent(stamp)) return;
          setMembers(unwrap(res) || []);
        }).catch(() => {});
      }
    };
    const offAudit = wsService.on('workspace_audit', refresh);
    const offMem = wsService.on('membership_changed', refresh);
    return () => {
      offAudit?.();
      offMem?.();
    };
  }, [wsId, tab]);

  const loadInvitePickers = useCallback(async (companyGuid) => {
    const cg = companyGuid || selectedCompany?.guid || companyOptions[0]?.guid;
    if (!cg) return;
    const [parties, wh, ccs, yearsRes] = await Promise.all([
      api.fetchPartiesList(cg, { limit: 500 }).catch(() => ({ data: [] })),
      api.fetchWarehouses(cg).catch(() => ({ data: [] })),
      api.fetchCostCentres(cg).catch(() => ({ data: [] })),
      api.fetchCompanyYears(cg).catch(() => null),
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

    const fromAuth = [];
    const companiesSrc = companyOptions.length ? companyOptions : (authCompanies || []);
    for (const c of companiesSrc) {
      for (const y of c.years || []) {
        const key = y.key || y.uniqueId || y.fy || y.name || `${y.startDate}_${y.endDate}`;
        if (key) fromAuth.push({ guid: String(key), name: y.name || y.label || String(key) });
      }
    }
    const yData = unwrap(yearsRes);
    const yArr = Array.isArray(yData) ? yData : (yData?.years || []);
    const fromApi = yArr.map((y) => {
      const key = y.key || y.uniqueId || y.fy || y.name || `${y.startDate || y.begin_date}_${y.endDate || y.end_date}`;
      return { guid: String(key), name: y.name || y.label || String(key) };
    });
    const seen = new Set();
    const merged = [...fromAuth, ...fromApi].filter((y) => {
      if (seen.has(y.guid)) return false;
      seen.add(y.guid);
      return true;
    });
    setFyOptions(merged);
  }, [selectedCompany?.guid, companyOptions, authCompanies]);

  useEffect(() => {
    const needPickers = [inviteFyMode, inviteLedgerMode, inviteGodownMode, inviteCcMode].some((m) => m === 'SELECTED')
      || inviteCompanyMode === 'SELECTED';
    if (!needPickers) return;
    const cg = inviteCompanyMode === 'SELECTED' && inviteCompanyGuids[0]
      ? inviteCompanyGuids[0]
      : (selectedCompany?.guid || companyOptions[0]?.guid);
    if (cg) loadInvitePickers(cg);
  }, [
    inviteCompanyMode, inviteCompanyGuids, inviteFyMode, inviteLedgerMode, inviteGodownMode, inviteCcMode,
    selectedCompany?.guid, companyOptions, loadInvitePickers,
  ]);

  const toggleList = (id, key) => {
    setScopeForm((f) => {
      const arr = f[key] || [];
      return { ...f, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });
  };

  const openDataAccess = async (member) => {
    if (!can('members.scope_manage')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    setScopeMember(member);
    setScopeLoading(true);
    try {
      const scopes = unwrap(await api.fetchMemberScopes(wsId, member.id)) || {};
      const policy = scopes.policy || {};
      setScopeForm({
        company_mode: policy.company_mode || 'NONE',
        fy_mode: policy.fy_mode || 'NONE',
        ledger_mode: policy.ledger_mode || 'NONE',
        godown_mode: policy.godown_mode || 'NONE',
        cost_centre_mode: policy.cost_centre_mode || 'NONE',
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
    if (!can('roles.edit')) {
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
    const uid = memberUserId(changeRoleMember);
    if (!Number.isFinite(Number(uid))) {
      setState((s) => ({ ...s, error: lt('Missing member user id.') }));
      return;
    }
    try {
      await api.patchWorkspaceMemberRole(wsId, uid, { roleId: changeRoleId });
      setState((s) => ({ ...s, message: lt('Role updated.'), error: '' }));
      setChangeRoleMember(null);
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || 'Change role failed — API may still be deploying.' }));
    }
  };

  const invite = async () => {
    if (inviteInFlight.current) return;
    if (!wsId || !can('members.invite')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    if (!tallyConnected) {
      setState((s) => ({
        ...s,
        error: lt('Connect Tally and complete the first sync before inviting new members.'),
      }));
      return;
    }
    if (!availableSeats.length) {
      console.warn('[TeamAccess] No AVAILABLE paid seat — invite may fail or join without seat.');
    }
    const companyReady = inviteCompanyMode === 'ALL'
      || (inviteCompanyMode === 'SELECTED' && inviteCompanyGuids.length > 0);
    if (!companyReady) {
      setState((s) => ({
        ...s,
        error: lt('Choose All companies or at least one company before sending the invite.'),
      }));
      return;
    }
    setState((s) => ({ ...s, message: '', error: '' }));
    inviteInFlight.current = true;
    try {
      await api.createWorkspaceInvitation(wsId, {
        mobile: inviteMobile,
        roleId: inviteRoleId,
        scopes: {
          policy: {
            company_mode: inviteCompanyMode,
            fy_mode: inviteFyMode,
            ledger_mode: inviteLedgerMode,
            godown_mode: inviteGodownMode,
            cost_centre_mode: inviteCcMode,
          },
          companies: inviteCompanyMode === 'SELECTED' ? inviteCompanyGuids : [],
          financialYears: inviteFyMode === 'SELECTED' ? inviteFys : [],
          ledgers: inviteLedgerMode === 'SELECTED' ? inviteLedgers.map((g) => ({ ledger_guid: g })) : [],
          godowns: inviteGodownMode === 'SELECTED' ? inviteGodowns.map((g) => ({ godown_guid: g })) : [],
          costCentres: inviteCcMode === 'SELECTED' ? inviteCostCentres.map((g) => ({ cost_centre_guid: g })) : [],
        },
      });
      setInviteMobile('');
      setInviteCompanyMode('');
      setInviteCompanyGuids([]);
      setInviteFyMode('ALL');
      setInviteFys([]);
      setInviteLedgerMode('ALL');
      setInviteLedgers([]);
      setInviteGodownMode('ALL');
      setInviteGodowns([]);
      setInviteCcMode('ALL');
      setInviteCostCentres([]);
      setState((s) => ({ ...s, message: lt('Invitation sent.') }));
      await load();
      await reloadWorkspaces?.();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || 'Invite failed' }));
    } finally {
      inviteInFlight.current = false;
    }
  };

  const canEditScopes = can('members.scope_manage');
  const canEditRoles = can('roles.edit');
  const canAssignRole = can('members.role_assign') || canEditRoles;

  const createRole = async () => {
    if (!canEditRoles || !wsId) return;
    if (!createRoleForm.displayName.trim()) {
      setState((s) => ({ ...s, error: lt('Enter a display name for the role.') }));
      return;
    }
    setCreateRoleSaving(true);
    setState((s) => ({ ...s, error: '', message: '' }));
    try {
      const res = await api.createWorkspaceRole(wsId, {
        displayName: createRoleForm.displayName.trim(),
        entryMode: createRoleForm.entryMode,
      });
      const created = unwrap(res) || {};
      const role = created.role || created;
      setCreateRoleOpen(false);
      setCreateRoleForm({ displayName: '', entryMode: 'BOTH' });
      setState((s) => ({ ...s, message: lt('Role created.') }));
      await load();
      if (role?.id) await openRoleEditor(role);
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    } finally {
      setCreateRoleSaving(false);
    }
  };

  const deleteRole = async (role) => {
    if (!canEditRoles || !wsId || !role?.id) return;
    if (role.system_key || role.is_builtin) return;
    if (!window.confirm(lt('Delete this custom role?'))) return;
    try {
      await api.deleteWorkspaceRole(wsId, role.id);
      setState((s) => ({ ...s, message: lt('Role deleted.'), error: '' }));
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message }));
    }
  };

  const suspend = async (userId) => {
    if (!(can('members.suspend') || can('members.remove') || membershipType === 'OWNER')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    try {
      await api.suspendWorkspaceMember(wsId, userId);
      setState((s) => ({ ...s, message: lt('Member suspended.'), error: '' }));
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || lt('Suspend failed') }));
    }
  };
  const unsuspend = async (userId) => {
    if (!(can('members.unsuspend') || can('members.suspend') || can('members.remove') || membershipType === 'OWNER')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    try {
      await api.unsuspendWorkspaceMember(wsId, userId);
      setState((s) => ({ ...s, message: lt('Member unsuspended.'), error: '' }));
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.data?.error?.message || err.message || lt('Unsuspend failed') }));
    }
  };
  const remove = async (userId) => {
    if (!(can('members.remove') || membershipType === 'OWNER')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    const uid = userId != null && userId !== '' ? Number(userId) : NaN;
    if (!Number.isFinite(uid)) {
      setState((s) => ({ ...s, error: lt('Missing member user id.') }));
      return;
    }
    if (!window.confirm(lt('Remove this member from the workspace?'))) return;
    setRemovingUserId(uid);
    setState((s) => ({ ...s, error: '', message: '' }));
    try {
      await api.removeWorkspaceMember(wsId, uid);
      setState((s) => ({ ...s, message: lt('Member removed.'), error: '' }));
      await load();
    } catch (err) {
      const msg = err?.data?.error?.message || err.message || lt('Remove failed');
      const network = /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''));
      setState((s) => ({
        ...s,
        error: network
          ? lt('Remove failed — cannot reach API. Check that the backend is running on :3001.')
          : msg,
      }));
    } finally {
      setRemovingUserId(null);
    }
  };

  const canRemoveMember = can('members.remove') || membershipType === 'OWNER';
  const canSuspendMember = can('members.suspend') || can('members.remove') || membershipType === 'OWNER';
  const canUnsuspendMember = can('members.unsuspend') || can('members.suspend') || can('members.remove') || membershipType === 'OWNER';

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
              {!tallyConnected && (
                <p className="text-xs font-medium text-warn" data-testid="invite-tally-required">
                  {lt('Connect Tally and complete the first sync before inviting new members.')}
                </p>
              )}
              <fieldset disabled={!tallyConnected} className={!tallyConnected ? 'opacity-60' : undefined}>
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
                <select
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                  value={inviteCompanyMode}
                  onChange={(e) => setInviteCompanyMode(e.target.value)}
                  data-testid="invite-company-mode"
                >
                  <option value="">{lt('Choose company access…')}</option>
                  <option value="ALL">{lt('All companies')}</option>
                  <option value="SELECTED">{lt('Selected companies')}</option>
                </select>
                {inviteCompanyMode === 'NONE' && (
                  <p className="mt-1 text-xs text-ink-soft" data-testid="invite-company-none-warn">
                    {lt('This member will join the workspace but will not be able to view company data until company access is assigned.')}
                  </p>
                )}
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
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Financial years')}</label>
                <ModeSelect value={inviteFyMode} onChange={setInviteFyMode} testid="invite-fy-mode" />
                {inviteFyMode === 'SELECTED' && (
                  <div className="mt-2">
                    <GuidChecklist
                      options={fyOptions}
                      selected={inviteFys}
                      onToggle={(id) => setInviteFys((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                      emptyLabel="No financial years found for the selected company."
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Ledgers / Parties')}</label>
                <ModeSelect value={inviteLedgerMode} onChange={setInviteLedgerMode} testid="invite-ledger-mode" />
                {inviteLedgerMode === 'SELECTED' && (
                  <div className="mt-2">
                    <ModuleAwareLedgerChecklist
                      options={partyOptions}
                      selected={inviteLedgers}
                      onToggle={(id) => setInviteLedgers((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                      emptyLabel="No parties loaded — select a company first."
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Godowns / Warehouses')}</label>
                <ModeSelect value={inviteGodownMode} onChange={setInviteGodownMode} testid="invite-godown-mode" />
                {inviteGodownMode === 'SELECTED' && (
                  <div className="mt-2">
                    <GuidChecklist
                      options={godownOptions}
                      selected={inviteGodowns}
                      onToggle={(id) => setInviteGodowns((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                      emptyLabel="No warehouses loaded."
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Cost centres')}</label>
                <ModeSelect value={inviteCcMode} onChange={setInviteCcMode} testid="invite-cc-mode" />
                {inviteCcMode === 'SELECTED' && (
                  <div className="mt-2">
                    <GuidChecklist
                      options={costCentreOptions}
                      selected={inviteCostCentres}
                      onToggle={(id) => setInviteCostCentres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                      emptyLabel="No cost centres synced yet."
                    />
                  </div>
                )}
              </div>
              <Button
                onClick={invite}
                disabled={!tallyConnected || !(inviteCompanyMode === 'ALL' || (inviteCompanyMode === 'SELECTED' && inviteCompanyGuids.length > 0))}
                data-testid="send-invite"
              >{lt('Send invite')}</Button>
              </fieldset>
            </Card>
          )}

          <Card className="p-5">
            <p className="mb-2 text-sm font-semibold text-ink">{lt('Members')}</p>
            <ul className="divide-y divide-line">
              {(members || []).map((m) => {
                const uid = memberUserId(m);
                const isOwnerRow = memberType(m) === 'OWNER';
                return (
                <li key={m.id || uid} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{m.user_name || m.name || m.user_mobile || m.mobile || `User ${uid}`}</p>
                    <p className="text-xs text-ink-soft">
                      {memberRoleLabel(m)}
                      {m.status ? ` · ${m.status}` : ''}
                      {m.seat_id ? ` · Seat assigned` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isOwnerRow && canAssignRole && (
                      <Button type="button" onClick={() => { setChangeRoleMember(m); setChangeRoleId(m.role_id || roles[0]?.id || ''); }}>{lt('Change role')}</Button>
                    )}
                    {!isOwnerRow && canEditScopes && (
                      <Button type="button" onClick={() => openDataAccess(m)} data-testid={`member-data-access-${uid}`}>{lt('Data access')}</Button>
                    )}
                    {!isOwnerRow && (canSuspendMember || canRemoveMember) && (
                      <>
                        {canSuspendMember && (m.status === 'SUSPENDED'
                          ? (canUnsuspendMember && <Button type="button" onClick={() => unsuspend(uid)}>{lt('Unsuspend')}</Button>)
                          : <Button type="button" onClick={() => suspend(uid)}>{lt('Suspend')}</Button>)}
                        {canRemoveMember && (
                          <Button
                            type="button"
                            variant="danger"
                            disabled={removingUserId != null && Number(removingUserId) === Number(uid)}
                            onClick={() => remove(uid)}
                            data-testid={`member-remove-${uid}`}
                          >
                            {removingUserId != null && Number(removingUserId) === Number(uid) ? lt('Removing…') : lt('Remove')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
                );
              })}
              {!members?.length && <li className="py-3 text-sm text-ink-soft">{lt('No members yet.')}</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'roles' && !state.loading && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">{lt('Roles')}</p>
              <p className="text-xs text-ink-soft">{lt('Edit permissions, Entry Mode, and sensitive data from the backend registry. Owner is not a role.')}</p>
            </div>
            {canEditRoles && (
              <Button
                variant="primary"
                data-testid="create-role-button"
                onClick={() => { setCreateRoleOpen(true); setCreateRoleForm({ displayName: '', entryMode: 'BOTH' }); }}
              >
                {lt('Create role')}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {(roles || []).map((r) => {
              const isSystem = !!(r.system_key || r.is_builtin);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{r.display_name || r.name}</p>
                    <p className="text-xs text-ink-soft">
                      {r.system_key || 'Custom'} · Entry {r.entry_mode || 'BOTH'}
                      {r.is_builtin ? ' · Built-in' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEditRoles && (
                      <Button onClick={() => openRoleEditor(r)} data-testid={`role-edit-${r.id}`}>{lt('Edit role')}</Button>
                    )}
                    {canEditRoles && !isSystem && (
                      <Button onClick={() => deleteRole(r)} data-testid={`role-delete-${r.id}`}>{lt('Delete')}</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === 'activity' && !state.loading && (
        <Card className="p-5">
          <p className="mb-2 text-sm font-semibold text-ink">{lt('Activity')}</p>
          <ul className="divide-y divide-line">
            {(audit || []).map((row) => {
              const actor = auditActorLabel(row);
              const when = row.created_at
                ? new Date(Number(row.created_at) * 1000).toLocaleString()
                : '';
              return (
                <li key={row.id} className="py-3">
                  <p className="text-sm font-semibold text-ink">{lt(humanizeAudit(row))}</p>
                  <p className="text-xs text-ink-soft">
                    {[when, actor].filter(Boolean).join(' · ')}
                  </p>
                </li>
              );
            })}
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

      <Modal
        open={createRoleOpen}
        onClose={() => setCreateRoleOpen(false)}
        title={lt('Create role')}
        testid="create-role-modal"
        footer={(
          <>
            <Button onClick={() => setCreateRoleOpen(false)}>{lt('Cancel')}</Button>
            <Button variant="primary" disabled={createRoleSaving} onClick={createRole}>
              {createRoleSaving ? lt('Creating…') : lt('Create')}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-ink-soft">{lt('Display name')}</label>
            <Input
              value={createRoleForm.displayName}
              onChange={(e) => setCreateRoleForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder={lt('e.g. Sales Desk')}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{lt('Entry Mode')}</p>
            {['OPTIONAL', 'REGULAR', 'BOTH'].map((m) => (
              <label key={m} className="mr-4 inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="createEntryMode"
                  checked={createRoleForm.entryMode === m}
                  onChange={() => setCreateRoleForm((f) => ({ ...f, entryMode: m }))}
                />
                {m === 'OPTIONAL' ? lt('Optional only') : m === 'REGULAR' ? lt('Regular only') : lt('Both')}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </PageSection>
  );
}

export default SettingsTeamAccess;
