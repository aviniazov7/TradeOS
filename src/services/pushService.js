import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';
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

// Subscribe this browser to push and register the subscription with the worker.
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('הדפדפן לא תומך בהתראות');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const res = await fetch(`${WORKER_BASE}/push/subscribe`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error('רישום ההתראות נכשל');
  return true;
}

// Remove this browser's push subscription.
export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
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

// Admin-only: a user's Telegram bot link status + usage (from worker KV).
// Returns { connected, username, usage: { total, lastUsed, lastCmd } | null,
// alertsCount, watchlistCount }.
export async function adminGetTelegramInfo(uid) {
  const res = await fetch(`${WORKER_BASE}/admin/telegram/${uid}`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'טעינת נתוני טלגרם נכשלה');
  return data;
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
