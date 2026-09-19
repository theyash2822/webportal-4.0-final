import { describe, it, expect } from 'vitest';
import { isDemoCompany, isDemoMode, isLiveBooksStatus, filterCompaniesForPairing } from './isDemoCompany';

describe('isDemoCompany', () => {
  it('identifies Demo only from is_demo', () => {
    expect(isDemoCompany({ is_demo: true, name: 'Books' })).toBe(true);
    expect(isDemoCompany({ isDemo: true })).toBe(true);
  });

  it('treats Demo Traders with is_demo=false as real', () => {
    expect(isDemoCompany({ name: 'Demo Traders', is_demo: false, guid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })).toBe(false);
  });

  it('never uses name or GUID heuristics', () => {
    expect(isDemoCompany({ name: 'demo company', guid: 'DEMO-1' })).toBe(false);
  });
});

describe('pairing Demo eligibility', () => {
  const rows = [
    { guid: 'D', name: 'Canonical Demo', is_demo: true },
    { guid: 'R', name: 'Demo Traders', is_demo: false },
  ];

  it('UNPAIRED keeps only canonical Demo', () => {
    expect(filterCompaniesForPairing(rows, 'UNPAIRED').map((c) => c.guid)).toEqual(['D']);
    expect(isDemoMode('UNPAIRED')).toBe(true);
  });

  it('CONNECTED and RECONNECTING keep real books', () => {
    expect(filterCompaniesForPairing(rows, 'CONNECTED').map((c) => c.guid)).toEqual(['R']);
    expect(filterCompaniesForPairing(rows, 'RECONNECTING').map((c) => c.guid)).toEqual(['R']);
    expect(isDemoMode('CONNECTED')).toBe(false);
    expect(isDemoMode('RECONNECTING')).toBe(false);
    expect(isLiveBooksStatus('RECONNECTING')).toBe(true);
    expect(isLiveBooksStatus('CONNECTED')).toBe(true);
  });
});
