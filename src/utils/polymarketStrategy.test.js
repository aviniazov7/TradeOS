import { describe, it, expect } from 'vitest';
import {
  STRATEGY_DEFAULTS, daysToClose, matchMarket, runStrategy, describeStrategy,
} from './polymarketStrategy';

// Turns a saved rule-set into a ranked shortlist of live markets. A hard filter
// that leaks, or a NaN score, shows the user a market their own rules excluded.

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

const market = (over = {}) => ({
  conditionId: 'c1',
  question: 'Will BTC close above 100k?',
  prices: [0.4, 0.6],
  outcomes: ['Yes', 'No'],
  liquidity: 50_000,
  volume24hr: 10_000,
  endDate: inDays(30),
  ...over,
});

describe('daysToClose', () => {
  it('rounds up to whole days and goes negative once closed', () => {
    expect(daysToClose(inDays(10))).toBe(10);
    expect(daysToClose(inDays(-5))).toBeLessThan(0);
  });
  it('is null when there is no usable end date', () => {
    expect(daysToClose(null)).toBe(null);
    expect(daysToClose('not a date')).toBe(null);
  });
});

describe('matchMarket — hard filters', () => {
  it('matches a market that satisfies every rule', () => {
    expect(matchMarket(market(), {})).not.toBe(null);
  });

  it('rejects on liquidity, 24h volume, and the closing window', () => {
    expect(matchMarket(market({ liquidity: 100 }), {})).toBe(null);
    expect(matchMarket(market({ volume24hr: 10 }), {})).toBe(null);
    expect(matchMarket(market({ endDate: inDays(500) }), {})).toBe(null);       // too far out
    expect(matchMarket(market({ endDate: inDays(1) }), { minDaysToClose: 7 })).toBe(null);
  });

  it('matches the keyword against the question, case-insensitively', () => {
    expect(matchMarket(market(), { keyword: 'btc' })).not.toBe(null);
    expect(matchMarket(market(), { keyword: 'ethereum' })).toBe(null);
    expect(matchMarket(market(), { keyword: '  ' })).not.toBe(null); // blank = any
  });

  it('requires a price INSIDE the band, not merely nearby', () => {
    expect(matchMarket(market({ prices: [0.97, 0.99] }), {})).toBe(null);
    expect(matchMarket(market({ prices: [0.01, 0.02] }), {})).toBe(null);
  });

  it('picks the highest qualifying outcome and names it', () => {
    const m = matchMarket(market({ prices: [0.4, 0.6], outcomes: ['Yes', 'No'] }), {});
    expect(m.band.price).toBe(0.6);
    expect(m.band.outcome).toBe('No');
  });

  it('honours the smart-money requirement', () => {
    expect(matchMarket(market(), { requireSmartMoney: true }, 0)).toBe(null);
    expect(matchMarket(market(), { requireSmartMoney: true }, 2)).not.toBe(null);
  });
});

describe('matchMarket — malformed input must not throw or score NaN', () => {
  it('rejects a market with no parsed prices', () => {
    expect(matchMarket(market({ prices: [] }), {})).toBe(null);
    expect(matchMarket(market({ prices: null }), {})).toBe(null);
    expect(matchMarket(null, {})).toBe(null);
  });

  it('fills a legacy or hand-edited strategy from the defaults', () => {
    // A strategy doc missing fields must not produce NaN comparisons.
    const m = matchMarket(market(), {});
    expect(Number.isFinite(m.fit)).toBe(true);
    expect(matchMarket(market(), undefined)).not.toBe(null);
  });

  it('scores 0-100 even when the strategy floors are zero', () => {
    // The fit score divides by the floors; zero floors must not yield NaN.
    const m = matchMarket(market(), { minLiquidity: 0, minVolume24h: 0 });
    expect(Number.isFinite(m.fit)).toBe(true);
    expect(m.fit).toBeGreaterThanOrEqual(0);
    expect(m.fit).toBeLessThanOrEqual(100);
  });

  it('a zero maxDaysToClose excludes any dated market, but not an undated one', () => {
    expect(matchMarket(market(), { maxDaysToClose: 0 })).toBe(null);
    const undated = matchMarket(market({ endDate: null }), { maxDaysToClose: 0 });
    expect(undated).not.toBe(null);
    expect(Number.isFinite(undated.fit)).toBe(true);
  });

  it('gives a market with no end date a neutral time score instead of skipping it', () => {
    const m = matchMarket(market({ endDate: null }), {});
    expect(m).not.toBe(null);
    expect(m.daysLeft).toBe(null);
  });

  it('names an outcome by index when the labels are missing', () => {
    expect(matchMarket(market({ outcomes: [] }), {}).band.outcome).toBe('#1');
  });
});

describe('runStrategy', () => {
  it('returns only matches, ranked by fit', () => {
    const out = runStrategy(
      [market({ conditionId: 'a', liquidity: 5_000 }), market({ conditionId: 'b', liquidity: 500_000 }), market({ conditionId: 'c', liquidity: 10 })],
      {}
    );
    expect(out.map((m) => m.market.conditionId)).toEqual(['b', 'a']); // 'c' filtered out
    expect(out[0].fit).toBeGreaterThanOrEqual(out[1].fit);
  });

  it('feeds each market its own smart-wallet count', () => {
    const out = runStrategy([market({ conditionId: 'a' })], {}, { a: 5 });
    expect(out[0].smartCount).toBe(5);
  });

  it('handles a missing market list', () => {
    expect(runStrategy(null, {})).toEqual([]);
    expect(runStrategy(undefined, {})).toEqual([]);
  });
});

describe('describeStrategy', () => {
  it('summarises the band, keyword and liquidity floor', () => {
    const d = describeStrategy({ priceMin: 0.35, priceMax: 0.65, keyword: 'btc', minLiquidity: 5_000 });
    expect(d).toContain('35–65¢');
    expect(d).toContain('"btc"');
    expect(d).toContain('5K');
  });
  it('describes the defaults when given nothing', () => {
    expect(typeof describeStrategy({})).toBe('string');
    expect(describeStrategy({})).toContain(`${Math.round(STRATEGY_DEFAULTS.priceMin * 100)}`);
  });
});
