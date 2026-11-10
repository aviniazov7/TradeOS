import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import {
  BYBIT_SPOT_URL,
  quoteFromYahooChart,
  quotesFromBybit,
  resolveCryptoQuotes,
  yahooCryptoUrl,
} from './cryptoQuotes';

const BYBIT = {
  result: {
    list: [
      { symbol: 'BTCUSDT', lastPrice: '70000', price24hPcnt: '0.01' },
      { symbol: 'ETHUSDT', lastPrice: '2000', price24hPcnt: '-0.02' },
    ],
  },
};

function yahoo(price, prev) {
  return { chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev } }] } };
}

describe('crypto quotes', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads Bybit spot rows into the ticker shape', () => {
    expect(quotesFromBybit(BYBIT, ['BTC', 'ETH'])).toEqual({
      BTC: { price: 70000, change24h: 1 },
      ETH: { price: 2000, change24h: -2 },
    });
    expect(quotesFromBybit({ result: { list: [] } }, ['BTC'])).toBeNull();
  });

  it('reads a Yahoo chart candle into the same shape', () => {
    expect(quoteFromYahooChart(yahoo(110, 100))).toEqual({ price: 110, change24h: 10 });
    expect(quoteFromYahooChart({})).toBeNull();
  });

  it('keeps Bybit when it answers', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(BYBIT), { status: 200 }));
    const result = await resolveCryptoQuotes(['BTC'], fetchImpl);
    expect(result.source).toBe('bybit');
    expect(result.quotes.BTC.price).toBe(70000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to Yahoo when Bybit returns 403', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url === BYBIT_SPOT_URL) return new Response('blocked', { status: 403 });
      if (url === yahooCryptoUrl('BTC')) return new Response(JSON.stringify(yahoo(74000, 73000)), { status: 200 });
      throw new Error(`unexpected ${url}`);
    });
    const result = await resolveCryptoQuotes(['BTC'], fetchImpl);
    expect(result).toMatchObject({ source: 'yahoo' });
    expect(result.quotes.BTC.price).toBe(74000);
    expect(JSON.stringify(result)).not.toContain('blocked');
  });

  it('answers GET /cx/quotes with Yahoo and does not forward a 403', async () => {
    const store = new Map();
    vi.stubGlobal('caches', {
      default: {
        async match(request) {
          const body = store.get(request.url);
          return body == null ? undefined : new Response(body);
        },
        async put(request, response) {
          store.set(request.url, await response.text());
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('bybit.com')) return new Response('no', { status: 403 });
      if (String(url).includes('BTC-USD')) return new Response(JSON.stringify(yahoo(74100, 73000)), { status: 200 });
      throw new Error(`unexpected ${url}`);
    }));
    const res = await worker.fetch(new Request('https://trade-os-staging.tradeos.workers.dev/cx/quotes?symbols=BTC'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Quote-Source')).toBe('yahoo');
    const body = await res.json();
    expect(body.BTC.price).toBe(74100);
    expect(body.BTC.change24h).toBeCloseTo(((74100 - 73000) / 73000) * 100, 5);
  });
});
