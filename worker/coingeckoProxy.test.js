import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCoinGecko, resetCoinGeckoGate, normalizeCgSearch, CG_PRICE_TTL_SEC } from './coingeckoProxy.js';

const cors = { 'Access-Control-Allow-Origin': 'https://tradeoslive.web.app' };
const URL_OK = 'https://trade-os.example/cg/simple/price?ids=bitcoin&vs_currencies=usd';

function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const saved = store.get(req.url);
      if (!saved) return undefined;
      return new Response(saved.body, { status: saved.status, headers: saved.headers });
    },
    async put(req, res) {
      store.set(req.url, {
        body: await res.text(),
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
      });
    },
  };
}

describe('handleCoinGecko', () => {
  beforeEach(() => resetCoinGeckoGate());

  it('caches a 200 and does not call CoinGecko again', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"bitcoin":{"usd":1}}', { status: 200 }));
    const cache = memoryCache();
    const first = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 });
    const second = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 2_000 });
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(await second.json()).toEqual({ bitcoin: { usd: 1 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('backs off after 429 and does not call CoinGecko again', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow down', {
      status: 429,
      headers: { 'retry-after': '30' },
    }));
    const cache = memoryCache();
    const first = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 10_000 });
    const second = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 11_000 });
    expect(first.status).toBe(429);
    expect(first.headers.get('Retry-After')).toBe('30');
    expect(second.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shares one upstream call across parallel requests', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response('{"ok":true}', { status: 200 });
    });
    const cache = memoryCache();
    const pending = Promise.all([
      handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 }),
      handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 }),
    ]);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await pending;
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves the stale copy after a 429 once the fresh entry is gone', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"bitcoin":{"usd":9}}', { status: 200 }))
      .mockResolvedValueOnce(new Response('slow', { status: 429, headers: { 'retry-after': '60' } }));
    const cache = memoryCache();
    await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 });
    const freshUrl = [...cache.store.keys()].find((k) => k.includes('/cg/simple/price'));
    cache.store.delete(freshUrl);
    resetCoinGeckoGate();
    const duringLimit = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 5_000 });
    expect(duringLimit.status).toBe(200);
    expect(duringLimit.headers.get('X-Cache')).toBe('STALE');
    expect(duringLimit.headers.get('Warning')).toContain('110');
    expect(duringLimit.headers.get('X-Upstream-Status')).toBe('429');
    expect(await duringLimit.json()).toEqual({ bitcoin: { usd: 9 } });
    // A different isolate has no in-memory backoff. The negative marker
    // (stored as 200 so the Cache API keeps it) must still block upstream.
    resetCoinGeckoGate();
    const again = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 6_000 });
    expect(again.status).toBe(200);
    expect(again.headers.get('X-Cache')).toBe('STALE');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('still serves the last price when storing the 429 marker throws', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"bitcoin":{"usd":8}}', { status: 200 }))
      .mockResolvedValueOnce(new Response('slow', { status: 429, headers: { 'retry-after': '30' } }));
    const cache = memoryCache();
    await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 });
    const freshUrl = [...cache.store.keys()].find((k) => k.includes('/cg/simple/price'));
    cache.store.delete(freshUrl);
    cache.put = async () => { throw new Error('Cache API rejected'); };
    resetCoinGeckoGate();
    const res = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 5_000 });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache')).toBe('STALE');
    expect(await res.json()).toEqual({ bitcoin: { usd: 8 } });
  });

  it('shares one upstream call across reordered simple/price queries', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"bitcoin":{"usd":1},"ethereum":{"usd":2}}', { status: 200 }));
    const cache = memoryCache();
    const a = 'https://trade-os.example/cg/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true';
    const b = 'https://trade-os.example/cg/simple/price?include_24hr_change=TRUE&vs_currencies=USD&ids=bitcoin,ethereum';
    const pending = Promise.all([
      handleCoinGecko(a, cors, { fetchImpl, cache, now: () => 1_000 }),
      handleCoinGecko(b, cors, { fetchImpl, cache, now: () => 1_000 }),
    ]);
    const [first, second] = await pending;
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('ids')).toBe('bitcoin,ethereum');
    const third = await handleCoinGecko(b, cors, { fetchImpl, cache, now: () => 2_000 });
    expect(third.headers.get('X-Cache')).toBe('HIT');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches simple/price briefly and keeps the markets feed longer', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"bitcoin":{"usd":1}}', { status: 200 }));
    const price = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache: memoryCache(), now: () => 1_000 });
    expect(price.headers.get('Cache-Control')).toBe(`public, max-age=${CG_PRICE_TTL_SEC}`);
    expect(CG_PRICE_TTL_SEC).toBeGreaterThanOrEqual(30);
    expect(CG_PRICE_TTL_SEC).toBeLessThanOrEqual(60);
    const markets = await handleCoinGecko(
      'https://trade-os.example/cg/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1',
      cors,
      { fetchImpl: vi.fn(async () => new Response('[]', { status: 200 })), cache: memoryCache(), now: () => 1_000 },
    );
    expect(markets.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('normalizes list params so param order does not change the key', () => {
    expect(normalizeCgSearch('?ids=ETH,btc&vs_currencies=USD'))
      .toBe(normalizeCgSearch('?vs_currencies=usd&ids=btc,eth'));
  });

  it('serves the last price when the network fails after a success', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"bitcoin":{"usd":3}}', { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'));
    const cache = memoryCache();
    await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 1_000 });
    const freshUrl = [...cache.store.keys()].find((k) => k.includes('/cg/simple/price'));
    cache.store.delete(freshUrl);
    resetCoinGeckoGate();
    const res = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 5_000 });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache')).toBe('STALE');
    expect(res.headers.get('X-Upstream-Status')).toBe('502');
    expect(await res.json()).toEqual({ bitcoin: { usd: 3 } });
  });

  it('rejects a path outside the whitelist', async () => {
    const fetchImpl = vi.fn();
    const res = await handleCoinGecko('https://trade-os.example/cg/coins/../../admin', cors, { fetchImpl, cache: memoryCache() });
    expect(res.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 502 when the network fails and nothing is cached', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const res = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache: memoryCache(), now: () => 1_000 });
    expect(res.status).toBe(502);
  });
});
