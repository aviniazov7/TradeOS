import { describe, it, expect, vi, afterEach } from 'vitest';
import { fromPaprika, fetchGlobalMarket } from './globalMarket';

const paprika = { market_cap_usd: 2.9e12, volume_24h_usd: 2.1e11, market_cap_change_24h: -1.2, bitcoin_dominance_percentage: 56.8 };
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: status }) });

afterEach(() => vi.unstubAllGlobals());

describe('fromPaprika', () => {
  it('maps to the shape the home card reads', () => {
    expect(fromPaprika(paprika)).toEqual({
      total_market_cap: { usd: 2.9e12 },
      total_volume: { usd: 2.1e11 },
      market_cap_change_percentage_24h_usd: -1.2,
      market_cap_percentage: { btc: 56.8 },
      active_cryptocurrencies: null,
    });
  });
  it('rejects empty / zero payloads', () => {
    expect(fromPaprika(null)).toBeNull();
    expect(fromPaprika({ market_cap_usd: 0 })).toBeNull();
  });
});

describe('fetchGlobalMarket', () => {
  it('uses CoinPaprika first', async () => {
    const f = vi.fn(() => ok(paprika));
    vi.stubGlobal('fetch', f);
    const m = await fetchGlobalMarket();
    expect(m.total_market_cap.usd).toBe(2.9e12);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('falls back to the CoinGecko proxy when CoinPaprika fails', async () => {
    const cg = { data: { total_market_cap: { usd: 3e12 }, total_volume: { usd: 1e11 } } };
    vi.stubGlobal('fetch', vi.fn((url) => (String(url).includes('coinpaprika') ? fail(500) : ok(cg))));
    expect((await fetchGlobalMarket()).total_market_cap.usd).toBe(3e12);
  });

  it('survives CoinGecko 429 as long as CoinPaprika answers', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (String(url).includes('coinpaprika') ? ok(paprika) : fail(429))));
    expect((await fetchGlobalMarket()).total_market_cap.usd).toBe(2.9e12);
  });

  it('rejects when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(429)));
    await expect(fetchGlobalMarket()).rejects.toThrow(/unavailable/);
  });

  it('propagates an abort instead of trying the next source', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const f = vi.fn(() => Promise.reject(abort));
    vi.stubGlobal('fetch', f);
    await expect(fetchGlobalMarket()).rejects.toMatchObject({ name: 'AbortError' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
