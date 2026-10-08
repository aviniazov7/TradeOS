// Client-side image compression for trade chart screenshots.
//
// Screenshots are stored as data URLs in Firestore (users/{uid}/tradeImages),
// so every image must fit a hard size budget BEFORE it is written: the
// Firestore rule rejects a dataUrl longer than 350,000 chars and a document is
// capped at 1 MiB. We resize to fit a max dimension, encode WebP (JPEG where
// the browser can't encode WebP — older Safari silently returns PNG), and
// step quality, then dimensions, down until the result fits the budget.
//
// The sizing math is pure and unit-tested; only compressImageFile() touches
// the DOM (canvas / Image / FileReader).

export const DEFAULT_MAX_DIM = 1600;
export const DEFAULT_QUALITY = 0.8;
// Target length of the data URL string (what Firestore stores and the rule
// measures). ~250K chars ≈ 187KB of binary image data.
export const DEFAULT_MAX_CHARS = 250_000;
// Never shrink below this on the longest side — past that a chart is unreadable,
// and we'd rather report "too big" than store a useless thumbnail.
export const MIN_DIM = 480;
// Raw input limit — protects the tab from decoding a gigantic file.
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5];
const SCALE_STEP = 0.8;

/**
 * Scale (width, height) down so the longest side is at most maxDim, keeping the
 * aspect ratio. Never upscales. Returns integer pixel sizes, each at least 1.
 */
export function fitWithin(width, height, maxDim = DEFAULT_MAX_DIM) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Decoded byte size of a base64 data URL (the payload after the comma). */
export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Ordered list of encode attempts, best quality first: at the fitted size try
 * each quality step, then shrink the dimensions by SCALE_STEP and repeat, until
 * the longest side would drop below MIN_DIM. The caller encodes each attempt in
 * order and keeps the first one under the size budget.
 */
export function buildCompressionPlan(width, height, {
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
  minDim = MIN_DIM,
} = {}) {
  const base = fitWithin(width, height, maxDim);
  if (!base.width || !base.height) return [];
  const qualities = [quality, ...QUALITY_STEPS.filter((q) => q < quality)];
  const plan = [];
  let dim = Math.max(base.width, base.height);
  // An image already smaller than minDim still gets its own size attempted once.
  const floor = Math.min(minDim, dim);
  while (dim >= floor) {
    const size = fitWithin(base.width, base.height, dim);
    for (const q of qualities) plan.push({ ...size, quality: q });
    const next = Math.floor(dim * SCALE_STEP);
    if (next < floor || next === dim) break;
    dim = next;
  }
  return plan;
}

/** True when the string is a base64 image data URL we are willing to render/store. */
export function isImageDataUrl(value) {
  return typeof value === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(value);
}

// ─── Browser-only helpers ───────────────────────────────────────────

let webpSupport = null;
function canEncodeWebp() {
  if (webpSupport === null) {
    try {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('קובץ התמונה אינו תקין')); };
    img.src = url;
  });
}

/**
 * Resize + encode an image File into a data URL that fits maxChars.
 * Resolves { dataUrl, width, height, bytes, type }; rejects with a Hebrew
 * message when the file isn't an image, is too large, or can't fit the budget.
 */
export async function compressImageFile(file, {
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
  maxChars = DEFAULT_MAX_CHARS,
} = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('יש לבחור קובץ תמונה');
  if (file.size > MAX_INPUT_BYTES) throw new Error('התמונה גדולה מדי (עד 20MB)');

  const img = await loadImage(file);
  const plan = buildCompressionPlan(img.naturalWidth || img.width, img.naturalHeight || img.height, { maxDim, quality });
  if (!plan.length) throw new Error('קובץ התמונה אינו תקין');

  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let lastSize = { width: 0, height: 0 };
  for (const step of plan) {
    if (step.width !== lastSize.width || step.height !== lastSize.height) {
      canvas.width = step.width;
      canvas.height = step.height;
      // JPEG has no alpha — paint transparent PNG screenshots onto the app's
      // dark background instead of black-on-black artifacts.
      ctx.fillStyle = '#0b0b0f';
      ctx.fillRect(0, 0, step.width, step.height);
      ctx.drawImage(img, 0, 0, step.width, step.height);
      lastSize = step;
    }
    const dataUrl = canvas.toDataURL(type, step.quality);
    if (dataUrl.length <= maxChars) {
      return { dataUrl, width: step.width, height: step.height, bytes: dataUrlBytes(dataUrl), type };
    }
  }
  throw new Error('לא ניתן לדחוס את התמונה לגודל המותר');
}
