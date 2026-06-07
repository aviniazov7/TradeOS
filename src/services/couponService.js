import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

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
