import { describe, it, expect } from 'vitest';
import {
  computeRSI, computeMA, computeVolatility,
  computeFibonacci, computeSupportResistance, detectCoinFromText,
} from './technicals';

// These numbers are shown to the user on the coin-analysis screen as facts.
// Until now none of them was covered by a test.

// n prices built from a list of consecutive changes, starting at `start`.
const fromChanges = (changes, start = 100) =>
  changes.reduce((acc, c) => [...acc, acc[acc.length - 1] + c], [start]);

describe('computeRSI', () => {
  it('is 100 when nothing fell in the window, 0 when nothing rose', () => {
    expect(computeRSI(fromChanges(Array(14).fill(1)))).toBe(100);
    expect(computeRSI(fromChanges(Array(14).fill(-1), 200))).toBe(0);
  });

  it('is 50 when gains and losses balance', () => {
    const changes = [...Array(7).fill(1), ...Array(7).fill(-1)];
    expect(computeRSI(fromChanges(changes))).toBeCloseTo(50);
  });

  it('twice as much gain as loss gives 66.67', () => {
    // 7 x +2 = 14 gain, 7 x -1 = 7 loss → RS 2 → 100 - 100/3
    const changes = [...Array(7).fill(2), ...Array(7).fill(-1)];
    expect(computeRSI(fromChanges(changes))).toBeCloseTo(66.667, 2);
  });

  it('reads only the LAST `period` changes, ignoring older history', () => {
    const older = Array(20).fill(-5);          // a long decline…
    const recent = Array(14).fill(1);          // …then 14 straight gains
    expect(computeRSI(fromChanges([...older, ...recent], 500))).toBe(100);
  });

  it('returns null rather than a number it cannot support', () => {
    expect(computeRSI([1, 2, 3])).toBe(null);
    expect(computeRSI(fromChanges(Array(13).fill(1)))).toBe(null); // 14 prices, needs 15
  });

  it('uses a SIMPLE average, not Wilder smoothing — documented, not endorsed', () => {
    // Charting platforms smooth RSI (Wilder). This one averages the window
    // directly, so the value can differ from TradingView for the same candles.
    // Pinned so the difference is a known choice rather than a silent surprise.
    const spike = [...Array(13).fill(0.0001), 10];
    const rsi = computeRSI(fromChanges(spike));
    expect(rsi).toBeGreaterThan(99); // a single spike dominates an unsmoothed window
  });
});

describe('computeMA', () => {
  it('averages exactly the last `period` prices', () => {
    expect(computeMA([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(computeMA([100, 100, 100, 1, 3], 2)).toBe(2);
  });
  it('returns null when there is not enough history', () => {
    expect(computeMA([1, 2], 5)).toBe(null);
  });
});

describe('computeVolatility', () => {
  it('is zero for a flat series AND for perfectly constant growth', () => {
    // Volatility is the spread of RETURNS, so a steady +10% every step is 0.
    expect(computeVolatility([100, 100, 100])).toBe(0);
    expect(computeVolatility([100, 110, 121])).toBeCloseTo(0);
  });

  it('measures the spread of returns as a percentage', () => {
    // +10% then -10% → returns [0.1, -0.1], stdev 0.1 → 10
    expect(computeVolatility([100, 110, 99])).toBeCloseTo(10);
  });

  it('skips a zero price instead of producing Infinity', () => {
    expect(computeVolatility([0, 100])).toBe(null);
    expect(Number.isFinite(computeVolatility([0, 100, 110]))).toBe(true);
  });

  it('needs at least two prices', () => {
    expect(computeVolatility([100])).toBe(null);
    expect(computeVolatility([])).toBe(null);
  });
});

describe('computeFibonacci', () => {
  it('anchors on the range high and low and retraces DOWN from the high', () => {
    const f = computeFibonacci([100, 200, 150]);
    expect(f.high).toBe(200);
    expect(f.low).toBe(100);
    expect(f.levels['0.5']).toBe(150);
    expect(f.levels['0.236']).toBeCloseTo(176.4);
    expect(f.levels['0.618']).toBeCloseTo(138.2);
  });
  it('a flat series collapses every level onto the same price', () => {
    const f = computeFibonacci([50, 50]);
    expect(Object.values(f.levels).every((v) => v === 50)).toBe(true);
  });
  it('returns null for no data', () => {
    expect(computeFibonacci([])).toBe(null);
  });
});

describe('computeSupportResistance', () => {
  it('picks the nearest pivot on each side of the current price', () => {
    //            i:  0  1  2  3  4  5  6  7  8
    const prices = [ 1, 2, 5, 2, 1, 2, 0, 2, 1];
    // i=2 is a swing high (5), i=6 is a swing low (0); current price is 1.
    const { support, resistance } = computeSupportResistance(prices);
    expect(support).toBe(0);
    expect(resistance).toBe(5);
  });

  it('reports null on the side with no pivot beyond the current price', () => {
    const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { support, resistance } = computeSupportResistance(rising);
    expect(support).toBe(null);
    expect(resistance).toBe(null);
  });

  it('needs at least five prices', () => {
    expect(computeSupportResistance([1, 2, 3])).toEqual({ support: null, resistance: null });
  });
});

describe('detectCoinFromText', () => {
  it('matches a ticker, an English name and a Hebrew name', () => {
    expect(detectCoinFromText('what about BTC today')).toEqual({ coingeckoId: 'bitcoin', symbol: 'BTC' });
    expect(detectCoinFromText('thoughts on ethereum?')).toEqual({ coingeckoId: 'ethereum', symbol: 'ETH' });
    expect(detectCoinFromText('מה קורה עם ביטקוין')).toEqual({ coingeckoId: 'bitcoin', symbol: 'BTC' });
  });

  it('matches whole words only, so a ticker inside another word does not count', () => {
    expect(detectCoinFromText('subtlety')).toBe(null);       // contains "btl", not "btc"
    expect(detectCoinFromText('linkedin profile')).toBe(null); // "linkedin" is not "link"
  });

  it('handles punctuation around the word', () => {
    expect(detectCoinFromText('sol, please')?.symbol).toBe('SOL');
    expect(detectCoinFromText('is it doge?')?.symbol).toBe('DOGE');
  });

  it('finds a multi-word alias anywhere in the text', () => {
    expect(detectCoinFromText('I hold some binance coin')?.symbol).toBe('BNB');
  });

  it('returns null for empty or unrelated text', () => {
    expect(detectCoinFromText('')).toBe(null);
    expect(detectCoinFromText(null)).toBe(null);
    expect(detectCoinFromText('just talking about the weather')).toBe(null);
  });
});
