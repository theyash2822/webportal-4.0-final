/** ₹1 = 1 credit. Server owns this; the UI only displays it. */
export const INR_PER_CREDIT = 1;

export function creditsToInrDisplay(credits) {
  const n = Number(credits);
  if (!Number.isInteger(n) || n <= 0) return '';
  return String(n * INR_PER_CREDIT);
}

export function isInsufficientCreditsError(code, status) {
  const c = String(code || '');
  return (
    status === 402
    || /INSUFFICIENT/.test(c)
    || c === 'MIXED_FUNDING_PRIORITY_UNDEFINED'
    || c === 'SPLIT_FUNDING_RULE_UNDEFINED'
  );
}
