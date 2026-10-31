import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPrices, fetchSimplePrices, resetSimplePriceCache, SIMPLE_PRICE_TTL_MS } from './coingeckoApi';

function priceResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => {
  resetSimplePriceCache();
  vi.unstubAllGlobals();
});

describe('fetchSimplePrices', () => {
  it('batches same-turn callers into one sorted request', async () => {
    const fetchImpl = vi.fn(async () => priceResponse({
      bitcoin: { usd: 1, usd_24h_change: 0.5 },
      ethereum: { usd: 2, usd_24h_change: -1 },
    }));
    const [a, b] = await Promise.all([
      fetchSimplePrices(['ethereum'], { fetchImpl, now: () => 1_000 }),
      fetchSimplePrices(['Bitcoin'], { fetchImpl, now: () => 1_000 }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('ids')).toBe('bitcoin,ethereum');
    expect(a.ethereum.usd).toBe(2);
    expect(b.bitcoin.usd).toBe(1);
  });

  it('joins an in-flight request instead of starting another', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return priceResponse({ bitcoin: { usd: 4, usd_24h_change: 0 }, ethereum: { usd: 5, usd_24h_change: 0 } });
    });
    const first = fetchSimplePrices(['bitcoin', 'ethereum'], { fetchImpl, now: () => 1_000 });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const second = fetchSimplePrices(['ethereum'], { fetchImpl, now: () => 1_500 });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.bitcoin.usd).toBe(4);
    expect(b.ethereum.usd).toBe(5);
  });

  it('does not call again until the per-id ttl expires', async () => {
    const fetchImpl = vi.fn(async () => priceResponse({ bitcoin: { usd: 7, usd_24h_change: 1 } }));
    await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => 5_000 });
    const cached = await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => 5_000 + SIMPLE_PRICE_TTL_MS });
    expect(cached.bitcoin.usd).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => 5_000 + SIMPLE_PRICE_TTL_MS + 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns the last price on 429 and does not retry during backoff', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(priceResponse({ bitcoin: { usd: 9, usd_24h_change: 1 } }))
      .mockResolvedValueOnce(new Response('slow', { status: 429, headers: { 'retry-after': '30' } }));
    await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => 0 });
    const during = await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => SIMPLE_PRICE_TTL_MS + 1 });
    expect(during.bitcoin.usd).toBe(9);
    const again = await fetchSimplePrices(['bitcoin'], { fetchImpl, now: () => SIMPLE_PRICE_TTL_MS + 2 });
    expect(again.bitcoin.usd).toBe(9);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('fetchPrices simple/price throttle', () => {
  it('shares one simple/price call across repeated gold polls', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/simple/price')) {
        return priceResponse({ 'pax-gold': { usd: 2400, usd_24h_change: 0.2 } });
      }
      return new Response('no', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const coins = [{ symbol: 'XAU', coingeckoId: 'pax-gold' }];
    const first = await fetchPrices(coins);
    const second = await fetchPrices(coins);
    const priceCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes('/simple/price'));
    expect(priceCalls).toHaveLength(1);
    expect(first['pax-gold'].usd).toBe(2400);
    expect(second['pax-gold'].usd).toBe(2400);
  });
});
