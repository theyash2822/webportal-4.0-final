import { describe, it, expect } from 'vitest';
import { creditsToInrDisplay, isInsufficientCreditsError } from './billingCredits';

describe('billingCredits', () => {
  it('maps integer credits to rupees at ₹1 = 1 credit', () => {
    expect(creditsToInrDisplay('1')).toBe('1');
    expect(creditsToInrDisplay('99')).toBe('99');
    expect(creditsToInrDisplay(100)).toBe('100');
  });

  it('rejects fractional or client-invented amounts', () => {
    expect(creditsToInrDisplay('100.50')).toBe('');
    expect(creditsToInrDisplay('abc')).toBe('');
    expect(creditsToInrDisplay(0)).toBe('');
  });

  it('recognises insufficient-credit errors without logging out', () => {
    expect(isInsufficientCreditsError('INSUFFICIENT_CREDITS', 402)).toBe(true);
    expect(isInsufficientCreditsError('FORBIDDEN', 403)).toBe(false);
  });
});
