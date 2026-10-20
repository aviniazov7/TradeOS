// Trade screenshot slots.
//
// A trade has at most MAX_TRADE_IMAGES screenshots, stored at the deterministic
// document ids `${tradeId}_0` … `${tradeId}_3` in users/{uid}/tradeImages.
// Fixed ids give us two things for free:
//   • the 4-image cap is enforced server-side (firestore.rules only allows
//     creating one of those four ids), not just in the UI;
//   • deleting a trade's screenshots needs no read — we delete the four ids
//     blindly (deleting a missing doc is a no-op), so cleaning up after a trade
//     or a whole journal never downloads image data.

export const MAX_TRADE_IMAGES = 4;
export const TRADE_IMAGE_KINDS = ['before', 'after', 'other'];
export const TRADE_IMAGE_KIND_LABELS = { before: 'לפני', after: 'אחרי', other: 'אחר' };

/** Document id of a trade's screenshot slot. */
export function tradeImageId(tradeId, slot) {
  return `${tradeId}_${slot}`;
}

/** All possible screenshot doc ids of a trade. */
export function tradeImageIds(tradeId) {
  return Array.from({ length: MAX_TRADE_IMAGES }, (_, i) => tradeImageId(tradeId, i));
}

/**
 * Storage object path for one screenshot slot. The uid is the first segment
 * so storage.rules can allow only the owner. The object name is the Firestore
 * slot id, which lets a trade delete remove the files without listing them.
 */
export function chartObjectPath(uid, imageId) {
  if (!uid || !imageId) throw new Error('missing uid/imageId');
  return `users/${uid}/charts/${imageId}`;
}

/** Slot number encoded in an image doc id, or -1 when it isn't one of ours. */
export function slotOfImageId(imageId, tradeId) {
  const prefix = `${tradeId}_`;
  if (typeof imageId !== 'string' || !imageId.startsWith(prefix)) return -1;
  const slot = Number(imageId.slice(prefix.length));
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_TRADE_IMAGES ? slot : -1;
}

/** Lowest unused slot for a trade given its current images, or -1 when full. */
export function freeTradeImageSlot(images, tradeId) {
  const used = new Set((images || []).map((img) => slotOfImageId(img?.id, tradeId)));
  for (let i = 0; i < MAX_TRADE_IMAGES; i++) if (!used.has(i)) return i;
  return -1;
}

/**
 * Tag to pre-select for a new screenshot: the first one is the setup
 * ("before"), the next one the result ("after"), anything beyond is "other".
 */
export function defaultImageKind(images) {
  const kinds = new Set((images || []).map((img) => img?.kind));
  if (!kinds.has('before')) return 'before';
  if (!kinds.has('after')) return 'after';
  return 'other';
}
