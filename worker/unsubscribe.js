// Marketing-email consent plumbing: signed one-click unsubscribe links.
//
// A link is  <APP_URL>… /email/unsubscribe?u=<uid>&t=<token>  where the token is
// HMAC-SHA256(secret, "unsub:" + uid), hex. No login needed to opt out, and no
// state to store: the Worker re-computes the token. Pure + Web Crypto only, so
// it is unit-tested; index.js does the Firestore write.

import { APP_URL } from './emailTheme.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const UID_RE = /^[A-Za-z0-9]{10,64}$/;

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** Token for a uid, or null when there is no secret / no valid uid. */
export async function unsubscribeToken(secret, uid) {
  if (!secret || !UID_RE.test(uid || '')) return null;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`unsub:${uid}`));
  return hex(sig);
}

// Constant-time string compare (equal lengths only matter for the hex digest).
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyUnsubscribe(secret, uid, token) {
  const expected = await unsubscribeToken(secret, uid);
  return expected !== null && safeEqual(expected, String(token || ''));
}

/** Full link for the email footer / List-Unsubscribe header. */
export async function unsubscribeUrl(workerBase, secret, uid) {
  const t = await unsubscribeToken(secret, uid);
  if (!t) return null;
  return `${workerBase}/email/unsubscribe?u=${encodeURIComponent(uid)}&t=${t}`;
}

/** Plain Hebrew confirmation page returned by the unsubscribe link. */
export function unsubscribePage(ok) {
  const title = ok ? 'הוסרת מרשימת התפוצה' : 'הקישור לא תקין';
  const text = ok
    ? 'לא נשלח אליך יותר דיוור שיווקי מ-TradeOS. הודעות שירות (למשל אישור Premium) ימשיכו להישלח. אפשר לחזור ולהירשם בכל עת בפרופיל.'
    : 'לא הצלחנו להסיר אותך. אפשר לבטל את הדיוור בכל עת בפרופיל, בהגדרות "עדכונים והטבות במייל".';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f0f0f0;font-family:system-ui,Arial,sans-serif;padding:24px}main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{color:#a0a0b0;line-height:1.7;margin:0 0 20px}a{display:inline-block;padding:10px 20px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>${title}</h1><p>${text}</p><a href="${APP_URL}/">חזרה ל-TradeOS</a></main></body></html>`;
}
