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
  getCountFromServer,
} from 'firebase/firestore';
import { db } from './firebase';

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
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError || ((error) => console.error(`Firestore listener error (${collectionName}):`, error))
  );
}

/** Add a document to a user's subcollection */
export async function addToUserCollection(uid, collectionName, data) {
  return withRetry(() => addDoc(collection(db, 'users', uid, collectionName), data));
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
export function subscribeToUserSetting(uid, settingId, onData) {
  return onSnapshot(doc(db, 'users', uid, 'settings', settingId), (snap) => {
    onData(snap.exists() ? snap.data() : null);
  });
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
export function subscribeToUserProfile(uid, onData) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) onData(snap.data());
  });
}

/** Create or update the user's main document */
export async function setUserProfile(uid, data, merge = true) {
  return withRetry(() => setDoc(doc(db, 'users', uid), data, merge ? { merge: true } : undefined));
}

/**
 * Admin-only: grant a user a Premium plan for `days` (Infinity for lifetime).
 * Bypasses noPrivilegeEscalation via the admin-write Firestore rule.
 */
export async function adminGrantPremium(uid, days) {
  const planExpires = Number.isFinite(days)
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    : null; // null = lifetime
  return withRetry(() => setDoc(
    doc(db, 'users', uid),
    { plan: 'premium', planExpires, planGrantedAt: new Date().toISOString() },
    { merge: true },
  ));
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
  return setDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() }, { merge: true });
}

/** Delete the user's main document */
export async function deleteUserProfile(uid) {
  return deleteDoc(doc(db, 'users', uid));
}

// ─── Admin private notes ────────────────────────────────────────
// Stored in a separate top-level `adminNotes/{uid}` collection (NOT on the
// user's own doc) so the note stays invisible to the user — only admins can
// read/write it per the Firestore rules.

export async function getAdminNote(uid) {
  const snap = await getDoc(doc(db, 'adminNotes', uid));
  return snap.exists() ? (snap.data().text || '') : '';
}

export async function setAdminNote(uid, text, authorUid) {
  return withRetry(() => setDoc(
    doc(db, 'adminNotes', uid),
    { text: text || '', updatedAt: serverTimestamp(), updatedBy: authorUid || null },
    { merge: true },
  ));
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

// ─── Utilities ──────────────────────────────────────────────────

/** Get a server timestamp */
export function timestamp() {
  return serverTimestamp();
}
