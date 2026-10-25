import { describe, it, expect } from 'vitest';
import { marketingChoiceForNewProfile, receivesMarketingEmail } from './marketingConsent';

describe('marketingChoiceForNewProfile', () => {
  it('prefers the in-memory choice, then the stash, and otherwise stays off', () => {
    expect(marketingChoiceForNewProfile(true, false)).toBe(true);
    expect(marketingChoiceForNewProfile(false, true)).toBe(false);
    expect(marketingChoiceForNewProfile(null, true)).toBe(true);
    expect(marketingChoiceForNewProfile(null, false)).toBe(false);
    expect(marketingChoiceForNewProfile(null, null)).toBe(false);
  });
});

describe('receivesMarketingEmail from the client helper', () => {
  it('shows a missing choice as on and an explicit opt-out as off', () => {
    expect(receivesMarketingEmail({ marketingEmails: false })).toBe(false);
    expect(receivesMarketingEmail({})).toBe(true);
    expect(receivesMarketingEmail({ marketingEmails: true })).toBe(true);
  });
});