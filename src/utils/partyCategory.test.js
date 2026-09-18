import { describe, expect, it } from 'vitest';
import { partyCategory } from './partyCategory.js';

describe('partyCategory', () => {
  it('maps sundry debtors to sales', () => {
    expect(partyCategory({ parent: 'Sundry Debtors' })).toBe('sales');
    expect(partyCategory({ type: 'customer' })).toBe('sales');
  });

  it('maps sundry creditors to purchase', () => {
    expect(partyCategory({ parent: 'Sundry Creditors' })).toBe('purchase');
    expect(partyCategory({ party_type: 'vendor' })).toBe('purchase');
  });

  it('maps cash/bank to accountant', () => {
    expect(partyCategory({ parent: 'Bank Accounts' })).toBe('accountant');
    expect(partyCategory({ parent: 'Cash-in-Hand' })).toBe('accountant');
  });

  it('falls back to other', () => {
    expect(partyCategory({ parent: 'Miscellaneous' })).toBe('other');
  });
});
