// Marketing-email preference.
//
// Existing accounts (created before MARKETING_CONSENT_CUTOFF_ISO) with no
// stored choice are treated as subscribed and backfilled to true. An explicit
// true/false is never overwritten. Accounts created at or after the cutoff
// must store the signup checkbox (unchecked by default). Sending is true-only
// after that backfill — a missing value on a new account is not subscribed.
//
// The cutoff is the release window for this change, not a per-user opt-in.
// New code writes the bool on the first profile create, so a later backfill
// cannot flip a real choice. Bump the cutoff only if this ships later and
// legacy profiles created after it still have no field.

export const MARKETING_CONSENT_CUTOFF_ISO = '2026-10-28T00:00:00.000Z';
export const MARKETING_CONSENT_CUTOFF_MS = Date.parse(MARKETING_CONSENT_CUTOFF_ISO);

/** true | false | null (missing, null, or junk). Accepts a JS bool or a Firestore REST field. */
export function normalizeMarketingEmails(value) {
  if (value === true || value === false) return value;
  if (value && typeof value === 'object' && typeof value.booleanValue === 'boolean') {
    return value.booleanValue;
  }
  return null;
}

/** Epoch ms from a JS date, ISO string, Firestore Timestamp, or REST timestamp field. */
export function createdAtMillis(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value.toDate === 'function') {
    const t = value.toDate().getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'object') {
    if (typeof value.timestampValue === 'string') return createdAtMillis(value.timestampValue);
    if (typeof value.stringValue === 'string') return createdAtMillis(value.stringValue);
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

/**
 * True only when the stored preference is missing AND the account is existing.
 * Explicit true and explicit false both return false (leave them alone).
 */
export function shouldBackfillMarketingEmail({ marketingEmails, createdAtMs, createdAt } = {}, cutoffMs = MARKETING_CONSENT_CUTOFF_MS) {
  if (normalizeMarketingEmails(marketingEmails) !== null) return false;
  const created = createdAtMillis(createdAtMs ?? createdAt);
  if (created == null) return true;
  return created < cutoffMs;
}

/** Who the admin dialog and the Worker may mail. Explicit false always loses. */
export function receivesMarketingEmail(profile, cutoffMs = MARKETING_CONSENT_CUTOFF_MS) {
  if (!profile) return false;
  const value = normalizeMarketingEmails(profile.marketingEmails);
  if (value === true) return true;
  if (value === false) return false;
  return shouldBackfillMarketingEmail({
    marketingEmails: null,
    createdAtMs: profile.createdAtMs != null ? profile.createdAtMs : profile.createdAt,
  }, cutoffMs);
}

/**
 * Per-recipient decision inside /admin/email-campaign.
 * `backfill` means "write true before sending". The admin's own uid is the
 * "בדיקה אליי" test and is delivered even when that admin turned email off;
 * an explicit opt-out is still not rewritten.
 */
export function recipientConsent({ marketingEmails, createdAt, uid, adminUid } = {}, cutoffMs = MARKETING_CONSENT_CUTOFF_MS) {
  const value = normalizeMarketingEmails(marketingEmails);
  const backfill = shouldBackfillMarketingEmail({ marketingEmails: value, createdAtMs: createdAt }, cutoffMs);
  const send = value === true || backfill || (!!uid && uid === adminUid);
  return { value, backfill, send };
}
