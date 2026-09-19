/** ₹1 = 1 credit. Server owns this; the UI only displays it. */
export const INR_PER_CREDIT = 1;

export function creditsToInrDisplay(credits) {
  const n = Number(credits);
  if (!Number.isInteger(n) || n <= 0) return '';
  return String(n * INR_PER_CREDIT);
}

export function isInsufficientCreditsError(code, status) {
  return status === 402 || /INSUFFICIENT/.test(String(code || ''));
}
