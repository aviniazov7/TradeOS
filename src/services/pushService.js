import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
// Public VAPID key (safe to expose) — must match the worker's VAPID_PUBLIC_KEY.
const VAPID_PUBLIC_KEY = 'BLFZCOugKM1d2jqTwgmGTF9VjFwQEMNo92l2gfNVk7eBYz1Gnrr0jFBS5jR1bRJ5MchpVkVNiqS8wtzUqouBHRk';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Registration marker ─────────────────────────────────────────────────────
// Remembers which subscription (uid + endpoint + keys) this browser last
// registered and when, so the app-open auto-register (usePushAutoRegister)
// doesn't POST — and the worker doesn't spend a scarce KV write — on every
// single app open. Re-sent at most once a day, or immediately when the
// subscription itself changed (rotated endpoint/keys, different user).
const PUSH_REG_MARKER = 'tradeos_pushreg';
const PUSH_REG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function subscriptionSig(uid, json) {
  return [uid, json?.endpoint || '', json?.keys?.p256dh || '', json?.keys?.auth || ''].join('|');
}
function readRegMarker() {
  try { return JSON.parse(localStorage.getItem(PUSH_REG_MARKER) || 'null'); } catch { return null; }
}
function writeRegMarker(sig) {
  try { localStorage.setItem(PUSH_REG_MARKER, JSON.stringify({ sig, t: Date.now() })); } catch { /* storage unavailable */ }
}
function clearRegMarker() {
  try { localStorage.removeItem(PUSH_REG_MARKER); } catch { /* storage unavailable */ }
}

async function getOrCreateSubscription() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub;
}

async function registerSubscription(sub) {
  const json = sub.toJSON();
  const res = await fetch(`${WORKER_BASE}/push/subscribe`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ subscription: json }),
  });
  if (!res.ok) throw new Error('רישום ההתראות נכשל');
  const uid = getAuth().currentUser?.uid || '';
  writeRegMarker(subscriptionSig(uid, json));
  return true;
}

// Subscribe this browser to push and register the subscription with the worker.
// Explicit user action (settings screens) — always registers.
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('הדפדפן לא תומך בהתראות');
  const sub = await getOrCreateSubscription();
  return registerSubscription(sub);
}

// App-open keep-alive: registers only when this device's subscription changed
// since the last successful registration, or that was over a day ago.
// Returns true when a registration request was actually sent.
export async function ensurePushRegistered() {
  if (!pushSupported()) return false;
  const uid = getAuth().currentUser?.uid;
  if (!uid) return false;
  const sub = await getOrCreateSubscription();
  const sig = subscriptionSig(uid, sub.toJSON());
  const marker = readRegMarker();
  if (marker && marker.sig === sig && Date.now() - (marker.t || 0) < PUSH_REG_MAX_AGE_MS) return false;
  await registerSubscription(sub);
  return true;
}

// Remove this browser's push subscription.
export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  clearRegMarker();
  if (!sub) return;
  try {
    await fetch(`${WORKER_BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch { /* best effort */ }
  await sub.unsubscribe();
}

// Admin-only: schedule the two Premium-expiry reminders for a user. Called
// right after granting Premium with an expiry. Best-effort.
export async function adminScheduleExpiryReminders(uid, planExpires) {
  try {
    await fetch(`${WORKER_BASE}/admin/schedule-expiry`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ uid, planExpires }),
    });
  } catch { /* best-effort */ }
}

// Admin-only: bust the worker's cached premium flag for a user so a fresh
// grant/revoke takes effect immediately instead of after the cache TTL.
// Best-effort: the cache self-heals on its own TTL if this call fails.
export async function adminRefreshPlanCache(uid) {
  try {
    await fetch(`${WORKER_BASE}/admin/refresh-plan`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ uid }),
    });
  } catch { /* best-effort */ }
}

// Admin-only: cancel any pending expiry reminders (used on revoke). Best-effort.
export async function adminCancelExpiryReminders(uid) {
  try {
    await fetch(`${WORKER_BASE}/admin/cancel-expiry`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ uid }),
    });
  } catch { /* best-effort */ }
}

// ── Notification schedule + price alerts (Web Push, uid-keyed, #219) ────────

export async function getNotifySchedule() {
  const res = await fetch(`${WORKER_BASE}/notify-settings`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'טעינת הגדרות ההתראות נכשלה');
  return data.settings;
}

export async function saveNotifySchedule(settings) {
  const res = await fetch(`${WORKER_BASE}/notify-settings`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(settings),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שמירת הגדרות ההתראות נכשלה');
  return data.settings;
}

// Admin-only: permanently delete a user via the worker's service account —
// all Firestore data, leaderboard entry, per-user KV keys AND the Auth
// account (none of which an admin can delete client-side; the rules make
// other users' data read-only for admins).
export async function adminDeleteUser(uid) {
  const res = await fetch(`${WORKER_BASE}/admin/delete-user`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ uid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'מחיקת המשתמש נכשלה');
  return data;
}

// Best-effort audit trail for SELF-service account deletion — must be called
// while the user's ID token is still valid (i.e. before deleteAuthUser).
// Never throws: logging must not block the deletion itself.
export async function logAccountDeletion(info = {}) {
  try {
    await fetch(`${WORKER_BASE}/account/deleted`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify(info),
    });
  } catch { /* best-effort */ }
}

// Admin-only: list recent admin actions (grants/revokes/pushes/coupons).
// Optional kind filter; up to 500 events.
export async function adminListAuditEvents({ kind, limit = 200 } = {}) {
  const qs = new URLSearchParams();
  if (kind) qs.set('kind', kind);
  qs.set('limit', String(limit));
  const res = await fetch(`${WORKER_BASE}/admin/audit?${qs}`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'טעינת היומן נכשלה');
  return data.events || [];
}

// Admin-only: ask the worker to send the weekly digest email to the caller's
// email right now, so you can preview the email without waiting for Sunday.
export async function adminSendTestDigest() {
  const res = await fetch(`${WORKER_BASE}/admin/test-digest`, {
    method: 'POST',
    headers: await authHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שליחת מייל הבדיקה נכשלה');
  return data; // { ok, sentTo, stats }
}

// Admin-only: send a branded payment/gift confirmation email to a user after
// a manual Premium grant (Bit / crypto / bank transfer).
export async function adminSendPaymentEmail({ email, name, kind, amount, method, days, expires }) {
  const res = await fetch(`${WORKER_BASE}/admin/payment-email`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ email, name, kind, amount, method, days, expires }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שליחת המייל נכשלה');
  return data; // { ok, sentTo }
}

// Admin-only: send a custom push notification to a target user via the worker.
export async function adminSendNotification({ uid, title, body, url }) {
  const res = await fetch(`${WORKER_BASE}/admin/notify`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ uid, title, body, url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שליחת ההתראה נכשלה');
  return data; // { ok, sent, total }
}

// Admin-only: send the same push to a list of users (a segment). Returns
// { ok, sent, recipients, targeted }.
export async function adminSendBulkNotification({ uids, title, body, url }) {
  const res = await fetch(`${WORKER_BASE}/admin/notify-bulk`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ uids, title, body, url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'השליחה הקבוצתית נכשלה');
  return data;
}

// Admin-only: a "come back to TradeOS" email to one user or a segment.
// uids: the users to mail. The Worker reads each one's address and marketing
// opt-in from their profile and mails ONLY those who opted in (plus the admin
// themself, for the test button). Returns { ok, sent, failed, deferred,
// targeted, skippedNoConsent, error? }. On a non-2xx response the thrown
// error still carries sent/failed/deferred so the toast can show counts.
export async function adminSendEmailCampaign({ uids, subject, headline, message, ctaText, ctaPath }) {
  const res = await fetch(`${WORKER_BASE}/admin/email-campaign`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ uids, subject, headline, message, ctaText, ctaPath }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'שליחת המיילים נכשלה');
    err.sent = data.sent || 0;
    err.failed = data.failed || 0;
    err.deferred = data.deferred || 0;
    throw err;
  }
  return data;
}

// Admin-only: reminder copy from what's actually moving in the market now.
// Returns { source: 'ai'|'template', title, push, email, cta, path, facts }.
export async function adminGenerateMarketHook() {
  const res = await fetch(`${WORKER_BASE}/admin/ai-hook`, { method: 'POST', headers: await authHeader(), body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'יצירת ההודעה נכשלה');
  return data;
}

// Admin-only: how many Web Push devices a user has registered (count only —
// the worker never returns the subscriptions themselves).
export async function adminGetPushStatus(uid) {
  const res = await fetch(`${WORKER_BASE}/admin/push-status/${uid}`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'טעינת סטטוס ההתראות נכשלה');
  return data; // { ok, devices }
}

// Admin-only: Firebase (Firestore) consumption vs the Spark free-tier limits —
// today's read/write/delete totals (Cloud Monitoring; null + monitoringError
// when the API isn't enabled) plus document counts. Numbers only, cached 5
// minutes on the worker.
export async function adminGetFirebaseUsage() {
  const res = await fetch(`${WORKER_BASE}/admin/firebase-usage`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'טעינת צריכת Firebase נכשלה');
  return data; // { at, monitoring, monitoringError?, counts, limits }
}

// Admin-only: which exchanges a user has connected (ids only — never keys).
export async function adminGetExchangesStatus(uid) {
  const res = await fetch(`${WORKER_BASE}/admin/exchanges-status/${uid}`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'טעינת סטטוס הבורסות נכשלה');
  return data; // { ok, exchanges } — exchange ids only
}

// Register read-only exchange keys with the worker so it can poll the exchange
// in the background (closed-trade + daily-summary push notifications).
export async function registerExchangeForPush(exchange, apiKey, apiSecret, passphrase) {
  if (!exchange || !apiKey || !apiSecret) return false;
  try {
    const res = await fetch(`${WORKER_BASE}/push/exchange-register`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase: passphrase || '' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Remove stored exchange keys (pass no exchange to clear all of them).
export async function unregisterExchangeForPush(exchange) {
  try {
    await fetch(`${WORKER_BASE}/push/exchange-unregister`, {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify(exchange ? { exchange } : {}),
    });
  } catch { /* best effort */ }
}

// Ask the worker to send a real push to all of the user's devices.
// Returns the full diagnostic payload: { sent, total, results, hasVapid }.
export async function sendTestPush() {
  const res = await fetch(`${WORKER_BASE}/push/test`, { method: 'POST', headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שליחת ההתראה נכשלה');
  // eslint-disable-next-line no-console
  console.log('[push/test] result:', data);
  return data;
}
