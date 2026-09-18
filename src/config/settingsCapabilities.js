/**
 * Settings nav path → capability gates (Web MD).
 * Owner always sees all ungated paths. Billing + lifecycle = Owner only (Wave 4).
 */

/** @typedef {{ membershipType?: string|null }} CapCtx */

/**
 * @type {Record<string, (can: (k: string) => boolean, ctx: CapCtx) => boolean>}
 */
export const SETTINGS_PATH_CAPABILITIES = {
  '/settings/team': (can) => can('members.view') || can('workspace.settings.view'),
  // Wave 4: Billing / recharge / plan / seat / payment — Owner only (not billing.manage for Admin)
  '/settings/billing': (_can, ctx) => ctx?.membershipType === 'OWNER',
  // Wave 2/4: Transfer / Reset / Close — Owner only
  '/settings/workspace-lifecycle': (_can, ctx) => ctx?.membershipType === 'OWNER',
  '/settings/payment-modes': (can) => can('workspace.settings.manage'),
  '/settings/einvoice': (can) => can('einvoice.view') || can('integrations.configure'),
  '/settings/ewb': (can) => can('eway.view') || can('integrations.configure'),
  '/settings/tally-sync': (can) => can('workspace.settings.view'),
  '/settings/invitations': () => true,
};

/** Capability keys for RequireCapability route guards. Owner-only routes use ownerOnly flag in App.jsx. */
export const SETTINGS_ROUTE_GUARDS = {
  '/settings/payment-modes': ['workspace.settings.manage'],
  '/settings/team': ['members.view', 'workspace.settings.view'],
  '/settings/billing': { ownerOnly: true },
  '/settings/workspace-lifecycle': { ownerOnly: true },
  '/settings/einvoice': ['einvoice.view', 'integrations.configure'],
  '/settings/ewb': ['eway.view', 'integrations.configure'],
};

export function canAccessSettingsPath(path, can, ctx = {}) {
  if (ctx.membershipType === 'OWNER') return true;
  const check = SETTINGS_PATH_CAPABILITIES[path];
  if (!check) return true;
  return check(can, ctx);
}

/** Filter ModuleLayout SETTINGS_SECTIONS by capability. */
export function filterSettingsSections(sections, can, ctx = {}) {
  if (ctx.membershipType === 'OWNER') return sections;
  return (sections || [])
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => canAccessSettingsPath(item.to, can, ctx)),
    }))
    .filter((section) => section.items.length > 0);
}
