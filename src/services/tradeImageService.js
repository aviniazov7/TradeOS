// Chart screenshots attached to a trade.
//
// Stored in their own subcollection users/{uid}/tradeImages/{imageId} — NOT on
// the trade document. The trades collection is subscribed live by most screens,
// so a few hundred KB of image data per trade would slow every one of them.
// Each image doc: { tradeId, dataUrl, kind, caption, width?, height?,
// createdAt, updatedAt? }. dataUrl is a compressed WebP/JPEG data URL (see
// utils/imageCompress.js); firestore.rules caps it at 350,000 chars.
// Doc ids are the fixed slots `${tradeId}_0..3` (see utils/tradeImageSlots.js).
//
// Firebase Storage was deliberately not used: the project has no storage.rules
// and no storage entry in firebase.json, so it would need console setup.
// Firestore needs only the rules addition.
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
import { db } from './firebaseDb';
import {
  TRADE_IMAGE_KINDS,
  MAX_TRADE_IMAGES,
  tradeImageId,
  tradeImageIds,
} from '../utils/tradeImageSlots';

export const TRADE_IMAGES_COLLECTION = 'tradeImages';
export const MAX_CAPTION_LENGTH = 200;
// Must match the firestore.rules cap on dataUrl.
export const MAX_DATA_URL_CHARS = 350_000;

const imagesRef = (uid) => collection(db, 'users', uid, TRADE_IMAGES_COLLECTION);
const imageRef = (uid, imageId) => doc(db, 'users', uid, TRADE_IMAGES_COLLECTION, imageId);

const toMillis = (ts) => (ts?.toMillis ? ts.toMillis() : ts instanceof Date ? ts.getTime() : 0);
const cleanKind = (kind) => (TRADE_IMAGE_KINDS.includes(kind) ? kind : 'other');
const cleanCaption = (caption) => String(caption || '').trim().slice(0, MAX_CAPTION_LENGTH);

/** All screenshots of one trade, oldest first. Single-field where → no composite index. */
export async function listTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return [];
  const snap = await getDocs(query(imagesRef(uid), where('tradeId', '==', String(tradeId))));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

/**
 * Store a screenshot in the given slot (0..MAX_TRADE_IMAGES-1). The rules only
 * allow CREATING a slot doc, so a slot that's already taken (e.g. filled from
 * another tab) is rejected instead of silently overwritten.
 * Resolves the stored image as the UI should show it.
 */
export async function addTradeImage(uid, { tradeId, slot, dataUrl, kind = 'other', caption = '', width, height }) {
  if (!uid || !tradeId) throw new Error('missing uid/tradeId');
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_TRADE_IMAGES) {
    throw new Error(`ניתן לצרף עד ${MAX_TRADE_IMAGES} צילומים לעסקה`);
  }
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('התמונה גדולה מדי');
  }
  const id = tradeImageId(tradeId, slot);
  const data = {
    tradeId: String(tradeId),
    dataUrl,
    kind: cleanKind(kind),
    caption: cleanCaption(caption),
    createdAt: serverTimestamp(),
  };
  if (Number.isFinite(width)) data.width = Math.round(width);
  if (Number.isFinite(height)) data.height = Math.round(height);
  await setDoc(imageRef(uid, id), data);
  return { id, ...data, createdAt: new Date() };
}

/** Update the tag and/or caption of a screenshot. */
export async function updateTradeImage(uid, imageId, { kind, caption }) {
  const patch = { updatedAt: serverTimestamp() };
  if (kind !== undefined) patch.kind = cleanKind(kind);
  if (caption !== undefined) patch.caption = cleanCaption(caption);
  return updateDoc(imageRef(uid, imageId), patch);
}

export async function deleteTradeImage(uid, imageId) {
  return deleteDoc(imageRef(uid, imageId));
}

// Cleanup after deletes is best-effort for every caller below: a leftover image
// is invisible (no trade links to it) and is still purged on account deletion
// via USER_SUBCOLLECTIONS.

/**
 * Delete every screenshot of ONE trade without reading anything: its images
 * live at fixed slot ids and deleting a missing doc is a no-op — 4 deletes in
 * one batch, no image data downloaded. Used after a single trade is deleted.
 */
export async function deleteTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return;
  const batch = writeBatch(db);
  tradeImageIds(String(tradeId)).forEach((id) => batch.delete(imageRef(uid, id)));
  await batch.commit();
}

/**
 * Delete the screenshots of MANY trades (a whole journal). Blind slot deletes
 * would cost 4 writes per trade even though most trades have no images, so
 * here we look the images up with chunked `in` queries (Firestore allows 30
 * values per `in`) and delete only what exists.
 */
export async function deleteImagesForTrades(uid, tradeIds) {
  const ids = [...new Set((tradeIds || []).filter(Boolean).map(String))];
  if (!uid || !ids.length) return;
  const refs = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(imagesRef(uid), where('tradeId', 'in', ids.slice(i, i + 30))));
    snap.docs.forEach((d) => refs.push(d.ref));
  }
  for (let i = 0; i < refs.length; i += 499) {
    const batch = writeBatch(db);
    refs.slice(i, i + 499).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
