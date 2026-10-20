// Chart screenshots attached to a trade.
//
// Metadata lives in users/{uid}/tradeImages/{imageId} — NOT on the trade
// document. The trades collection is subscribed live by most screens, so image
// bytes there would slow every one of them. Doc ids are the fixed slots
// `${tradeId}_0..3` (see utils/tradeImageSlots.js).
//
// New bytes go to Firebase Storage at users/{uid}/charts/{imageId}, owner-only
// (storage.rules). The Firestore doc stores storagePath + contentType, never a
// download URL (those tokens are readable by anyone who has the link).
//
// Older screenshots are still data URLs on the Firestore doc. They stay
// readable; this module does not rewrite them.
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import app from './firebase';
import { db } from './firebaseDb';
import {
  TRADE_IMAGE_KINDS,
  MAX_TRADE_IMAGES,
  tradeImageId,
  tradeImageIds,
  chartObjectPath,
} from '../utils/tradeImageSlots';
import { MAX_STORED_IMAGE_BYTES, STORED_IMAGE_TYPES } from '../utils/chartImages';

export const TRADE_IMAGES_COLLECTION = 'tradeImages';
export const MAX_CAPTION_LENGTH = 200;
// Legacy data-URL docs. New uploads do not write this field.
export const MAX_DATA_URL_CHARS = 350_000;

const imagesRef = (uid) => collection(db, 'users', uid, TRADE_IMAGES_COLLECTION);
const imageRef = (uid, imageId) => doc(db, 'users', uid, TRADE_IMAGES_COLLECTION, imageId);

const toMillis = (ts) => (ts?.toMillis ? ts.toMillis() : ts instanceof Date ? ts.getTime() : 0);
const cleanKind = (kind) => (TRADE_IMAGE_KINDS.includes(kind) ? kind : 'other');
const cleanCaption = (caption) => String(caption || '').trim().slice(0, MAX_CAPTION_LENGTH);

let storageNs;
let storage;
let emulatorConnected = false;

function storageApi() {
  storageNs ??= import('firebase/storage');
  return storageNs;
}

async function tradeStorage() {
  const ns = await storageApi();
  if (!storage) storage = ns.getStorage(app);
  if (!emulatorConnected && import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    ns.connectStorageEmulator(storage, '127.0.0.1', 9199);
    emulatorConnected = true;
  }
  return { ...ns, storage };
}

async function removeObject(storagePath) {
  if (!storagePath) return;
  try {
    const { storage: bucket, ref, deleteObject } = await tradeStorage();
    await deleteObject(ref(bucket, storagePath));
  } catch (err) {
    // A legacy screenshot has no object, and a second delete of the same slot
    // is normal. Anything else is still best-effort for the caller.
    if (err?.code === 'storage/object-not-found') return;
    console.warn('Chart file delete failed:', err);
  }
}

/** All screenshots of one trade, oldest first. Single-field where → no composite index. */
export async function listTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return [];
  const snap = await getDocs(query(imagesRef(uid), where('tradeId', '==', String(tradeId))));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

/**
 * Download a stored screenshot as a blob: URL. The request is authorized as
 * the signed-in user, so it fails closed when the rules deny it. Caller
 * revokes the URL.
 */
export async function loadTradeImageUrl(storagePath) {
  if (!storagePath) throw new Error('missing storagePath');
  const { storage: bucket, ref, getBlob } = await tradeStorage();
  const blob = await getBlob(ref(bucket, storagePath));
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('סוג הקובץ אינו תמונה');
  return URL.createObjectURL(blob);
}

/**
 * Store a screenshot in the given slot (0..MAX_TRADE_IMAGES-1).
 * The metadata doc is created first (the rules reject a second create on a
 * taken slot), then the bytes are uploaded. A failed upload deletes the doc
 * so the slot stays free.
 */
export async function addTradeImage(uid, {
  tradeId, slot, blob, contentType, kind = 'other', caption = '', width, height,
}) {
  if (!uid || !tradeId) throw new Error('missing uid/tradeId');
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_TRADE_IMAGES) {
    throw new Error(`ניתן לצרף עד ${MAX_TRADE_IMAGES} צילומים לעסקה`);
  }
  if (!STORED_IMAGE_TYPES.includes(contentType)) throw new Error('סוג התמונה אינו נתמך');
  if (!blob || blob.size <= 0 || blob.size > MAX_STORED_IMAGE_BYTES) throw new Error('התמונה גדולה מדי');

  const id = tradeImageId(tradeId, slot);
  const storagePath = chartObjectPath(uid, id);
  const data = {
    tradeId: String(tradeId),
    storagePath,
    contentType,
    kind: cleanKind(kind),
    caption: cleanCaption(caption),
    createdAt: serverTimestamp(),
  };
  if (Number.isFinite(width)) data.width = Math.round(width);
  if (Number.isFinite(height)) data.height = Math.round(height);

  await setDoc(imageRef(uid, id), data);
  try {
    const { storage: bucket, ref, uploadBytes } = await tradeStorage();
    await uploadBytes(ref(bucket, storagePath), blob, { contentType });
  } catch (err) {
    await deleteDoc(imageRef(uid, id)).catch(() => {});
    throw err;
  }
  return { id, ...data, createdAt: new Date() };
}

/** Update the tag and/or caption of a screenshot. */
export async function updateTradeImage(uid, imageId, { kind, caption }) {
  const patch = { updatedAt: serverTimestamp() };
  if (kind !== undefined) patch.kind = cleanKind(kind);
  if (caption !== undefined) patch.caption = cleanCaption(caption);
  return updateDoc(imageRef(uid, imageId), patch);
}

export async function deleteTradeImage(uid, imageId, storagePath) {
  await deleteDoc(imageRef(uid, imageId));
  await removeObject(storagePath || chartObjectPath(uid, imageId));
}

/**
 * Delete every screenshot of ONE trade without reading anything: its images
 * live at fixed slot ids. Storage objects use the same ids; a missing object
 * is ignored so legacy data-URL screenshots still clean up.
 */
export async function deleteTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return;
  const ids = tradeImageIds(String(tradeId));
  await Promise.all(ids.map((id) => removeObject(chartObjectPath(uid, id))));
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(imageRef(uid, id)));
  await batch.commit();
}

/**
 * Delete the screenshots of MANY trades (a whole journal). Blind slot deletes
 * would cost 4 writes per trade even though most trades have no images, so
 * here we look the images up and delete only what exists — including the
 * Storage object when the doc points at one.
 */
export async function deleteImagesForTrades(uid, tradeIds) {
  const ids = [...new Set((tradeIds || []).filter(Boolean).map(String))];
  if (!uid || !ids.length) return;
  const docs = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(imagesRef(uid), where('tradeId', 'in', ids.slice(i, i + 30))));
    snap.docs.forEach((d) => docs.push({ ref: d.ref, storagePath: d.data()?.storagePath }));
  }
  await Promise.all(docs.map((d) => removeObject(d.storagePath)));
  for (let i = 0; i < docs.length; i += 499) {
    const batch = writeBatch(db);
    docs.slice(i, i + 499).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Best-effort wipe of every chart file for an account. Never throws. */
export async function deleteUserChartFiles(uid) {
  if (!uid) return;
  try {
    const { storage: bucket, ref, listAll, deleteObject } = await tradeStorage();
    const listed = await listAll(ref(bucket, `users/${uid}/charts`));
    await Promise.all(listed.items.map((item) => deleteObject(item).catch(() => {})));
  } catch (err) {
    console.warn('Chart storage cleanup failed:', err);
  }
}
