// Marketing-email preference.
//
// The one-shot backfill subscribes profiles that already exist when it runs
// and have no stored choice. An explicit true or false is never overwritten.
// There is no cutoff date: an account created after that scan is not existing.
// Signup writes marketingEmails on the first profile create (checkbox,
// default false), so the scan cannot subscribe someone who registers later.
//
// Until the scan lands, a missing value still counts as subscribed in the
// admin dialog and the settings toggle, so a legacy user can turn it off
// before the first email. After the scan, sending is true-only. A campaign
// patches a missing value only when that scan did not finish.

/** true | false | null (missing, null, or junk). Accepts a JS bool or a Firestore REST field. */
export function normalizeMarketingEmails(value) {
  if (value === true || value === false) return value;
  if (value && typeof value === 'object' && typeof value.booleanValue === 'boolean') {
    return value.booleanValue;
  }
  return null;
}

/** True only when nothing is stored. Explicit true and explicit false both stay put. */
export function shouldBackfillMarketingEmail({ marketingEmails } = {}) {
  return normalizeMarketingEmails(marketingEmails) === null;
}

/**
 * Admin dialog and the profile toggle. Missing still shows as on, so a legacy
 * user (no choice yet) can opt out before the backfill writes true. New
 * profiles always carry a bool, so they are not treated as legacy here.
 */
export function receivesMarketingEmail(profile) {
  if (!profile) return false;
  return normalizeMarketingEmails(profile.marketingEmails) !== false;
}

/**
 * Per-recipient decision inside /admin/email-campaign.
 * `allowBackfill` is set only when the one-shot scan did not finish; then a
 * missing value on someone we're already mailing is written true. The admin's
 * own uid is the "בדיקה אליי" test and is delivered even when that admin
 * turned email off; an explicit opt-out is still not rewritten.
 */
export function recipientConsent({ marketingEmails, uid, adminUid, allowBackfill = false } = {}) {
  const value = normalizeMarketingEmails(marketingEmails);
  const backfill = !!allowBackfill && value === null;
  const send = value === true || backfill || (!!uid && uid === adminUid);
  return { value, backfill, send };
}
