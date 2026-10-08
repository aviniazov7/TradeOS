// Profile pictures are stored as a small data URL on the user's own profile
// doc (no Storage bucket needed): a centre-cropped square, 256px, WebP (JPEG
// where the browser can't encode WebP), kept well under ~60K characters.

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_CHARS = 60_000;

// The centred square crop of a width×height image.
export function centerSquare(width, height) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
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

export async function makeAvatarDataUrl(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('יש לבחור קובץ תמונה');
  if (file.size > 15 * 1024 * 1024) throw new Error('התמונה גדולה מדי (עד 15MB)');
  const img = await loadImage(file);
  const { sx, sy, side } = centerSquare(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const webp = canvas.toDataURL('image/webp', 0.85);
  const type = webp.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL(type, q);
    if (url.length <= AVATAR_MAX_CHARS) return url;
  }
  throw new Error('לא הצלחנו לכווץ את התמונה');
}
