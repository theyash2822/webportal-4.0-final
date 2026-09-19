import { describe, it, expect, beforeEach } from 'vitest';
import {
  companySelectionKey,
  fySelectionKey,
  writeScopedCompany,
  readScopedCompany,
  writeScopedFY,
  readScopedFY,
  dropLegacyGlobalTenantKeys,
  dropAuthNavigationResidue,
} from './tenantStorage';
import { fyEquals } from './fyIdentity';
import { loadDraft, saveDraft, draftKey } from './draftSave';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('scoped company / FY keys', () => {
  it('keeps the same GUID isolated across workspaces', () => {
    writeScopedCompany('u1', 'ws-ABC', { guid: 'G', name: 'ABC Co' });
    writeScopedCompany('u1', 'ws-XYZ', { guid: 'G', name: 'XYZ Co' });
    expect(readScopedCompany('u1', 'ws-ABC').name).toBe('ABC Co');
    expect(readScopedCompany('u1', 'ws-XYZ').name).toBe('XYZ Co');
    expect(companySelectionKey('u1', 'ws-ABC')).not.toBe(companySelectionKey('u1', 'ws-XYZ'));
  });

  it('scopes FY to workspace + company', () => {
    writeScopedFY('u1', 'ws-ABC', 'G', { uniqueId: 'G_2024-2025', finYear: '2024-2025' });
    writeScopedFY('u1', 'ws-XYZ', 'G', { uniqueId: 'G_2025-2026', finYear: '2025-2026' });
    expect(readScopedFY('u1', 'ws-ABC', 'G').finYear).toBe('2024-2025');
    expect(readScopedFY('u1', 'ws-XYZ', 'G').finYear).toBe('2025-2026');
    expect(fySelectionKey('u1', 'ws-ABC', 'G')).not.toBe(fySelectionKey('u1', 'ws-XYZ', 'G'));
  });

  it('does not adopt leftover global keys', () => {
    localStorage.setItem('selectedCompany', JSON.stringify({ guid: 'G' }));
    localStorage.setItem('selectedFY', JSON.stringify({ uniqueId: 'x' }));
    localStorage.setItem('companies', JSON.stringify([{ guid: 'G' }]));
    expect(readScopedCompany('u1', 'ws-ABC')).toBeNull();
    dropLegacyGlobalTenantKeys();
    expect(localStorage.getItem('selectedCompany')).toBeNull();
    expect(localStorage.getItem('selectedFY')).toBeNull();
    expect(localStorage.getItem('companies')).toBeNull();
  });

  it('clears postAuthPath', () => {
    sessionStorage.setItem('td.postAuthPath', '/settings');
    dropAuthNavigationResidue();
    expect(sessionStorage.getItem('td.postAuthPath')).toBeNull();
  });
});

describe('FY equality', () => {
  it('treats the same year as equal without requiring uniqueId', () => {
    expect(fyEquals(
      { finYear: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31' },
      { uniqueId: 'G_2025-2026', finYear: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31' },
    )).toBe(true);
  });
});

describe('legacy drafts are not adopted', () => {
  it('deletes GUID-only drafts instead of copying them into the current workspace', () => {
    localStorage.setItem('td_draft_sales_G', JSON.stringify({ savedAt: Date.now(), fields: { secret: 1 } }));
    expect(loadDraft('sales', 'G', 'ws-ABC')).toBeNull();
    expect(localStorage.getItem('td_draft_sales_G')).toBeNull();
    expect(localStorage.getItem(draftKey('sales', 'G', 'ws-ABC'))).toBeNull();
  });

  it('still loads a workspace-scoped draft', () => {
    saveDraft('sales', 'G', { fields: { ok: true } }, 'ws-ABC');
    expect(loadDraft('sales', 'G', 'ws-ABC').fields.ok).toBe(true);
    expect(loadDraft('sales', 'G', 'ws-XYZ')).toBeNull();
  });
});
