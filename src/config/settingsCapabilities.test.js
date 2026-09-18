import { describe, expect, it } from 'vitest';
import { filterSettingsSections, canAccessSettingsPath } from './settingsCapabilities.js';

const SAMPLE_SECTIONS = [
  {
    label: 'Account',
    items: [
      { label: 'Profile', to: '/settings/profile' },
      { label: 'License', to: '/settings/license' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Team & Access', to: '/settings/team' },
      { label: 'Billing & Credits', to: '/settings/billing' },
      { label: 'Workspace lifecycle', to: '/settings/workspace-lifecycle' },
      { label: 'Invitations', to: '/settings/invitations' },
    ],
  },
  {
    label: 'Preferences',
    items: [{ label: 'Language', to: '/settings/language' }],
  },
];

describe('filterSettingsSections', () => {
  it('Owner sees all settings items', () => {
    const filtered = filterSettingsSections(SAMPLE_SECTIONS, () => false, {
      membershipType: 'OWNER',
    });
    const paths = filtered.flatMap((s) => s.items.map((i) => i.to));
    expect(paths).toContain('/settings/billing');
    expect(paths).toContain('/settings/workspace-lifecycle');
    expect(paths).toContain('/settings/profile');
    expect(paths).toContain('/settings/license');
    expect(paths.length).toBe(7);
  });

  it('member without billing.manage hides billing (Owner-only)', () => {
    const can = (key) => key === 'members.view' || key === 'billing.manage';
    const filtered = filterSettingsSections(SAMPLE_SECTIONS, can, {
      membershipType: 'MEMBER',
    });
    const paths = filtered.flatMap((s) => s.items.map((i) => i.to));
    expect(paths).not.toContain('/settings/billing');
    expect(paths).not.toContain('/settings/workspace-lifecycle');
    expect(paths).toContain('/settings/profile');
    expect(paths).toContain('/settings/team');
    expect(paths).toContain('/settings/invitations');
    expect(paths).toContain('/settings/language');
  });

  it('MEMBER with all caps still cannot see Owner-only billing/lifecycle', () => {
    const can = () => true;
    expect(canAccessSettingsPath('/settings/billing', can, { membershipType: 'MEMBER' })).toBe(false);
    expect(canAccessSettingsPath('/settings/workspace-lifecycle', can, { membershipType: 'MEMBER' })).toBe(false);
  });
});
