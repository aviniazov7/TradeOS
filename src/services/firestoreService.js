import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
  deleteField,
  getCountFromServer,
  terminate,
  clearIndexedDbPersistence,
} from 'firebase/firestore';
import { db } from './firebaseDb';
import { APP_VERSION } from '../utils/constants';

// ─── Retry Helper ────────────────────────────────────────────────

async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.code === 'unavailable' || error.code === 'deadline-exceeded' || error.message?.includes('Failed to fetch');
      if (!isRetryable || attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
}

// ─── User Subcollection Operations ──────────────────────────────

// Last snapshot per query, shared by every subscriber in this tab. A second
// mount (home → journal → home) paints from this immediately; the live
// listener still refreshes it. Firestore's IndexedDB cache covers reloads,
// but opening that cache is slower than a Map hit, which is what made the
// dashboard sit on a skeleton after login.
const collectionCache = new Map();

function collectionCacheKey(uid, collectionName, { orderField, orderDir, whereFilters }) {
  return `${uid}|${collectionName}|${orderField}|${orderDir}|${JSON.stringify(whereFilters)}`;
}

/** The last snapshot for this query, or undefined if this tab hasn't seen it. */
export function peekUserCollection(uid, collectionName, opts = {}) {
  if (!uid) return undefined;
  const orderField = opts.orderField || 'createdAt';
  const orderDir = opts.orderDir || 'desc';
  const whereFilters = opts.whereFilters || [];
  return collectionCache.get(collectionCacheKey(uid, collectionName, { orderField, orderDir, whereFilters }));
}

/** Seed for a collection hook: cached rows paint immediately. */
export function seedUserCollection(uid, collectionName, opts) {
  if (!uid) return { data: [], loading: false };
  const cached = peekUserCollection(uid, collectionName, opts);
  if (cached === undefined) return { data: [], loading: true };
  return { data: cached, loading: false };
}

/** Subscribe to a user's subcollection with real-time updates */
export function subscribeToUserCollection(
  uid,
  collectionName,
  { orderField = 'createdAt', orderDir = 'desc', whereFilters = [] } = {},
  onData,
  onError
) {
  const constraints = [orderBy(orderField, orderDir)];
  for (const f of whereFilters) {
    constraints.push(where(f.field, f.op, f.value));
  }
  const q = query(collection(db, 'users', uid, collectionName), ...constraints);
  const key = collectionCacheKey(uid, collectionName, { orderField, orderDir, whereFilters });
  const cached = collectionCache.get(key);
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      collectionCache.set(key, data);
      onData(data);
    },
    onError || ((error) => console.error(`Firestore listener error (${collectionName}):`, error))
  );
  // Paint the cached rows now. The listener above replaces them when the
  // server (or IndexedDB) answers, so a stale cache never sticks.
  if (cached) onData(cached);
  return unsub;
}

/** Add a document to a user's subcollection */
export async function addToUserCollection(uid, collectionName, data) {
  return withRetry(() => addDoc(collection(db, 'users', uid, collectionName), data));
}

/** Add many documents to a user's subcollection in chunked batches (499 per
 *  batch — Firestore caps a batch at 500 writes). One network round-trip per
 *  chunk instead of per document, so large CSV imports don't fire hundreds of
 *  sequential writes. Calls onProgress(committedCount) after each chunk. */
export async function addToUserCollectionBulk(uid, collectionName, items, onProgress) {
  let committed = 0;
  for (let i = 0; i < items.length; i += 499) {
    const chunk = items.slice(i, i + 499);
    const batch = writeBatch(db);
    chunk.forEach((data) => batch.set(doc(collection(db, 'users', uid, collectionName)), data));
    await withRetry(() => batch.commit());
    committed += chunk.length;
    onProgress?.(committed);
  }
  return committed;
}

/** Update a document in a user's subcollection */
export async function updateUserDocument(uid, collectionName, docId, data) {
  return withRetry(() => updateDoc(doc(db, 'users', uid, collectionName, docId), data));
}

/** Delete a document from a user's subcollection */
export async function deleteUserDocument(uid, collectionName, docId) {
  return withRetry(() => deleteDoc(doc(db, 'users', uid, collectionName, docId)));
}

/** Get a single document from a user's subcollection */
export async function getUserDocument(uid, collectionName, docId) {
  return withRetry(async () => {
    const snap = await getDoc(doc(db, 'users', uid, collectionName, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  });
}

/** Get all documents in a user's subcollection */
export async function getUserCollectionDocs(uid, collectionName) {
  return withRetry(async () => {
    const snap = await getDocs(collection(db, 'users', uid, collectionName));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

/** Get raw snapshot of a user's subcollection (for batch operations) */
export async function getRawCollectionSnapshot(uid, collectionName) {
  return getDocs(collection(db, 'users', uid, collectionName));
}

// ─── User Settings Operations ───────────────────────────────────

/** Subscribe to a user settings document (users/{uid}/settings/{settingId}) */
export function subscribeToUserSetting(uid, settingId, onData, onError) {
  return onSnapshot(
    doc(db, 'users', uid, 'settings', settingId),
    (snap) => onData(snap.exists() ? snap.data() : null),
    onError || ((error) => console.error(`Firestore setting listener error (${settingId}):`, error)),
  );
}

/** Get a user settings document */
export async function getUserSetting(uid, settingId) {
  const snap = await getDoc(doc(db, 'users', uid, 'settings', settingId));
  return snap.exists() ? snap.data() : null;
}

/** Set/update a user settings document */
export async function setUserSetting(uid, settingId, data, merge = false) {
  return withRetry(() => setDoc(
    doc(db, 'users', uid, 'settings', settingId),
    data,
    merge ? { merge: true } : undefined
  ));
}

// ─── User Profile (Root Document) Operations ────────────────────

/** Get the user's main document */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return { exists: snap.exists(), data: snap.exists() ? snap.data() : null };
}

/**
 * Subscribe to live profile changes. Used by AuthContext so that admin-side
 * updates (e.g. granting Premium) reflect in the user's UI within seconds —
 * no logout / refresh required.
 */
export function subscribeToUserProfile(uid, onData, onError) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) onData(snap.data());
  }, onError || (() => {}));
}

/** Create or update the user's main document */
export async function setUserProfile(uid, data, merge = true) {
  return withRetry(() => setDoc(doc(db, 'users', uid), data, merge ? { merge: true } : undefined));
}

// Keys the profile settings map is allowed to hold. Kept in sync with
// profileSettingsKeys() in firestore.rules.
export const PROFILE_SETTINGS_KEYS = [
  'defaultLeverage', 'defaultRiskPercent', 'baseCurrency', 'assetClasses',
  'strategies', 'favoriteCoins', 'journalMigrated', 'backtestMigrated',
];

/**
 * Dotted-path update of users/{uid}.settings. setDoc({ merge: true }) replaces
 * a map field entirely, so `{ settings: { journalMigrated: true } }` used to
 * wipe favoriteCoins and the rest. Only allowlisted keys are written.
 */
export function settingsPatchFields(patch) {
  const fields = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!PROFILE_SETTINGS_KEYS.includes(key)) continue;
    fields[`settings.${key}`] = value;
  }
  return fields;
}

export async function patchUserSettings(uid, patch) {
  const fields = settingsPatchFields(patch);
  if (!Object.keys(fields).length) return;
  return withRetry(() => updateDoc(doc(db, 'users', uid), fields));
}

/**
 * Admin-only: grant a user a Premium plan for `days` (Infinity for lifetime).
 * Bypasses noPrivilegeEscalation via the admin-write Firestore rule.
 */
export async function adminGrantPremium(uid, days, opts = {}) {
  const lifetime = !Number.isFinite(days);
  const planExpires = lifetime
    ? null // null = lifetime
    : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const fields = { plan: 'premium', planExpires, planGrantedAt: new Date().toISOString() };
  // Optionally record what the customer paid, so analytics can compute MRR.
  const amount = Number(opts.amount);
  if (Number.isFinite(amount) && amount > 0) {
    fields.planAmount = amount;
    fields.planDays = lifetime ? null : days;
  }
  return withRetry(() => setDoc(doc(db, 'users', uid), fields, { merge: true }));
}

/** Admin-only: revoke Premium and clear the expiry. */
export async function adminRevokePremium(uid) {
  return withRetry(() => setDoc(
    doc(db, 'users', uid),
    { plan: 'free', planExpires: null },
    { merge: true },
  ));
}

/**
 * Stamp the user's `lastActive` timestamp. Called on app open (throttled by
 * the caller) so the admin panel can show who's active and detect churn.
 * `lastActive` is not a privileged field, so the owner-update rule allows it.
 */
export async function touchLastActive(uid) {
  // Stamp the running app version alongside activity so the admin panel can see
  // which build each user is on (and spot users stuck on stale versions). Same
  // hourly throttle as lastActive — one extra string, no added writes.
  return setDoc(doc(db, 'users', uid), { lastActive: serverTimestamp(), appVersion: APP_VERSION }, { merge: true });
}

/** Delete the user's main document */
export async function deleteUserProfile(uid) {
  return deleteDoc(doc(db, 'users', uid));
}

// ─── Admin private notes & tags ─────────────────────────────────
// Stored in a separate top-level `adminNotes/{uid}` collection (NOT on the
// user's own doc) so the note/tags stay invisible to the user — only admins
// can read/write per the Firestore rules. Each doc: { text, tags[], updatedAt }.

export async function getAdminMeta(uid) {
  const snap = await getDoc(doc(db, 'adminNotes', uid));
  const d = snap.exists() ? snap.data() : {};
  return { text: d.text || '', tags: Array.isArray(d.tags) ? d.tags : [] };
}

export async function setAdminMeta(uid, { text, tags }, authorUid) {
  const fields = { updatedAt: serverTimestamp(), updatedBy: authorUid || null };
  if (text !== undefined) fields.text = text || '';
  if (tags !== undefined) fields.tags = Array.isArray(tags) ? tags : [];
  return withRetry(() => setDoc(doc(db, 'adminNotes', uid), fields, { merge: true }));
}

// Load every admin-meta doc as a { [uid]: { text, tags } } map so the panel can
// show tags inline and filter by them. Admin-only (rules gate the collection).
export async function getAllAdminMeta() {
  const snap = await getDocs(collection(db, 'adminNotes'));
  const map = {};
  snap.docs.forEach((d) => {
    const v = d.data();
    map[d.id] = { text: v.text || '', tags: Array.isArray(v.tags) ? v.tags : [] };
  });
  return map;
}

// ─── Payments (revenue tracking) ────────────────────────────────
// Admin-only top-level `payments` collection. One row per recorded payment so
// total revenue keeps full history even as a customer renews.

export async function addPayment({ uid, amount, currency = 'ILS', days, plan = 'premium', note }, authorUid) {
  return withRetry(() => addDoc(collection(db, 'payments'), {
    uid: uid || null,
    amount: Number(amount) || 0,
    currency,
    days: Number.isFinite(days) ? days : null,
    plan,
    note: note || null,
    createdAt: serverTimestamp(),
    createdBy: authorUid || null,
  }));
}

export async function getAllPayments() {
  const snap = await getDocs(collection(db, 'payments'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Admin Operations ───────────────────────────────────────────

/** Get all user root documents. Allowed only for admins by Firestore rules. */
export async function getAllUsers() {
  return withRetry(async () => {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

// Cheap document count for a user's subcollection (admin panel). Uses the
// server-side count aggregation so we don't pay to download the docs.
export async function getUserSubcollectionCount(uid, collectionName) {
  const snap = await getCountFromServer(collection(db, 'users', uid, collectionName));
  return snap.data().count;
}

// ─── Batch Operations ───────────────────────────────────────────

/** Batch update documents from a snapshot, chunked to 499 per batch */
export async function batchUpdateFromSnapshot(snapDocs, updateFn) {
  const chunks = [];
  for (let i = 0; i < snapDocs.length; i += 499) {
    chunks.push(snapDocs.slice(i, i + 499));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((d) => {
      const data = updateFn(d);
      if (data) batch.update(d.ref, data);
    });
    await batch.commit();
  }
}

/** Batch delete documents matching a filter, chunked to 499 per batch */
export async function batchDeleteByFilter(snapDocs, filterFn) {
  const toDelete = snapDocs.filter(filterFn);
  for (let i = 0; i < toDelete.length; i += 499) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 499).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Apply admin data-cleanup actions on a user's trades: field updates and
 *  deletions, mixed into chunked write batches (499 ops per batch). Each
 *  update also stamps updatedAt. Returns the number of ops committed. */
export async function applyTradeCleanup(uid, { updates = [], deletes = [] }) {
  const ops = [
    ...updates.map((u) => ({ type: 'update', id: u.id, data: u.data })),
    ...deletes.map((id) => ({ type: 'delete', id })),
  ];
  for (let i = 0; i < ops.length; i += 499) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 499)) {
      const ref = doc(db, 'users', uid, 'trades', op.id);
      if (op.type === 'update') batch.update(ref, { ...op.data, updatedAt: serverTimestamp() });
      else batch.delete(ref);
    }
    await withRetry(() => batch.commit());
  }
  return ops.length;
}

// Every subcollection the app writes under users/{uid}. Account deletion
// wipes EXACTLY this list — when adding a new subcollection (here and in
// firestore.rules), add it to this list too or it will stay orphaned under a
// dead uid after the user deletes their account.
export const USER_SUBCOLLECTIONS = [
  'trades', 'journals', 'backtests', 'backtestJournals', 'dca',
  'tradingPlans', 'notes', 'strategies', 'morningJournals', 'eveningJournals',
  'processes', 'polymarketWatch', 'polymarketStrategies', 'settings',
  'tradeImages', 'apiKeys', 'apiIdempotency',
];

/** Delete all documents in a user's subcollection */
export async function deleteUserSubcollection(uid, collectionName) {
  const snap = await getDocs(collection(db, 'users', uid, collectionName));
  await batchDeleteByFilter(snap.docs, () => true);
}

// ─── Leaderboard (Public Collection) ────────────────────────────

/** Subscribe to all leaderboard entries */
export function subscribeToLeaderboard(onData, onError) {
  const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Set/update leaderboard entry for a user */
export async function setLeaderboardEntry(uid, data) {
  return withRetry(() => setDoc(doc(db, 'leaderboard', uid), data, { merge: true }));
}

/** Delete leaderboard entry (opt-out) */
export async function deleteLeaderboardEntry(uid) {
  return withRetry(() => deleteDoc(doc(db, 'leaderboard', uid)));
}

/** Get leaderboard entry for a user */
export async function getLeaderboardEntry(uid) {
  const snap = await getDoc(doc(db, 'leaderboard', uid));
  return snap.exists() ? snap.data() : null;
}

// ─── Daily Stats ────────────────────────────────────────────────

/** Get today's closed trades for daily summary */
export async function getTodayClosedTrades(uid) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, 'users', uid, 'trades'),
    where('exitDate', '>=', Timestamp.fromDate(today))
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** The user's OPEN trades (all journals) — one equality filter, so no
 *  composite index; the trading terminal reads their original stops. */
export async function getOpenTrades(uid) {
  const q = query(collection(db, 'users', uid, 'trades'), where('status', '==', 'open'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Utilities ──────────────────────────────────────────────────

/** Get a server timestamp */
export function timestamp() {
  return serverTimestamp();
}

/** Firestore Timestamp from a JS Date — keeps `firebase/firestore` out of
 * hooks/components (service-layer convention, issue #216). */
export function dateToTimestamp(date) {
  return Timestamp.fromDate(date);
}

/** Remove a field on update. Keeps `firebase/firestore` inside this service. */
export function unsetField() {
  return deleteField();
}

// Re-exported so callers append to array fields without importing
// `firebase/firestore` directly (service-layer convention, issue #216).
export { arrayUnion } from 'firebase/firestore';

/**
 * Erase Firestore's offline cache (IndexedDB) on this device. Used after an
 * account is deleted, so the deleted user's data doesn't linger in the browser.
 * Firestore must be terminated first and is unusable afterwards — the caller
 * has to reload the page.
 */
export async function clearLocalFirestoreCache() {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
