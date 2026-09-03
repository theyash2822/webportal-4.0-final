/** Onboarding completion — mirrors mobile onboardingNav.ts (localStorage vs AsyncStorage). */
export const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';

export function onboardingKeyForUser(user) {
  const phone = user?.phone || user?.mobile || user?.mobileNumber || localStorage.getItem('lastMobile') || '';
  return phone ? `${ONBOARDING_COMPLETED_KEY}_${phone}` : ONBOARDING_COMPLETED_KEY;
}

export function isOnboardingDone(user) {
  const key = onboardingKeyForUser(user);
  if (localStorage.getItem(key) === 'true') return true;
  return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
}

export function markOnboardingCompleted(user) {
  const key = onboardingKeyForUser(user);
  localStorage.setItem(key, 'true');
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
}

export function clearOnboardingForReplay() {
  Object.keys(localStorage).filter(k => k.startsWith(ONBOARDING_COMPLETED_KEY)).forEach(k => localStorage.removeItem(k));
}
