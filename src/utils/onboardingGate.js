// The first-run wizard. Once the profile says it is done, or the user
// dismissed it this session, it stays down. /journal and /terminal never
// host it: finishing the wizard navigates there before the profile write
// returns, and a remount used to open the dialog on top of the page again.

export const ONBOARDING_DISMISS_KEY = 'tradeos-onboarding-dismissed';

export function onboardingBlockedPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  return path === '/terminal' || path.startsWith('/terminal/')
    || path === '/journal' || path.startsWith('/journal/');
}

export function shouldShowOnboarding({ onboardingCompleted, pathname, dismissed } = {}) {
  if (onboardingCompleted !== false) return false;
  if (dismissed) return false;
  if (onboardingBlockedPath(pathname)) return false;
  return true;
}
