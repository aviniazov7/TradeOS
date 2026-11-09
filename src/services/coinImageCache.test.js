import { describe, expect, it } from 'vitest';
import { cacheImage, getCachedImage } from './coinImageCache';
import { tickerCoinUrls } from '../utils/tickerMarks';

describe('SOL icon cache', () => {
  it('serves the official file even when CoinGecko is cached', () => {
    const official = '/logos/coins/sol-15954313.png';
    expect(tickerCoinUrls('SOL')).toEqual([official]);
    expect(getCachedImage('SOL')).toBe(official);
    expect(getCachedImage('SOL/USDT')).toBe(official);
    cacheImage('SOL', 'https://assets.coingecko.com/coins/images/4128/small/solana.png');
    expect(getCachedImage('SOL')).toBe(official);
    expect(getCachedImage('solusdt')).toBe(official);
  });

  it('uses the gold mark, a silver coin, flags, and the US flag for CFD symbols in the trade table', () => {
    const gold = '/logos/marks/gold.svg';
    expect(getCachedImage('XAUUSD')).toBe(gold);
    expect(getCachedImage('xau/usd')).toBe(gold);
    expect(getCachedImage('XAUUSD.R')).toBe(gold);
    expect(getCachedImage('XAU')).toBe(gold);
    expect(getCachedImage('XAUUSDT')).toBe(gold);
    expect(getCachedImage('GC')).toBe(gold);
    expect(getCachedImage('MGC')).toBe(gold);
    cacheImage('XAUUSD', 'https://cdn.example/fake-gold.png');
    expect(getCachedImage('XAUUSD')).toBe(gold);
    expect(getCachedImage('XAGUSD')).toBe('/logos/symbols/silver-coin.svg');
    expect(getCachedImage('SI')).toBe('/logos/marks/silver.svg');
    expect(getCachedImage('EURUSD')).toBe('/logos/symbols/eurusd.svg');
    expect(getCachedImage('eur/usd')).toBe('/logos/symbols/eurusd.svg');
    expect(getCachedImage('GBPUSD')).toBe('/logos/symbols/gbpusd.svg');
    expect(getCachedImage('USDJPY')).toBe('/logos/symbols/usdjpy.svg');
    expect(getCachedImage('AUDUSD')).toBe('/logos/symbols/audusd.svg');
    expect(getCachedImage('USDCAD')).toBe('/logos/symbols/usdcad.svg');
    expect(getCachedImage('USDCHF')).toBe('/logos/symbols/usdchf.svg');
    expect(getCachedImage('NZDUSD')).toBe('/logos/symbols/nzdusd.svg');
    expect(getCachedImage('NAS100')).toBe('/logos/symbols/us-flag.svg');
    expect(getCachedImage('US100')).toBe('/logos/symbols/us-flag.svg');
    expect(getCachedImage('US500')).toBe('/logos/symbols/us-flag.svg');
    expect(getCachedImage('US30')).toBe('/logos/symbols/us-flag.svg');
    expect(getCachedImage('NQ')).toBe('/logos/marks/nasdaq.svg');
    // A cached remote URL must not replace the bundled file.
    cacheImage('EURUSD', 'https://cdn.example/eu.png');
    expect(getCachedImage('EURUSD')).toBe('/logos/symbols/eurusd.svg');
    // Free-text symbols stay unresolved so the letter badge can stay neutral.
    expect(getCachedImage('EURUSD.R')).toBeNull();
    expect(getCachedImage('MYBOOK')).toBeNull();
  });
});
