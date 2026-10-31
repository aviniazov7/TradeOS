// CoinGecko proxy. The free demo tier allows roughly 30 calls a minute, and
// every Worker isolate shares one egress IP, so uncached /cg/ requests show
// up as HTTP 429. Fresh JSON lives in caches.default (not KV — the key is
// caller-controlled and KV writes are what exhausted the free quota). Keys
// use a normalized query, so `ids=eth,btc` and `ids=btc,eth` share one entry.
// Identical in-flight URLs share one fetch per isolate. A 429/503 is stored
// as a short-lived 200 marker (the Cache API is reliable for 200s) and the
// last good body is served with a stale marker instead of an error.

export const CG_ALLOWED = /^(coins\/[a-z0-9_-]{1,64}(\/market_chart)?|search|simple\/price|global)$/;

// Polled prices stay fresh enough to trade off of, and still collapse a
// 10s client loop into one upstream call a minute. Markets / charts are
// large and barely change, so they keep a longer TTL — a 60s TTL there
// would burn the same 30 calls/minute budget on icon refreshes.
export const CG_PRICE_TTL_SEC = 60;
const CG_DEFAULT_TTL_SEC = 300;
const CG_MARKETS_TTL_SEC = 3600;
const CG_STALE_TTL_SEC = 86400;

const UPSTREAM = 'https://api.coingecko.com/api/v3/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LIST_PARAMS = new Set(['ids', 'names', 'symbols', 'vs_currencies']);

let backoffUntil = 0;
const inflight = new Map();

export function resetCoinGeckoGate() {
  backoffUntil = 0;
  inflight.clear();
}

/** Stable query string. List params are split, lowercased, and sorted. */
export function normalizeCgSearch(search) {
  const src = new URLSearchParams(typeof search === 'string' ? search : '');
  const grouped = new Map();
  for (const [rawKey, rawValue] of src.entries()) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(rawValue);
  }
  const out = new URLSearchParams();
  for (const key of [...grouped.keys()].sort()) {
    const rawParts = grouped.get(key).flatMap((value) => String(value).split(','));
    const parts = rawParts.map((value) => value.trim()).filter(Boolean);
    if (!parts.length) continue;
    let value;
    if (LIST_PARAMS.has(key)) {
      value = [...new Set(parts.map((part) => part.toLowerCase()))].sort().join(',');
    } else if (key.startsWith('include_')) {
      value = parts.some((part) => /^(1|true|yes)$/i.test(part)) ? 'true' : 'false';
    } else {
      value = parts.join(',');
    }
    if (value) out.set(key, value);
  }
  const serialized = out.toString();
  return serialized ? `?${serialized}` : '';
}

function freshKey(subPath, search) {
  return new Request(`https://cache.tradeos.internal/cg/${subPath}${search}`);
}
function staleKey(subPath, search) {
  return new Request(`https://cache.tradeos.internal/cg-stale/${subPath}${search}`);
}

function ttlFor(subPath) {
  if (subPath === 'simple/price') return CG_PRICE_TTL_SEC;
  if (subPath.startsWith('coins/markets')) return CG_MARKETS_TTL_SEC;
  return CG_DEFAULT_TTL_SEC;
}

function retryAfterSeconds(header, nowMs) {
  if (!header) return 60;
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(300, Math.max(1, Math.ceil(asNumber)));
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.min(300, Math.max(1, Math.ceil((asDate - nowMs) / 1000)));
  }
  return 60;
}

function jsonResponse(body, status, cors, extra = {}) {
  return new Response(body, {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
}

async function readCached(cache, key) {
  if (!cache) return null;
  return (await cache.match(key)) || null;
}

async function safePut(cache, key, response) {
  if (!cache) return;
  try {
    await cache.put(key, response);
  } catch {
    // caches.default rejects a few status codes and oversized bodies. Losing
    // the write must not turn into a 500 or skip the stale body we already
    // have in memory.
  }
}

function negativeMarker(status, waitSec) {
  return new Response(JSON.stringify({ error: status }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${waitSec}`,
      'Retry-After': String(waitSec),
      'X-Cg-Negative': String(status),
    },
  });
}

function markerFrom(hit, body) {
  if (!hit) return '';
  const header = hit.headers.get('X-Cg-Negative');
  if (header) return header;
  if (hit.status === 429 || hit.status === 503) return String(hit.status);
  try {
    const parsed = JSON.parse(body);
    if (parsed && (parsed.error === 429 || parsed.error === 503) && Object.keys(parsed).length === 1) {
      return String(parsed.error);
    }
  } catch { /* a price body is not a marker */ }
  return '';
}

async function stalePayload(cache, key, upstreamStatus) {
  const stale = await readCached(cache, key);
  if (!stale) return null;
  const body = await stale.text();
  if (!body || markerFrom(stale, body)) return null;
  return {
    status: 200,
    body,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',
      'X-Cache': 'STALE',
      'Warning': '110 - "Response is stale"',
      'X-Upstream-Status': String(upstreamStatus),
    },
  };
}

function rateLimited(retry, cacheState) {
  return {
    status: 429,
    body: JSON.stringify({ error: 429 }),
    headers: {
      'Cache-Control': `public, max-age=${retry}`,
      'Retry-After': String(retry),
      'X-Cache': cacheState,
    },
  };
}

/**
 * @param {string} requestUrl absolute URL whose pathname starts with /cg/
 * @param {Record<string, string>} cors headers for this request's origin
 * @param {{ fetchImpl?: typeof fetch, cache?: { match: Function, put: Function }, now?: () => number }} [opts]
 */
export async function handleCoinGecko(requestUrl, cors, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const cache = opts.cache;
  const now = opts.now || Date.now;

  const url = new URL(requestUrl);
  const subPath = url.pathname.startsWith('/cg/') ? url.pathname.slice(4) : '';
  if (!CG_ALLOWED.test(subPath)) {
    return jsonResponse(JSON.stringify({ error: 'forbidden' }), 403, cors);
  }

  const search = normalizeCgSearch(url.search);
  const flightKey = `${subPath}${search}`;
  // Reserve the slot before any await. Otherwise two requests that arrive
  // together both see an empty map, both miss the cache, and both call
  // CoinGecko. The key is the normalized query, so reordered ids coalesce.
  let pending = inflight.get(flightKey);
  if (!pending) {
    pending = resolveCoinGecko(subPath, search, fetchImpl, cache, now)
      .finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, pending);
  }
  const payload = await pending;
  return jsonResponse(payload.body, payload.status, cors, payload.headers);
}

async function resolveCoinGecko(subPath, search, fetchImpl, cache, now) {
  const fresh = freshKey(subPath, search);
  const stale = staleKey(subPath, search);
  const nowMs = now();
  const cached = await readCached(cache, fresh);
  const cachedBody = cached ? await cached.text() : '';
  const negative = markerFrom(cached, cachedBody);

  if (cached && !negative) {
    return {
      status: cached.status || 200,
      body: cachedBody,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': cached.headers.get('Cache-Control') || `public, max-age=${ttlFor(subPath)}`,
        'X-Cache': 'HIT',
      },
    };
  }

  if (negative || nowMs < backoffUntil) {
    const fallback = await stalePayload(cache, stale, negative || '429');
    if (fallback) return fallback;
    const retry = cached?.headers.get('Retry-After')
      || String(Math.max(1, Math.ceil((backoffUntil - nowMs) / 1000) || 60));
    return rateLimited(retry, cached ? 'HIT' : 'BACKOFF');
  }

  return load(subPath, search, fresh, stale, fetchImpl, cache, now);
}

async function load(subPath, search, fresh, stale, fetchImpl, cache, now) {
  const cgUrl = `${UPSTREAM}${subPath}${search}`;
  let res;
  try {
    res = await fetchImpl(cgUrl, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
  } catch {
    const fallback = await stalePayload(cache, stale, 502);
    if (fallback) return fallback;
    return {
      status: 502,
      body: JSON.stringify({ error: 'upstream' }),
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    };
  }

  if (res.status === 429 || res.status === 503) {
    const waitSec = retryAfterSeconds(res.headers.get('retry-after'), now());
    backoffUntil = Math.max(backoffUntil, now() + waitSec * 1000);
    // Read the last good body before the cache write. A rejected put must
    // not skip the stale response.
    const fallback = await stalePayload(cache, stale, res.status);
    await safePut(cache, fresh, negativeMarker(res.status, waitSec));
    if (fallback) return fallback;
    return rateLimited(String(waitSec), 'MISS');
  }

  if (!res.ok) {
    return {
      status: res.status,
      body: JSON.stringify({ error: res.status }),
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    };
  }

  const text = await res.text();
  const ttl = ttlFor(subPath);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${ttl}`,
    'X-Cache': 'MISS',
  };
  const stored = {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': 'HIT' },
  };
  await safePut(cache, fresh, new Response(text, stored));
  await safePut(cache, stale, new Response(text, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CG_STALE_TTL_SEC}` },
  }));
  return { status: 200, body: text, headers };
}
