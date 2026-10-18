import { describe, it, expect } from 'vitest';
import {
  shouldShowOnboarding, onboardingBlockedPath, dismissOnboardingSession, reopenOnboarding,
  readOnboardingStep, writeOnboardingStep, clearOnboardingStep, ONBOARDING_DISMISS_KEY,
} from './onboardingGate';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('shouldShowOnboarding', () => {
  const open = { onboardingCompleted: false, pathname: '/dashboard', dismissed: false };

  it('shows on a normal page while setup is unfinished', () => {
    expect(shouldShowOnboarding(open)).toBe(true);
  });

  it('stays off /journal and /terminal, including nested paths', () => {
    expect(onboardingBlockedPath('/journal')).toBe(true);
    expect(onboardingBlockedPath('/journal?new=1')).toBe(true);
    expect(onboardingBlockedPath('/terminal')).toBe(true);
    expect(onboardingBlockedPath('/terminal/BTCUSDT')).toBe(true);
    expect(shouldShowOnboarding({ ...open, pathname: '/journal' })).toBe(false);
    expect(shouldShowOnboarding({ ...open, pathname: '/journal?new=1' })).toBe(false);
    expect(shouldShowOnboarding({ ...open, pathname: '/terminal' })).toBe(false);
    expect(shouldShowOnboarding({ ...open, pathname: '/dashboard' })).toBe(true);
  });

  it('does not reopen after a dismissal or a completed profile', () => {
    expect(shouldShowOnboarding({ ...open, dismissed: true })).toBe(false);
    expect(shouldShowOnboarding({ ...open, onboardingCompleted: true })).toBe(false);
    expect(shouldShowOnboarding({ ...open, onboardingCompleted: undefined })).toBe(false);
  });

  it('skip is session-only and resume keeps the step', () => {
    const session = memoryStorage();
    const local = memoryStorage();
    dismissOnboardingSession(session);
    expect(session.getItem(ONBOARDING_DISMISS_KEY)).toBe('1');
    expect(shouldShowOnboarding({ ...open, dismissed: session.getItem(ONBOARDING_DISMISS_KEY) === '1' })).toBe(false);
    writeOnboardingStep('u1', 2, local);
    reopenOnboarding(session);
    expect(session.getItem(ONBOARDING_DISMISS_KEY)).toBeNull();
    expect(shouldShowOnboarding({ ...open, dismissed: false })).toBe(true);
    expect(readOnboardingStep('u1', local)).toBe(2);
    clearOnboardingStep('u1', local);
    expect(readOnboardingStep('u1', local)).toBe(0);
  });
});
