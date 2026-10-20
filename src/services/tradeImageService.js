// Legacy chart screenshots attached to a trade.
//
// Metadata lives in users/{uid}/tradeImages/{imageId} — NOT on the trade
// document. The trades collection is subscribed live by most screens, so image
// bytes there would slow every one of them. Doc ids are the fixed slots
// `${tradeId}_0..3` (see utils/tradeImageSlots.js).
//
// New charts are TradingView links on the trade itself. This module only
// reads and deletes screenshots that were already saved as data URLs. It does
// not upload, and it does not talk to Firebase Storage.
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseDb';
import { tradeImageIds } from '../utils/tradeImageSlots';

export const TRADE_IMAGES_COLLECTION = 'tradeImages';

const imagesRef = (uid) => collection(db, 'users', uid, TRADE_IMAGES_COLLECTION);
const imageRef = (uid, imageId) => doc(db, 'users', uid, TRADE_IMAGES_COLLECTION, imageId);

const toMillis = (ts) => (ts?.toMillis ? ts.toMillis() : ts instanceof Date ? ts.getTime() : 0);

/** All screenshots of one trade, oldest first. Single-field where → no composite index. */
export async function listTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return [];
  const snap = await getDocs(query(imagesRef(uid), where('tradeId', '==', String(tradeId))));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

/**
 * Delete every screenshot doc of ONE trade without reading anything: its
 * images live at fixed slot ids. Deleting a missing doc is a no-op.
 */
export async function deleteTradeImages(uid, tradeId) {
  if (!uid || !tradeId) return;
  const ids = tradeImageIds(String(tradeId));
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(imageRef(uid, id)));
  await batch.commit();
}

/**
 * Delete the screenshot docs of MANY trades (a whole journal). Blind slot
 * deletes would cost 4 writes per trade even though most trades have no
 * images, so here we look the docs up and delete only what exists.
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
