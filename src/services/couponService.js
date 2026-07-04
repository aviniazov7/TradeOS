import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

// Public share link for a coupon. Routes through the worker so messaging apps
// (WhatsApp/Telegram) get a coupon-specific rich preview; the worker instantly
// redirects a real visitor to the app's /redeem/:code page.
export function couponShareUrl(code) {
  return `${WORKER_BASE}/r/${encodeURIComponent(String(code || '').toUpperCase())}`;
}

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Authenticated user: redeem a coupon code. Worker applies the Premium grant
// as Firebase admin; the live profile subscription in AuthContext then flips
// the UI to Premium within a second.
export async function redeemCoupon(code) {
  const res = await fetch(`${WORKER_BASE}/coupons/redeem`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'מימוש הקופון נכשל');
  return data; // { ok, days, planExpires, label }
}

// Public: fetch a coupon's display info for the share landing page (no auth).
export async function getCouponInfo(code) {
  const res = await fetch(`${WORKER_BASE}/coupons/info/${encodeURIComponent(code)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'הקוד לא נמצא');
    err.notFound = res.status === 404;
    throw err;
  }
  return data; // { code, days, label, valid, reason }
}

// Admin: CRUD on coupon codes.
export async function adminListCoupons() {
  const res = await fetch(`${WORKER_BASE}/admin/coupons`, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'טעינת הקופונים נכשלה');
  return data.coupons || [];
}

export async function adminCreateCoupon({ code, days, maxUses, expiresAt, label }) {
  const res = await fetch(`${WORKER_BASE}/admin/coupons`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ code, days, maxUses, expiresAt, label }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'יצירת הקופון נכשלה');
  return data;
}

export async function adminDeleteCoupon(code) {
  const res = await fetch(`${WORKER_BASE}/admin/coupons/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: await authHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'מחיקת הקופון נכשלה');
  return data;
}
