import { auth } from './firebase';
import { getUserSetting } from './firestoreService';

const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

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
  if (!res.ok || data.error) {
    const err = new Error(data.message || data.error || 'שמירת המפתחות נכשלה');
    if (data.error) err.code = data.error;
    throw err;
  }
  return { readOnly: data.readOnly === true };
}

export async function deleteExchangeCredentials(exchange) {
  await authedFetch('/exchange/credentials/delete', { exchange });
  return true;
}

export async function getConnectedExchanges() {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${WORKER_URL}/exchange/credentials/status`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data.exchanges) ? data.exchanges : [];
  // Hyperliquid has no server-side credentials — it counts as connected when
  // the user saved a wallet address.
  if (!list.includes('hyperliquid') && (await getHyperliquidAddress())) list.push('hyperliquid');
  return list;
}

// ── Hyperliquid (wallet address instead of API keys) ───────────────────────
// Hyperliquid's data is public on-chain, so the only "credential" is the user's
// wallet address. It is NOT secret and is not sent to the credentials store
// (no KV write at all): it lives in the user's own Firestore settings doc,
// users/{uid}/settings/exchanges → hyperliquid.address (owner-only rules),
// written once on connect together with the non-secret "connected" marker the
// other exchanges already keep there. Each sync passes the address to the
// Worker's /hl/* routes, which only read the public Hyperliquid info API.

export const isHyperliquidAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || '').trim());

const hlCache = { uid: null, address: undefined };

/** Remember (or clear, with null) the address after the settings doc was written. */
export function setHyperliquidAddressCache(address) {
  hlCache.uid = auth.currentUser?.uid || null;
  hlCache.address = address || null;
}

export async function getHyperliquidAddress() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  if (hlCache.uid === uid && hlCache.address !== undefined) return hlCache.address;
  try {
    const conf = (await getUserSetting(uid, 'exchanges'))?.hyperliquid;
    const address = conf?.connected && isHyperliquidAddress(conf.address) ? conf.address.trim().toLowerCase() : null;
    hlCache.uid = uid;
    hlCache.address = address;
    return address;
  } catch { return null; }
}

async function hlGet(path, params) {
  const address = await getHyperliquidAddress();
  if (!address) throw new Error('חבר מחדש את Hyperliquid — כתובת הארנק חסרה');
  const qs = new URLSearchParams({ address, ...params }).toString();
  const res = await authedFetch(`${path}?${qs}`, undefined, 'GET');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.message || data.error || 'שגיאת Hyperliquid');
  return data;
}

// ── Read-only data calls (no secrets in the request) ────────────────────────

// An Error that also carries the Worker's API-key diagnosis
// (key_expired / key_invalid / ip_blocked / no_permission), when there is one.
function exchangeError(message, reason) {
  const err = new Error(message);
  if (reason) err.reason = reason;
  return err;
}

// What to tell the user for each API-key problem.
export const KEY_PROBLEM_TEXT = {
  key_expired: 'מפתח ה-API פג תוקף',
  key_invalid: 'מפתח ה-API לא תקין או נמחק בבורסה',
  ip_blocked: 'הבורסה חוסמת את החיבור בגלל הגבלת IP על המפתח',
  no_permission: 'למפתח חסרות הרשאות קריאה',
};

export async function syncExchangeTrades(exchange, { limit = 50, days = 0, debug = false } = {}) {
  if (exchange === 'hyperliquid') {
    const since = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
    return (await hlGet('/hl/trades', { limit: String(limit), ...(since ? { since: String(since) } : {}) })).trades || [];
  }
  const res = await authedFetch('/exchange/sync', { exchange, limit, days, debug });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw exchangeError(data.reason ? KEY_PROBLEM_TEXT[data.reason] : (data.error || 'הסנכרון נכשל'), data.reason);
  }
  if (data._raw) {
    // eslint-disable-next-line no-console
    console.log(`[sync raw] ${exchange} — raw upstream rows:`, data._raw);
  }
  return data.trades || [];
}

export async function syncOpenPositions(exchange) {
  if (exchange === 'hyperliquid') return (await hlGet('/hl/positions', {})).positions || [];
  const res = await authedFetch('/exchange/open-positions', { exchange });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאה בטעינת הפוזיציות הפתוחות');
  return data.positions || [];
}

// Resting orders (limit / TP / SL / trigger / trailing) in the Worker's
// normalized shape (worker/openOrders.js). `partial` = one of the venue's
// secondary order lists (algo / plan / stop orders) couldn't be read.
export async function fetchOpenOrders(exchange) {
  let qs = `exchange=${encodeURIComponent(exchange)}`;
  if (exchange === 'hyperliquid') {
    const address = await getHyperliquidAddress();
    if (!address) throw new Error('חבר מחדש את Hyperliquid — כתובת הארנק חסרה');
    qs += `&address=${address}`;
  }
  const res = await authedFetch(`/exchange/open-orders?${qs}`, undefined, 'GET');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const msg = data.reason ? KEY_PROBLEM_TEXT[data.reason]
      : data.error === 'reconnect_required' ? 'צריך לחבר מחדש את הבורסה'
        : (data.error || 'שגיאה בטעינת הפקודות הפתוחות');
    throw exchangeError(msg, data.reason);
  }
  return { orders: data.orders || [], partial: !!data.partial };
}

/**
 * Everything the trading terminal shows for one venue, in one go:
 * { positions, orders, ordersPartial, positionsError, ordersError }.
 * Hyperliquid answers both from one call (/hl/positions returns its open
 * orders too). Throws only when nothing could be read.
 */
export async function fetchTerminalSnapshot(exchange) {
  if (exchange === 'hyperliquid') {
    const data = await hlGet('/hl/positions', {});
    return { positions: data.positions || [], orders: data.orders || [], ordersPartial: false, positionsError: null, ordersError: null };
  }
  const [pos, ord] = await Promise.allSettled([syncOpenPositions(exchange), fetchOpenOrders(exchange)]);
  if (pos.status === 'rejected' && ord.status === 'rejected') throw pos.reason;
  return {
    positions: pos.status === 'fulfilled' ? pos.value : [],
    orders: ord.status === 'fulfilled' ? ord.value.orders : [],
    ordersPartial: ord.status === 'fulfilled' ? ord.value.partial : false,
    positionsError: pos.status === 'rejected' ? (pos.reason?.message || 'שגיאה') : null,
    ordersError: ord.status === 'rejected' ? (ord.reason?.message || 'שגיאה') : null,
  };
}

export async function fetchExchangeBalance(exchange) {
  if (exchange === 'hyperliquid') {
    const data = await hlGet('/hl/positions', {});
    return { balance: data.accountValue || 0, currency: 'USD' };
  }
  const res = await authedFetch('/exchange/balance', { exchange });
  const data = await res.json();
  if (!data.ok) throw exchangeError(data.error || 'שגיאה בטעינת היתרה', data.reason);
  return { balance: data.balance || 0, currency: data.currency || 'USD' };
}

// ── Price candles (MAE/MFE) ─────────────────────────────────────────────────
// OHLC between two instants from the Worker's /candles route (Bybit for crypto,
// Yahoo for stocks/futures; edge-cached, the interval is chosen server-side).
// → { symbol, source, interval (minutes), candles: [{ t, o, h, l, c }] }
export async function fetchCandles({ symbol, asset = 'crypto', from, to }) {
  const qs = new URLSearchParams({ symbol, asset, from: String(Math.floor(from)), to: String(Math.floor(to)) });
  const res = await authedFetch(`/candles?${qs}`, undefined, 'GET');
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('אין נתוני מחיר זמינים לנכס ולטווח הזה');
  if (!res.ok || data.error) throw new Error(data.error || 'טעינת נתוני המחיר נכשלה');
  return data;
}
