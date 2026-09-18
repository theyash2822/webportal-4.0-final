import { describe, expect, it } from 'vitest';
import { canCreateWithEntryMode } from '../utils/entryMode.js';

describe('canCreateWithEntryMode', () => {
  it('allows non sales create keys regardless of entry mode', () => {
    expect(canCreateWithEntryMode('OPTIONAL', 'purchase_invoice.create')).toBe(true);
    expect(canCreateWithEntryMode('REGULAR', 'journal.create')).toBe(true);
  });

  it('BOTH allows regular and optional creates', () => {
    expect(canCreateWithEntryMode('BOTH', 'sales_invoice.create')).toBe(true);
    expect(canCreateWithEntryMode('BOTH', 'sales_invoice.create', { optional: true })).toBe(true);
    expect(canCreateWithEntryMode('BOTH', 'sales_order.create')).toBe(true);
  });

  it('REGULAR allows regular creates, denies optional-only', () => {
    expect(canCreateWithEntryMode('REGULAR', 'sales_invoice.create')).toBe(true);
    expect(canCreateWithEntryMode('REGULAR', 'sales_invoice.create', { optional: true })).toBe(false);
    expect(canCreateWithEntryMode('REGULAR', 'sales_order.create')).toBe(true);
  });

  it('OPTIONAL allows optional creates, denies regular', () => {
    expect(canCreateWithEntryMode('OPTIONAL', 'sales_invoice.create')).toBe(false);
    expect(canCreateWithEntryMode('OPTIONAL', 'sales_invoice.create', { optional: true })).toBe(true);
    expect(canCreateWithEntryMode('OPTIONAL', 'sales_order.create', { optional: true })).toBe(true);
  });
});
