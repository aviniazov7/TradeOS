// Per-user data helpers shared by the account-deletion paths and the cron —
// pure (no KV / network), unit-tested in userData.test.js.

// Every Firestore subcollection the app writes under users/{uid}. MUST match
// USER_SUBCOLLECTIONS in src/services/firestoreService.js (the worker can't
// import client code — userData.test.js asserts the two lists are identical).
export const USER_SUBCOLLECTIONS = [
  'trades', 'journals', 'backtests', 'backtestJournals', 'dca',
  'tradingPlans', 'notes', 'strategies', 'morningJournals', 'eveningJournals',
  'processes', 'signals', 'watchlist', 'wyckoffSetups', 'polymarketWatch', 'polymarketStrategies', 'settings',
];

// Single per-user KV keys (prefix-listed families — push:{uid}:*,
// pushexch:{uid}:* — are handled separately by the caller).
export function userSingleKvKeys(uid) {
  return [
    `planflag:${uid}`,
    `usettings:${uid}`,
    `aiq:${uid}`,
    `airl:${uid}`, // legacy rate-limit doc (pre-aiq), expires on its own
  ];
}

// "Lifetime" Premium = plan 'premium' with no expiry. A coupon must never be
// applied to it: extending from "no expiry" would write now+days and silently
// turn a lifetime plan into a time-limited one.
export function isLifetimePlan(plan, planExpiresRaw) {
  return plan === 'premium' && !planExpiresRaw;
}

// Is the stored Web Push subscription identical to the one being registered?
// (endpoint + encryption keys + expiry — everything the push sender uses.)
export function samePushSubscription(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return a.endpoint === b.endpoint
    && (a.keys?.p256dh || null) === (b.keys?.p256dh || null)
    && (a.keys?.auth || null) === (b.keys?.auth || null)
    && (a.expirationTime ?? null) === (b.expirationTime ?? null);
}

// ---- Notification schedules ---------------------------------------------------
// usettings:{uid} carries the schedule both as its value and as KV METADATA,
// so the cron rebuilds the full { uid: schedule } map from one list() call —
// no per-user gets and no shared read-modify-write blob to lose updates on
// (the old usettings:ALL blob raced when two users saved at once).
export const USETTINGS_PREFIX = 'usettings:';
export const USETTINGS_LEGACY_ALL = 'usettings:ALL';

export const settingsAnyOn = (s) => !!(s && (s.journal?.enabled || s.summary?.enabled || s.calendar?.enabled || s.newsImpact?.enabled));

/**
 * Build { uid: schedule } from a KV list of usettings:* keys.
 *   keys       — [{ name, metadata }] from list({ prefix: 'usettings:' })
 *   legacyAll  — the frozen usettings:ALL blob (schedules saved before the
 *                metadata migration), consulted only for keys without metadata
 * Returns { map, needFetch } — needFetch lists uids that have neither metadata
 * nor a legacy entry (the caller may get() them individually).
 */
export function buildSettingsMap(keys, legacyAll = {}) {
  const map = {};
  const needFetch = [];
  for (const k of keys || []) {
    const name = k?.name || '';
    if (!name.startsWith(USETTINGS_PREFIX) || name === USETTINGS_LEGACY_ALL) continue;
    const uid = name.slice(USETTINGS_PREFIX.length);
    if (!uid || uid.includes(':')) continue;
    const meta = k.metadata;
    if (meta && typeof meta === 'object') {
      if (settingsAnyOn(meta)) map[uid] = meta;
      continue;
    }
    if (legacyAll && Object.prototype.hasOwnProperty.call(legacyAll, uid)) {
      if (settingsAnyOn(legacyAll[uid])) map[uid] = legacyAll[uid];
      continue;
    }
    needFetch.push(uid);
  }
  return { map, needFetch };
}
