// Admin mailbox. Firestore access for adminInbox lives here — components
// never import firebase/* themselves. Writes that create messages happen in
// the Worker (service account). The client only reads and updates read /
// archive flags, and only an admin can (see firestore.rules).
import {
  collection, query, orderBy, where, limit, onSnapshot,
  doc, getDocs, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseDb';
import { OPERATIONAL_NOTICE_TYPES } from '../utils/adminInbox';

const FEED = 'adminInbox';
const NOTICES = 'adminNotifications';
const OPERATIONAL = new Set(OPERATIONAL_NOTICE_TYPES);
const PAGE = 100;

function mapDoc(d) {
  return { id: d.id, ...d.data() };
}

export function subscribeAdminInboxItems(onItems, onError) {
  const q = query(collection(db, FEED), orderBy('createdAt', 'desc'), limit(PAGE));
  return onSnapshot(q, (snap) => onItems(snap.docs.map(mapDoc)), onError);
}

export function subscribeOperationalNotices(onItems, onError) {
  const q = query(collection(db, NOTICES), orderBy('createdAt', 'desc'), limit(PAGE));
  return onSnapshot(q, (snap) => {
    onItems(snap.docs.map(mapDoc).filter((row) => OPERATIONAL.has(row.type)));
  }, onError);
}

function countUnread(snap, extra) {
  return snap.docs.filter((d) => {
    const data = d.data();
    if (data.archived === true || data.read === true) return false;
    return extra ? extra(data) : true;
  }).length;
}

export function subscribeAdminMailboxUnread(onCount, onError) {
  let inbox = 0;
  let notices = 0;
  let inboxReady = false;
  let noticesReady = false;
  const emit = () => {
    if (!inboxReady && !noticesReady) return;
    onCount(inbox + notices);
  };
  const inboxQuery = query(collection(db, FEED), where('read', '==', false), limit(PAGE));
  const noticeQuery = query(collection(db, NOTICES), where('read', '==', false), limit(PAGE));
  const unsubInbox = onSnapshot(inboxQuery, (snap) => {
    inboxReady = true;
    inbox = countUnread(snap);
    emit();
  }, onError);
  const unsubNotices = onSnapshot(noticeQuery, (snap) => {
    noticesReady = true;
    notices = countUnread(snap, (data) => OPERATIONAL.has(data.type));
    emit();
  }, onError);
  return () => {
    unsubInbox();
    unsubNotices();
  };
}

function flagPatch({ read, archived }) {
  const patch = {};
  if (typeof read === 'boolean') {
    patch.read = read;
    patch.readAt = read ? serverTimestamp() : null;
  }
  if (typeof archived === 'boolean') {
    patch.archived = archived;
    patch.archivedAt = archived ? serverTimestamp() : null;
  }
  return patch;
}

async function updateFlags(col, id, flags) {
  const patch = flagPatch(flags);
  if (!Object.keys(patch).length) return;
  await updateDoc(doc(db, col, id), patch);
}

export function updateAdminInboxState(id, flags) {
  return updateFlags(FEED, id, flags);
}

export function updateAdminNoticeState(id, flags) {
  return updateFlags(NOTICES, id, flags);
}

async function markUnreadQuery(col, flags, accept) {
  const snap = await getDocs(query(collection(db, col), where('read', '==', false), limit(400)));
  const docs = snap.docs.filter((d) => accept(d.data()));
  if (!docs.length) return 0;
  const patch = flagPatch(flags);
  const batch = writeBatch(db);
  docs.forEach((d) => batch.update(d.ref, patch));
  await batch.commit();
  return docs.length;
}

export async function markAllAdminInboxRead(kind) {
  return markUnreadQuery(FEED, { read: true }, (data) => data.kind === kind && data.archived !== true);
}

export async function markOperationalNoticesRead() {
  return markUnreadQuery(NOTICES, { read: true }, (data) => OPERATIONAL.has(data.type) && data.archived !== true);
}
