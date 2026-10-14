import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding, onboardingBlockedPath } from './onboardingGate';

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
});
