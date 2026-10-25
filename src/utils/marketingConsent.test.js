import { describe, it, expect } from 'vitest';
import { marketingChoiceForNewProfile, receivesMarketingEmail, MARKETING_CONSENT_CUTOFF_MS } from './marketingConsent';

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
  it('matches the worker rule for legacy and new accounts', () => {
    const before = MARKETING_CONSENT_CUTOFF_MS - 1000;
    const after = MARKETING_CONSENT_CUTOFF_MS + 1000;
    expect(receivesMarketingEmail({ marketingEmails: false, createdAt: before })).toBe(false);
    expect(receivesMarketingEmail({ createdAt: before })).toBe(true);
    expect(receivesMarketingEmail({ createdAt: after })).toBe(false);
    expect(receivesMarketingEmail({ marketingEmails: true, createdAt: after })).toBe(true);
  });
});