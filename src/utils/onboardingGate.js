// The first-run wizard. Once the profile says it is done, it stays down.
// Skip only hides it for this tab session — it does NOT set
// onboardingCompleted — and reopenOnboarding brings the same step back.
// /journal and /terminal never host it: finishing the wizard navigates
// there before the profile write returns, and a remount used to open the
// dialog on top of the page again.

export const ONBOARDING_DISMISS_KEY = 'tradeos-onboarding-dismissed';
export const ONBOARDING_REOPEN_EVENT = 'tradeos-onboarding-reopen';

export function onboardingStepKey(uid) {
  return uid ? `tradeos_onboarding_step_${uid}` : '';
}

export function readOnboardingStep(uid, storage = globalThis.localStorage, max = 3) {
  if (!uid || !storage) return 0;
  try {
    const n = Number(storage.getItem(onboardingStepKey(uid)));
    if (!Number.isInteger(n) || n < 0) return 0;
    return Math.min(n, max);
  } catch { return 0; }
}

export function writeOnboardingStep(uid, step, storage = globalThis.localStorage) {
  if (!uid || !storage) return;
  try { storage.setItem(onboardingStepKey(uid), String(step)); } catch { /* private mode */ }
}

export function clearOnboardingStep(uid, storage = globalThis.localStorage) {
  if (!uid || !storage) return;
  try { storage.removeItem(onboardingStepKey(uid)); } catch { /* private mode */ }
}

// Session-only. The profile flag is untouched, so the next visit (or an
// explicit reopen) shows the wizard again at the saved step.
export function dismissOnboardingSession(storage = globalThis.sessionStorage) {
  try { storage?.setItem(ONBOARDING_DISMISS_KEY, '1'); } catch { /* private mode */ }
}

export function reopenOnboarding(storage = globalThis.sessionStorage) {
  try { storage?.removeItem(ONBOARDING_DISMISS_KEY); } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ONBOARDING_REOPEN_EVENT));
}

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
