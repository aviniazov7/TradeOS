import { describe, expect, it } from 'vitest';
import { computeSetupStats, setupLabel, tradeSetups } from './setupStats';

// entry 100, stop 90, position notional 100 → 1 unit → $10 of risk.
// netPnl 20 is +2R, netPnl -10 is -1R.
const closed = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  entryPrice: 100,
  stopLoss: 90,
  originalStopLoss: 90,
  positionSize: 100,
  quantity: 1,
  netPnl: 20,
  exitPrice: 120,
  ...over,
});

describe('tradeSetups', () => {
  it('treats a missing field as no setups', () => {
    expect(tradeSetups({})).toEqual([]);
    expect(tradeSetups({ setups: null })).toEqual([]);
    expect(tradeSetups({ setups: '  ' })).toEqual([]);
  });

  it('canonicalizes presets, splits a string, and drops duplicates', () => {
    expect(tradeSetups({ setups: 'spring, LPS, Spring' })).toEqual(['Spring', 'LPS']);
    expect(tradeSetups({ setups: ['breakout', 'פריצה שלי', 'breakout'] })).toEqual(['breakout', 'פריצה שלי']);
    expect(setupLabel('breakout')).toBe('פריצה');
    expect(setupLabel('פריצה שלי')).toBe('פריצה שלי');
  });

  it('caps the list', () => {
    const setups = Array.from({ length: 12 }, (_, i) => `s${i}`);
    expect(tradeSetups({ setups })).toHaveLength(8);
  });
});

describe('computeSetupStats', () => {
  it('returns nothing when trades have no setups, including open ones', () => {
    expect(computeSetupStats([
      closed({ setups: [] }),
      closed({ status: 'open', exitPrice: 0, setups: ['LPS'] }),
      { pair: 'BTCUSDT' },
    ])).toEqual([]);
  });

  it('counts a trade in each of its setups and uses net R', () => {
    const stats = computeSetupStats([
      closed({ setups: ['LPS', 'Spring'], netPnl: 20, result: 'win' }),
      closed({ setups: ['LPS'], netPnl: 20, result: 'win' }),
      closed({ setups: ['LPS'], netPnl: -10, result: 'loss' }),
      closed({ setups: ['LPS'], netPnl: -10, result: 'loss' }),
    ]);
    const lps = stats.find((s) => s.name === 'LPS');
    const spring = stats.find((s) => s.name === 'Spring');
    expect(lps).toMatchObject({
      count: 4,
      wins: 2,
      losses: 2,
      winRate: 50,
      pnl: 20,
    });
    expect(lps.avgNetR).toBeCloseTo(0.5);
    expect(lps.expectancy).toBeCloseTo(0.5);
    expect(spring).toMatchObject({ count: 1, wins: 1, winRate: 100, pnl: 20 });
    expect(spring.avgNetR).toBeCloseTo(2);
    expect(stats[0].name).toBe('LPS');
  });

  it('keeps expectancy on decided trades when a breakeven lowers the average', () => {
    const [row] = computeSetupStats([
      closed({ setups: ['LPS'], netPnl: 20, result: 'win' }),
      closed({ setups: ['LPS'], netPnl: 20, result: 'win' }),
      closed({ setups: ['LPS'], netPnl: -10, result: 'loss' }),
      closed({ setups: ['LPS'], netPnl: -10, result: 'loss' }),
      closed({ setups: ['LPS'], netPnl: 0, result: 'breakeven' }),
    ]);
    expect(row.count).toBe(5);
    expect(row.winRate).toBe(50);
    expect(row.avgNetR).toBeCloseTo(0.4);
    expect(row.expectancy).toBeCloseTo(0.5);
    expect(row.pnl).toBe(20);
  });

  it('leaves avg R empty when the trade never had a risk', () => {
    const [row] = computeSetupStats([
      closed({ setups: ['UTAD'], stopLoss: 0, originalStopLoss: 0, positionSize: 0, quantity: 0, netPnl: 15, result: 'win' }),
    ]);
    expect(row.count).toBe(1);
    expect(row.pnl).toBe(15);
    expect(row.avgNetR).toBeNull();
    expect(row.expectancy).toBeNull();
  });
});
