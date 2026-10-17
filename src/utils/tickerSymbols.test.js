import { describe, expect, it } from 'vitest';
import { TICKER_CRYPTO_FALLBACK, pickTopCrypto } from './tickerSymbols';

describe('pickTopCrypto', () => {
  it('keeps the largest non-stable coins and drops wrapped receipts', () => {
    const rows = [
      { symbol: 'btc', market_cap: 100 },
      { symbol: 'usdt', market_cap: 90 },
      { symbol: 'eth', market_cap: 80 },
      { symbol: 'wbtc', market_cap: 70 },
      { symbol: 'figr_heloc', market_cap: 60 },
      { symbol: 'pepe', market_cap: 1 },
      { symbol: 'near', market_cap: 40 },
    ];
    expect(pickTopCrypto(rows, 3)).toEqual(['BTC', 'ETH', 'NEAR']);
  });

  it('ignores rows without a market cap', () => {
    expect(pickTopCrypto([{ symbol: 'btc' }, { symbol: 'eth', market_cap: 2 }], 5)).toEqual(['ETH']);
  });
});

describe('TICKER_CRYPTO_FALLBACK', () => {
  it('starts from the majors and leaves out the small names', () => {
    expect(TICKER_CRYPTO_FALLBACK[0]).toBe('BTC');
    expect(TICKER_CRYPTO_FALLBACK.length).toBeLessThanOrEqual(15);
    for (const symbol of ['PEPE', 'WIF', 'NEAR', 'ATOM', 'ARB', 'UNI', 'DOT', 'MOODENG', 'USDT']) {
      expect(TICKER_CRYPTO_FALLBACK).not.toContain(symbol);
    }
  });
});
