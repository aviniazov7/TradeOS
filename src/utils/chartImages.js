import { isImageDataUrl } from './imageCompress';

// What the user may hand us (a screenshot, a paste, a photo export) and what
// we are willing to STORE after compression. GIF is accepted and re-encoded
// to WebP/JPEG; SVG and anything else is refused before it reaches Storage.

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const STORED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Matches storage.rules. Compression targets ~250KB; this is the hard cap.
export const MAX_STORED_IMAGE_BYTES = 2 * 1024 * 1024;

export function imageRejectReason(file) {
  if (!file) return 'לא נמצאה תמונה';
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'אפשר לצרף רק תמונות PNG, JPEG, WebP או GIF';
  return null;
}

/** First image on a clipboard, from files or from items. Null when there is none. */
export function imageFileFromClipboard(clipboardData) {
  if (!clipboardData) return null;
  const files = clipboardData.files ? [...clipboardData.files] : [];
  const file = files.find((f) => ACCEPTED_IMAGE_TYPES.includes(f?.type));
  if (file) return file;
  const items = clipboardData.items ? [...clipboardData.items] : [];
  const item = items.find((i) => ACCEPTED_IMAGE_TYPES.includes(i?.type));
  return item?.getAsFile?.() || null;
}

/**
 * Turn a compressed data URL into a Blob we can upload. Rejects anything that
 * isn't a raster image we render, or that's over the Storage cap.
 */
export function dataUrlToBlob(dataUrl) {
  if (!isImageDataUrl(dataUrl)) throw new Error('סוג התמונה אינו נתמך');
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const type = header.match(/^data:(image\/(?:webp|jpeg|png));base64$/)?.[1];
  if (!STORED_IMAGE_TYPES.includes(type)) throw new Error('סוג התמונה אינו נתמך');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.length > MAX_STORED_IMAGE_BYTES) throw new Error('התמונה גדולה מדי');
  return new Blob([bytes], { type });
}
