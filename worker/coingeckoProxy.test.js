import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCoinGecko, resetCoinGeckoGate } from './coingeckoProxy.js';

const cors = { 'Access-Control-Allow-Origin': 'https://tradeos.web.app' };
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
    expect(await duringLimit.json()).toEqual({ bitcoin: { usd: 9 } });
    const again = await handleCoinGecko(URL_OK, cors, { fetchImpl, cache, now: () => 6_000 });
    expect(again.headers.get('X-Cache')).toBe('STALE');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
