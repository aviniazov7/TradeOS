// Admin notification center. All Firestore access for the feed and its
// settings lives here — components never import firebase/* themselves.
import {
  collection, query, orderBy, where, limit, startAfter,
  onSnapshot, doc, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseDb';
import { normalizeSettings } from '../../functions/adminNotifications.mjs';

const FEED = 'adminNotifications';
const SETTINGS = 'config';
export const NOTIFICATION_PAGE_SIZE = 10;

function mapDoc(d) {
  const data = d.data();
  return { id: d.id, ...data };
}

export function subscribeUnreadAdminNotificationCount(onCount, onError) {
  const q = query(collection(db, FEED), where('read', '==', false), limit(100));
  return onSnapshot(q, (snap) => onCount(snap.size), onError);
}

export function subscribeAdminNotificationSettings(onData, onError) {
  return onSnapshot(doc(db, 'adminNotificationSettings', SETTINGS), (snap) => {
    onData(normalizeSettings(snap.exists() ? snap.data() : null));
  }, onError);
}

export async function saveAdminNotificationSettings(settings, authorUid) {
  const next = normalizeSettings(settings);
  await setDoc(doc(db, 'adminNotificationSettings', SETTINGS), {
    enabled: next.enabled,
    types: next.types,
    thresholds: next.thresholds,
    updatedAt: serverTimestamp(),
    updatedBy: authorUid || null,
  }, { merge: true });
  return next;
}

async function runPageQuery({ type, cursor, pageSize }) {
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (type && type !== 'all') constraints.unshift(where('type', '==', type));
  if (cursor) constraints.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, FEED), ...constraints));
  const last = snap.docs[snap.docs.length - 1] || null;
  return {
    items: snap.docs.map(mapDoc),
    cursor: last,
    hasMore: snap.docs.length === pageSize,
  };
}

// Until the composite index (type + createdAt) is deployed, a filtered query
// fails with failed-precondition. Walk the newest-first feed and keep only
// the requested type so the page still works.
async function runFilteredScan({ type, cursor, pageSize }) {
  const items = [];
  let scanCursor = cursor || null;
  let hasMore = false;
  for (let step = 0; step < 8 && items.length < pageSize; step++) {
    const constraints = [orderBy('createdAt', 'desc'), limit(40)];
    if (scanCursor) constraints.push(startAfter(scanCursor));
    const snap = await getDocs(query(collection(db, FEED), ...constraints));
    if (snap.empty) break;
    let consumed = 0;
    for (const d of snap.docs) {
      consumed += 1;
      scanCursor = d;
      if (d.data().type === type) items.push(mapDoc(d));
      if (items.length >= pageSize) break;
    }
    if (items.length >= pageSize) {
      hasMore = consumed < snap.size || snap.size === 40;
      break;
    }
    if (snap.size < 40) break;
  }
  return { items, cursor: scanCursor, hasMore };
}

export async function fetchAdminNotificationPage({ type = 'all', cursor = null, pageSize = NOTIFICATION_PAGE_SIZE } = {}) {
  try {
    return await runPageQuery({ type, cursor, pageSize });
  } catch (err) {
    if (type !== 'all' && err?.code === 'failed-precondition') {
      return runFilteredScan({ type, cursor, pageSize });
    }
    throw err;
  }
}

export async function markAdminNotificationRead(id) {
  await updateDoc(doc(db, FEED, id), { read: true, readAt: serverTimestamp() });
}

export async function markAllAdminNotificationsRead() {
  const snap = await getDocs(query(collection(db, FEED), where('read', '==', false), limit(400)));
  if (snap.empty) return 0;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: serverTimestamp() }));
  await batch.commit();
  return snap.size;
}
