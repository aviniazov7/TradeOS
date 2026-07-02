import { getAuth } from 'firebase/auth';

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) throw new Error('לא מחובר');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ============================================================================
// SINGLE INTEGRATION POINT FOR THE PAYMENT PROVIDER (Grow / Meshulam).
//
// Everything else (Premium page, Checkout page, plan gating) is already built.
// When you're ready to go live, this is the ONLY function that needs real code:
//
//   1. Add a worker endpoint POST /pay/checkout that, using the Grow API key
//      (stored as a worker secret GROW_API_KEY), creates a payment process and
//      returns its hosted-payment-page URL.
//   2. Have that endpoint set the user's plan to 'premium' via a Grow webhook
//      (POST /pay/webhook) once payment succeeds.
//   3. Flip PAYMENTS_ENABLED to true.
//
// Until then this returns { enabled: false } so the Checkout page shows a
// "coming soon" state instead of a broken payment.
// ============================================================================
export const PAYMENTS_ENABLED = false;

// Until card checkout is live, a purchase attempt still shouldn't be lost:
// record the buyer's intent by messaging the developer (same /contact channel
// as support), so you can reach out and arrange manual payment + a coupon.
export async function requestPurchaseInquiry(note) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('יש להתחבר');
  const token = await user.getIdToken();
  const res = await fetch(`${WORKER_BASE}/contact`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: note, displayName: user.displayName || null }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'שליחת הבקשה נכשלה');
  }
  return true;
}

export async function startCheckout(cycle = 'monthly') {
  if (!PAYMENTS_ENABLED) {
    return { enabled: false };
  }
  // Live path (wired later):
  const res = await fetch(`${WORKER_BASE}/pay/checkout`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ cycle }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'פתיחת התשלום נכשלה');
  return { enabled: true, url: data.url };
}
