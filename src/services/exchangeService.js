import { auth } from './firebase';

const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || 'https://trade-os.aviniazov7.workers.dev';

async function authedFetch(path, body, method = 'POST') {
  const token = await auth.currentUser?.getIdToken();
  return fetch(`${WORKER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ── Credentials ────────────────────────────────────────────────────────────
// Exchange API keys/secrets live ONLY server-side (encrypted at rest). The
// secret is sent here exactly once on connect and never returned to or re-sent
// from the browser afterwards — sync/balance/position calls send just the
// exchange name and the Worker looks up the stored, decrypted credentials.

export async function storeExchangeCredentials(exchange, { apiKey, apiSecret, passphrase } = {}) {
  const res = await authedFetch('/exchange/credentials/store', {
    exchange, apiKey, apiSecret, passphrase: passphrase || '',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'שמירת המפתחות נכשלה');
  return true;
}

export async function deleteExchangeCredentials(exchange) {
  await authedFetch('/exchange/credentials/delete', { exchange });
  return true;
}

export async function getConnectedExchanges() {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${WORKER_URL}/exchange/credentials/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.exchanges) ? data.exchanges : [];
}

// ── Read-only data calls (no secrets in the request) ────────────────────────

export async function syncExchangeTrades(exchange, { limit = 50, days = 0, debug = false } = {}) {
  const res = await authedFetch('/exchange/sync', { exchange, limit, days, debug });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'הסנכרון נכשל');
  if (data._raw) {
    // eslint-disable-next-line no-console
    console.log(`[sync raw] ${exchange} — raw upstream rows:`, data._raw);
  }
  return data.trades || [];
}

export async function syncOpenPositions(exchange) {
  const res = await authedFetch('/exchange/open-positions', { exchange });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאה בטעינת הפוזיציות הפתוחות');
  return data.positions || [];
}

export async function fetchExchangeBalance(exchange) {
  const res = await authedFetch('/exchange/balance', { exchange });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאה בטעינת היתרה');
  return { balance: data.balance || 0, currency: data.currency || 'USD' };
}
