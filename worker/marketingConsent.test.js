import { describe, it, expect } from 'vitest';
import {
  MARKETING_CONSENT_CUTOFF_MS,
  normalizeMarketingEmails,
  createdAtMillis,
  shouldBackfillMarketingEmail,
  receivesMarketingEmail,
  recipientConsent,
} from './marketingConsent';

const BEFORE = MARKETING_CONSENT_CUTOFF_MS - 86_400_000;
const AFTER = MARKETING_CONSENT_CUTOFF_MS + 86_400_000;

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
  it('subscribes existing accounts with no choice and leaves explicit values', () => {
    expect(shouldBackfillMarketingEmail({ marketingEmails: null, createdAtMs: BEFORE })).toBe(true);
    expect(shouldBackfillMarketingEmail({ marketingEmails: undefined, createdAtMs: BEFORE })).toBe(true);
    expect(shouldBackfillMarketingEmail({ marketingEmails: { booleanValue: false }, createdAtMs: BEFORE })).toBe(false);
    expect(shouldBackfillMarketingEmail({ marketingEmails: true, createdAtMs: BEFORE })).toBe(false);
    expect(shouldBackfillMarketingEmail({ marketingEmails: null, createdAt: { timestampValue: '2020-01-01T00:00:00.000Z' } })).toBe(true);
  });

  it('does not subscribe a new account that has not chosen', () => {
    expect(shouldBackfillMarketingEmail({ marketingEmails: null, createdAtMs: AFTER })).toBe(false);
  });

  it('treats a legacy doc with no createdAt as existing', () => {
    expect(shouldBackfillMarketingEmail({ marketingEmails: null })).toBe(true);
    expect(shouldBackfillMarketingEmail({ marketingEmails: false })).toBe(false);
  });
});

describe('receivesMarketingEmail', () => {
  it('mails true and legacy missing, and skips an explicit opt-out', () => {
    expect(receivesMarketingEmail(null)).toBe(false);
    expect(receivesMarketingEmail({ marketingEmails: true, createdAt: AFTER })).toBe(true);
    expect(receivesMarketingEmail({ marketingEmails: false, createdAt: BEFORE })).toBe(false);
    expect(receivesMarketingEmail({ createdAt: BEFORE })).toBe(true);
    expect(receivesMarketingEmail({ createdAt: AFTER })).toBe(false);
    expect(receivesMarketingEmail({ marketingEmails: { booleanValue: false }, createdAtMs: BEFORE })).toBe(false);
  });
});

describe('recipientConsent', () => {
  it('sends to subscribed and legacy users, and still tests to the admin', () => {
    expect(recipientConsent({ marketingEmails: true, createdAt: AFTER, uid: 'u', adminUid: 'a' })).toMatchObject({ send: true, backfill: false });
    expect(recipientConsent({ marketingEmails: false, createdAt: BEFORE, uid: 'u', adminUid: 'a' })).toMatchObject({ send: false, backfill: false });
    expect(recipientConsent({ marketingEmails: null, createdAt: BEFORE, uid: 'u', adminUid: 'a' })).toMatchObject({ send: true, backfill: true });
    expect(recipientConsent({ marketingEmails: null, createdAt: AFTER, uid: 'u', adminUid: 'a' })).toMatchObject({ send: false, backfill: false });
    expect(recipientConsent({ marketingEmails: false, createdAt: AFTER, uid: 'a', adminUid: 'a' })).toMatchObject({ send: true, backfill: false });
  });
});

describe('createdAtMillis', () => {
  it('reads timestamps and ignores junk', () => {
    expect(createdAtMillis('2024-05-01T00:00:00.000Z')).toBe(Date.parse('2024-05-01T00:00:00.000Z'));
    expect(createdAtMillis({ seconds: 10 })).toBe(10000);
    expect(createdAtMillis({ timestampValue: '2024-05-01T00:00:00.000Z' })).toBe(Date.parse('2024-05-01T00:00:00.000Z'));
    expect(createdAtMillis('not-a-date')).toBeNull();
    expect(createdAtMillis(undefined)).toBeNull();
  });
});
