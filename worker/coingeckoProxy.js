// CoinGecko proxy. The free tier allows roughly 30 calls a minute, and every
// Worker isolate shares one egress IP, so a burst of uncached /cg/ requests
// (the market page asks for icons, prices, and charts together) comes back
// as HTTP 429. The previous handler forwarded that status and cached nothing,
// so the next request tried CoinGecko again immediately.
//
// Fresh responses live in caches.default (not KV — the key is caller-controlled).
// A 429 or 503 opens a short backoff and, when we already stored a copy, that
// copy is served instead of another upstream call. Identical in-flight URLs
// share one fetch.

export const CG_ALLOWED = /^(coins\/[a-z0-9_-]{1,64}(\/market_chart)?|search|simple\/price|global)$/;

const UPSTREAM = 'https://api.coingecko.com/api/v3/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let backoffUntil = 0;
const inflight = new Map();

export function resetCoinGeckoGate() {
  backoffUntil = 0;
  inflight.clear();
}

function freshKey(subPath, search) {
  return new Request(`https://cache.tradeos.internal/cg/${subPath}${search}`);
}
function staleKey(subPath, search) {
  return new Request(`https://cache.tradeos.internal/cg-stale/${subPath}${search}`);
}

function ttlFor(subPath) {
  return subPath.startsWith('coins/markets') ? 3600 : 300;
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

async function stalePayload(cache, key, cors) {
  const stale = await readCached(cache, key);
  if (!stale) return null;
  return {
    status: 200,
    body: await stale.text(),
    headers: {
      ...cors,
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'X-Cache': 'STALE',
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

  const search = url.search;
  const flightKey = `${subPath}${search}`;
  // Reserve the slot before any await. Otherwise two requests that arrive
  // together both see an empty map, both miss the cache, and both call
  // CoinGecko.
  let pending = inflight.get(flightKey);
  if (!pending) {
    pending = resolveCoinGecko(subPath, search, cors, fetchImpl, cache, now)
      .finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, pending);
  }
  const payload = await pending;
  return jsonResponse(payload.body, payload.status, cors, payload.headers);
}

async function resolveCoinGecko(subPath, search, cors, fetchImpl, cache, now) {
  const fresh = freshKey(subPath, search);
  const stale = staleKey(subPath, search);
  const nowMs = now();

  const hit = await readCached(cache, fresh);
  if (hit && hit.status !== 429 && hit.status !== 503) {
    return {
      status: hit.status || 200,
      body: await hit.text(),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': hit.headers.get('Cache-Control') || `public, max-age=${ttlFor(subPath)}`,
        'X-Cache': 'HIT',
      },
    };
  }

  if (hit?.status === 429 || hit?.status === 503 || nowMs < backoffUntil) {
    const fallback = await stalePayload(cache, stale, cors);
    if (fallback) return fallback;
    const retry = hit?.headers.get('Retry-After')
      || String(Math.max(1, Math.ceil((backoffUntil - nowMs) / 1000) || 60));
    return {
      status: 429,
      body: JSON.stringify({ error: 429 }),
      headers: {
        'Cache-Control': `public, max-age=${retry}`,
        'Retry-After': retry,
        'X-Cache': hit ? 'HIT' : 'BACKOFF',
      },
    };
  }

  return load(subPath, search, fresh, stale, cors, fetchImpl, cache, now);
}

async function load(subPath, search, fresh, stale, cors, fetchImpl, cache, now) {
  const cgUrl = `${UPSTREAM}${subPath}${search}`;
  let res;
  try {
    res = await fetchImpl(cgUrl, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
  } catch {
    const fallback = await stalePayload(cache, stale, cors);
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
    if (cache) {
      await cache.put(fresh, new Response(JSON.stringify({ error: res.status }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${waitSec}`,
          'Retry-After': String(waitSec),
        },
      }));
    }
    const fallback = await stalePayload(cache, stale, cors);
    if (fallback) return fallback;
    return {
      status: 429,
      body: JSON.stringify({ error: res.status }),
      headers: {
        'Cache-Control': `public, max-age=${waitSec}`,
        'Retry-After': String(waitSec),
        'X-Cache': 'MISS',
      },
    };
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
  if (cache) {
    await cache.put(fresh, new Response(text, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': 'HIT' },
    }));
    await cache.put(stale, new Response(text, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    }));
  }
  return { status: 200, body: text, headers };
}
