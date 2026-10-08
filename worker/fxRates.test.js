import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseBoiCsv, parseYahooChart, parseRange, handleFxUsdIls } from './fxRates.js';

const BOI_CSV = [
  'SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS',
  'RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2025-01-02,3.65,YP',
  'RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2025-01-03,3.656,YP',
  'RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2025-01-06,garbage,YP',
].join('\n');

// Two BST bars (midnight London = 23:00 UTC the day before) and one GMT bar.
const YAHOO_JSON = {
  chart: {
    result: [{
      meta: { exchangeTimezoneName: 'Europe/London' },
      timestamp: [1743120000, 1743375600, 1743462000],
      indicators: { quote: [{ close: [3.6744, 3.68966, null] }] },
    }],
  },
};

describe('parseBoiCsv', () => {
  it('reads TIME_PERIOD / OBS_VALUE by header and drops bad rows', () => {
    expect(parseBoiCsv(BOI_CSV)).toEqual({ '2025-01-02': 3.65, '2025-01-03': 3.656 });
  });
  it('returns {} for empty or headerless input', () => {
    expect(parseBoiCsv('')).toEqual({});
    expect(parseBoiCsv('a,b\n1,2')).toEqual({});
  });
});

describe('parseYahooChart', () => {
  it('dates bars in the exchange timezone (BST bars are not shifted a day back)', () => {
    expect(parseYahooChart(YAHOO_JSON)).toEqual({ '2025-03-28': 3.6744, '2025-03-31': 3.6897 });
  });
  it('tolerates a malformed payload', () => {
    expect(parseYahooChart({})).toEqual({});
  });
});

describe('parseRange', () => {
  const p = (q) => parseRange(new URLSearchParams(q), new Date('2026-10-08T12:00:00Z'));
  it('accepts a valid range', () => {
    expect(p('from=2024-12-20&to=2025-12-31')).toEqual({ from: '2024-12-20', to: '2025-12-31' });
  });
  it('rejects bad dates, inverted and over-long ranges', () => {
    expect(p('from=2025-02-30&to=2025-03-01').error).toBeTruthy();
    expect(p('from=2025-03-01&to=2025-02-01').error).toBeTruthy();
    expect(p('from=2020-01-01&to=2025-01-01').error).toBeTruthy();
    expect(p('from=1999-01-01&to=1999-02-01').error).toBeTruthy();
  });
});

describe('handleFxUsdIls', () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('caches', {
      default: {
        match: async (req) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
        put: async (req, res) => { store.set(req.url, await res.text()); },
      },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('serves Bank of Israel rates within the range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(BOI_CSV)));
    const res = await handleFxUsdIls(new URL('https://w/fx/usdils?from=2025-01-03&to=2025-01-31'), {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe('boi');
    expect(body.rates).toEqual({ '2025-01-03': 3.656 });
    expect(body.fallback).toEqual([]);
  });

  it('falls back to Yahoo and lists the fallback days', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u) => (
      String(u).includes('boi.org.il') ? new Response('down', { status: 503 }) : new Response(JSON.stringify(YAHOO_JSON))
    )));
    const res = await handleFxUsdIls(new URL('https://w/fx/usdils?from=2025-03-01&to=2025-03-31'), {});
    const body = await res.json();
    expect(body.source).toBe('yahoo');
    expect(body.fallback).toEqual(['2025-03-28', '2025-03-31']);
  });

  it('returns 502 when both sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const res = await handleFxUsdIls(new URL('https://w/fx/usdils?from=2025-03-01&to=2025-03-31'), {});
    expect(res.status).toBe(502);
  });
});
