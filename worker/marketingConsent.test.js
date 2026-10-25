import { describe, it, expect } from 'vitest';
import {
  normalizeMarketingEmails,
  shouldBackfillMarketingEmail,
  receivesMarketingEmail,
  recipientConsent,
} from './marketingConsent';

describe('normalizeMarketingEmails', () => {
  it('treats missing and null as no choice, and keeps an explicit bool', () => {
    expect(normalizeMarketingEmails(undefined)).toBeNull();
    expect(normalizeMarketingEmails(null)).toBeNull();
    expect(normalizeMarketingEmails({ nullValue: null })).toBeNull();
    expect(normalizeMarketingEmails(true)).toBe(true);
    expect(normalizeMarketingEmails(false)).toBe(false);
    expect(normalizeMarketingEmails({ booleanValue: true })).toBe(true);
    expect(normalizeMarketingEmails({ booleanValue: false })).toBe(false);
  });
});

describe('shouldBackfillMarketingEmail', () => {
  it('subscribes a missing choice and leaves an explicit value, with no date cutoff', () => {
    expect(shouldBackfillMarketingEmail({ marketingEmails: null })).toBe(true);
    expect(shouldBackfillMarketingEmail({ marketingEmails: undefined })).toBe(true);
    expect(shouldBackfillMarketingEmail({})).toBe(true);
    expect(shouldBackfillMarketingEmail({ marketingEmails: { booleanValue: false } })).toBe(false);
    expect(shouldBackfillMarketingEmail({ marketingEmails: true })).toBe(false);
    expect(shouldBackfillMarketingEmail({ marketingEmails: false, createdAtMs: Date.now() })).toBe(false);
  });
});

describe('receivesMarketingEmail', () => {
  it('shows legacy missing as on, and an explicit opt-out as off', () => {
    expect(receivesMarketingEmail(null)).toBe(false);
    expect(receivesMarketingEmail({ marketingEmails: true })).toBe(true);
    expect(receivesMarketingEmail({ marketingEmails: false })).toBe(false);
    expect(receivesMarketingEmail({})).toBe(true);
    expect(receivesMarketingEmail({ marketingEmails: { booleanValue: false } })).toBe(false);
  });
});

describe('recipientConsent', () => {
  it('sends only when the stored value is true, unless this send is allowed to backfill', () => {
    expect(recipientConsent({ marketingEmails: true, uid: 'u', adminUid: 'a' })).toMatchObject({ send: true, backfill: false });
    expect(recipientConsent({ marketingEmails: false, uid: 'u', adminUid: 'a' })).toMatchObject({ send: false, backfill: false });
    expect(recipientConsent({ marketingEmails: null, uid: 'u', adminUid: 'a' })).toMatchObject({ send: false, backfill: false });
    expect(recipientConsent({ marketingEmails: null, uid: 'u', adminUid: 'a', allowBackfill: true })).toMatchObject({ send: true, backfill: true });
    expect(recipientConsent({ marketingEmails: false, uid: 'a', adminUid: 'a' })).toMatchObject({ send: true, backfill: false });
  });
});
