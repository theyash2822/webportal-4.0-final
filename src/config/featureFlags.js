/**
 * Workspace / RBAS feature flags — ON (product request 2026-09-12).
 * Backend remains authoritative; UI gating is UX only.
 */
export const FEATURE_FLAGS = {
  workspace_model_enabled: true,
  workspace_header_required: true,
  member_invites_enabled: true,
  scope_company_enabled: true,
  scope_fy_enabled: true,
  scope_ledger_enabled: true,
  scope_godown_enabled: true,
  scope_cost_centre_enabled: true,
  sensitive_policy_enabled: true,
  workspace_device_routing_enabled: true,
  cloud_backup_enabled: true,
  restore_sessions_enabled: true,
  hard_sync_approval_enabled: true,
};

export function flag(name) {
  return FEATURE_FLAGS[name] !== false;
}

export const WS_STORAGE_KEY = 'td_current_workspace_id';
