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

// Ask the worker to send a real push to all of the user's devices.
export async function sendTestPush() {
  const res = await fetch(`${WORKER_BASE}/push/test`, { method: 'POST', headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שליחת ההתראה נכשלה');
  return data.sent || 0;
}
