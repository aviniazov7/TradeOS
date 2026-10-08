import { describe, it, expect } from 'vitest';
import {
  pickInterval, parseCandlesQuery, bybitCandidates, futuresTicker, bybitToCandles, yahooToCandles,
  handleCandlesRoute, MAX_CANDLES,
} from './candles';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const H = 3600 * 1000;
const D = 24 * H;
const qs = (o) => new URLSearchParams(o);

// Shapes below are real responses (captured 2026-10-08) trimmed to 2 bars.
const BYBIT_REAL = {
  retCode: 0, retMsg: 'OK',
  result: {
    symbol: 'BTCUSDT', category: 'linear',
    list: [
      ['1790017200000', '86034.8', '86887.9', '85950', '86456.7', '7063.501', '610453905.3425'],
      ['1790013600000', '85852.1', '86043.4', '85762.4', '86034.8', '2044.113', '175659713.0503'],
    ],
  },
};
const YAHOO_REAL = {
  meta: { currency: 'USD', symbol: 'ES=F' },
  timestamp: [1789999200, 1790002800, 1790006400],
  indicators: { quote: [{ open: [7000, null, 7002], high: [7005, null, 7010], low: [6995, null, 7001], close: [7003, null, 7008], volume: [1, null, 3] }] },
};

describe('pickInterval', () => {
  it('uses 1-minute candles for short windows and never exceeds the cap', () => {
    expect(pickInterval(NOW - 2 * H, NOW, 'bybit', NOW)[0]).toBe(1);
    for (const days of [1, 5, 20, 60, 400, 1500]) {
      const [m] = pickInterval(NOW - days * D, NOW, 'bybit', NOW);
      const step = m * 60000;
      expect(Math.floor(NOW / step) - Math.floor((NOW - days * D) / step) + 1).toBeLessThanOrEqual(MAX_CANDLES);
    }
  });
  it('respects Yahoo intraday history limits', () => {
    // 1m only for the last ~30 days, 2-30m for ~60, 60m for ~2 years.
    expect(pickInterval(NOW - 70 * D, NOW - 70 * D + 3 * H, 'yahoo', NOW)[0]).toBe(60);
    expect(pickInterval(NOW - 800 * D, NOW - 800 * D + 3 * H, 'yahoo', NOW)[0]).toBe(1440);
  });
});

describe('parseCandlesQuery', () => {
  const ok = { symbol: 'btcusdt', asset: 'crypto', from: NOW - D, to: NOW - H };
  it('accepts and normalizes', () => {
    expect(parseCandlesQuery(qs(ok), NOW)).toEqual({ symbol: 'BTCUSDT', asset: 'crypto', from: NOW - D, to: NOW - H });
  });
  it('rejects bad input', () => {
    expect(parseCandlesQuery(qs({ ...ok, asset: 'forex' }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, symbol: 'BTC$$' }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, symbol: '' }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, from: 'abc' }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, to: ok.from - 1 }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, from: NOW - 10 * 365 * D }), NOW).error).toBeTruthy();
    expect(parseCandlesQuery(qs({ ...ok, from: NOW + D, to: NOW + 2 * D }), NOW).error).toBeTruthy();
  });
  it('clamps `to` to now', () => {
    expect(parseCandlesQuery(qs({ ...ok, to: NOW + D }), NOW).to).toBe(NOW);
  });
});

describe('symbol mapping', () => {
  it('bybit candidates', () => {
    expect(bybitCandidates('BTCUSDT')).toEqual([{ category: 'linear', symbol: 'BTCUSDT' }, { category: 'spot', symbol: 'BTCUSDT' }]);
    expect(bybitCandidates('eth/usdt')[0].symbol).toBe('ETHUSDT');
    expect(bybitCandidates('KPEPEUSDT').map((c) => c.symbol)).toContain('1000PEPEUSDT');
  });
  it('futures tickers', () => {
    expect(futuresTicker('ES')).toBe('ES=F');
    expect(futuresTicker('NQZ5')).toBe('NQ=F');
    expect(futuresTicker('es1!')).toBe('ES=F');
    expect(futuresTicker('FOO')).toBeNull();
  });
});

describe('upstream parsing', () => {
  it('bybit: newest-first strings → ascending numbers', () => {
    const c = bybitToCandles(BYBIT_REAL.result.list);
    expect(c.map((x) => x.t)).toEqual([1790013600000, 1790017200000]);
    expect(c[1]).toEqual({ t: 1790017200000, o: 86034.8, h: 86887.9, l: 85950, c: 86456.7 });
  });
  it('yahoo: drops null bars, seconds → ms', () => {
    const c = yahooToCandles(YAHOO_REAL);
    expect(c).toEqual([
      { t: 1789999200000, o: 7000, h: 7005, l: 6995, c: 7003 },
      { t: 1790006400000, o: 7002, h: 7010, l: 7001, c: 7008 },
    ]);
  });
  it('yahoo: Tel Aviv agorot → shekels', () => {
    const c = yahooToCandles({ meta: { currency: 'ILA' }, timestamp: [1], indicators: { quote: [{ open: [1000], high: [1100], low: [900], close: [1050] }] } });
    expect(c[0]).toEqual({ t: 1000, o: 10, h: 11, l: 9, c: 10.5 });
  });
});

describe('handleCandlesRoute', () => {
  const memCache = () => {
    const m = new Map();
    return {
      m,
      match: async (r) => { const v = m.get(r.url); return v ? new Response(v.body, v.init) : undefined; },
      put: async (r, res) => { m.set(r.url, { body: await res.text(), init: { headers: Object.fromEntries(res.headers) } }); },
    };
  };
  const call = (params, opts) => {
    const url = new URL(`https://w.example/candles?${new URLSearchParams(params)}`);
    return handleCandlesRoute(new Request(url), url, {}, { now: NOW, ...opts });
  };
  const base = { symbol: 'BTCUSDT', asset: 'crypto', from: NOW - 3 * D, to: NOW - 2 * D };

  it('serves crypto from Bybit and caches an immutable window', async () => {
    const urls = [];
    const fetchImpl = async (u) => { urls.push(u); return new Response(JSON.stringify(BYBIT_REAL)); };
    const cache = memCache();
    const res = await call(base, { fetchImpl, cache });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ symbol: 'BTCUSDT', source: 'bybit', interval: 3 });
    expect(j.candles).toHaveLength(2);
    expect(urls[0]).toMatch(/category=linear&symbol=BTCUSDT&interval=3&start=\d+&end=\d+&limit=1000/);
    // second identical call: no upstream, 7-day cache entry
    const res2 = await call(base, { fetchImpl: async () => { throw new Error('should not fetch'); }, cache });
    expect(res2.headers.get('X-Cache')).toBe('HIT');
    expect([...cache.m.values()][0].init.headers['cache-control']).toContain('604800');
  });

  it('falls through unknown linear symbol to spot, then 404s', async () => {
    const seen = [];
    const fetchImpl = async (u) => {
      seen.push(u.match(/category=(\w+)/)[1]);
      return new Response(JSON.stringify({ retCode: 10001, retMsg: 'params error: Symbol Is Invalid', result: {} }));
    };
    const res = await call(base, { fetchImpl, cache: null });
    expect(res.status).toBe(404);
    expect(seen).toEqual(['linear', 'spot']);
  });

  it('serves futures from Yahoo via the continuous-contract ticker', async () => {
    let called;
    const fetchImpl = async (u) => { called = u; return new Response(JSON.stringify({ chart: { result: [YAHOO_REAL] } })); };
    const res = await call({ symbol: 'ES', asset: 'futures', from: 1789999200000, to: 1790006400000 }, { fetchImpl, cache: null, now: 1790010000000 });
    const j = await res.json();
    expect(called).toContain('/chart/ES%3DF?interval=1m');
    expect(res.status).toBe(200);
    expect(j.source).toBe('yahoo');
    expect(j.candles.length).toBe(2);
  });

  it('400s on invalid input without touching upstream', async () => {
    const fetchImpl = async () => { throw new Error('no'); };
    expect((await call({ ...base, symbol: 'x y' }, { fetchImpl })).status).toBe(400);
    expect((await call({ ...base, asset: 'futures', symbol: 'ZZZ' }, { fetchImpl })).status).toBe(400);
  });
});
