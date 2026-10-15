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
});
