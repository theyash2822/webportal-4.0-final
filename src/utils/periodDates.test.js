import { describe, it, expect } from 'vitest';
import { addLocalDays, todayLocalISO } from './periodDates';

describe('addLocalDays', () => {
  it('adds one calendar day across the March 31 / April 1 FY boundary', () => {
    expect(addLocalDays('2026-03-31', 1)).toBe('2026-04-01');
  });

  it('keeps the local calendar date at typical IST edges', () => {
    expect(todayLocalISO(new Date('2026-09-21T00:01:00+05:30'))).toBe('2026-09-21');
    expect(todayLocalISO(new Date('2026-09-21T05:29:00+05:30'))).toBe('2026-09-21');
    expect(todayLocalISO(new Date('2026-09-21T05:31:00+05:30'))).toBe('2026-09-21');
    expect(todayLocalISO(new Date('2026-09-21T23:59:00+05:30'))).toBe('2026-09-21');
  });
});
