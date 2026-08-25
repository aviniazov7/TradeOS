import { describe, it, expect } from 'vitest';
import {
  roiPct, isEligible, scoreLeaderboard, tierOf,
  withConviction, pnlSplit, fmtUsd, fmtPct, shortWallet,
} from './polymarketScore';

// The smart-money ranking. The whole value of the radar is that an efficient
// winner outranks a high-volume churner — if the blend is wrong the list is
// just a volume leaderboard wearing a different name.

const w = (over = {}) => ({ pnl: 50_000, volume: 100_000, ...over });

describe('roiPct — the luck-versus-skill separator', () => {
  it('is P&L per dollar traded', () => {
    expect(roiPct(w({ pnl: 50_000, volume: 100_000 }))).toBe(50);
    expect(roiPct(w({ pnl: -10_000, volume: 100_000 }))).toBe(-10);
  });
  it('never divides by zero volume', () => {
    expect(roiPct(w({ volume: 0 }))).toBe(0);
  });
});

describe('isEligible — enough skin in the game to be worth ranking', () => {
  it('needs both real volume and a profit', () => {
    expect(isEligible(w({ volume: 10_000, pnl: 1 }))).toBe(true);
    expect(isEligible(w({ volume: 9_999, pnl: 50_000 }))).toBe(false); // lucky one-off
    expect(isEligible(w({ volume: 100_000, pnl: 0 }))).toBe(false);
    expect(isEligible(w({ volume: 100_000, pnl: -1 }))).toBe(false);
  });
});

describe('scoreLeaderboard', () => {
  it('ranks an efficient winner ABOVE a high-volume churner with the same P&L', () => {
    // The core principle of the whole feature.
    const [churner, efficient] = scoreLeaderboard([
      w({ pnl: 50_000, volume: 5_000_000 }),  // 1% ROI
      w({ pnl: 50_000, volume: 100_000 }),    // 50% ROI
    ]);
    expect(efficient.smartScore).toBeGreaterThan(churner.smartScore);
  });

  it('blends size and efficiency half and half', () => {
    const rows = scoreLeaderboard([
      w({ pnl: 100_000, volume: 10_000_000 }), // biggest P&L, worst ROI
      w({ pnl: 10_000, volume: 20_000 }),      // smallest P&L, best ROI
    ]);
    // Each wallet tops exactly one component, so both land mid-scale.
    for (const r of rows) {
      expect(r.smartScore).toBeGreaterThan(30);
      expect(r.smartScore).toBeLessThan(70);
    }
    expect(rows[0].sizeShare).toBeCloseTo(1);
    expect(rows[1].effShare).toBeCloseTo(1);
  });

  it('keeps ineligible wallets visible but unranked', () => {
    const [small] = scoreLeaderboard([w({ volume: 100 }), w()]);
    expect(small.eligible).toBe(false);
    expect(small.smartScore).toBe(null);
    expect(small.roi).toBeDefined(); // still shown, just not scored
  });

  it('does not crash or rank anyone when nothing is eligible', () => {
    const rows = scoreLeaderboard([w({ volume: 10 }), w({ pnl: -5 })]);
    expect(rows.every((r) => r.smartScore === null && r.eligible === false)).toBe(true);
  });

  it('handles a single eligible wallet without dividing by a zero span', () => {
    const [only] = scoreLeaderboard([w()]);
    expect(Number.isFinite(only.smartScore)).toBe(true);
  });

  it('never mutates the rows it was given', () => {
    const input = [w()];
    const before = JSON.stringify(input);
    scoreLeaderboard(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('tierOf', () => {
  it('maps rank to core / extended / discovery', () => {
    expect(tierOf(1)).toBe('core');
    expect(tierOf(1_000)).toBe('core');
    expect(tierOf(1_001)).toBe('extended');
    expect(tierOf(5_000)).toBe('extended');
    expect(tierOf(5_001)).toBe('discovery');
  });
  it('an unranked wallet has no tier', () => {
    expect(tierOf(0)).toBe(null);
    expect(tierOf(null)).toBe(null);
  });
});

describe('withConviction — a position as a share of the live book', () => {
  it('gives each position its share and sorts biggest first', () => {
    const out = withConviction([
      { currentValue: 100 }, { currentValue: 300 },
    ]);
    expect(out[0].currentValue).toBe(300);
    expect(out[0].conviction).toBeCloseTo(0.75);
    expect(out[1].conviction).toBeCloseTo(0.25);
  });
  it('ignores negative values rather than producing a negative share', () => {
    const out = withConviction([{ currentValue: -50 }, { currentValue: 100 }]);
    expect(out.every((p) => p.conviction >= 0)).toBe(true);
  });
  it('an empty book does not divide by zero', () => {
    expect(withConviction([])).toEqual([]);
    expect(withConviction([{ currentValue: 0 }])[0].conviction).toBe(0);
  });
});

describe('pnlSplit — realized versus unrealized carry different risk', () => {
  it('separates the two and totals them', () => {
    const s = pnlSplit([
      { realizedPnl: 100, cashPnl: 150 },  // 100 banked, 50 still open
      { realizedPnl: -20, cashPnl: -20 },  // fully banked loss
    ]);
    expect(s.realized).toBe(80);
    expect(s.unrealized).toBe(50);
    expect(s.total).toBe(130);
  });
  it('treats missing figures as zero', () => {
    expect(pnlSplit([{}])).toEqual({ realized: 0, unrealized: 0, total: 0 });
    expect(pnlSplit([])).toEqual({ realized: 0, unrealized: 0, total: 0 });
  });
});

describe('formatting', () => {
  it('fmtUsd abbreviates and keeps the sign', () => {
    expect(fmtUsd(2_500_000)).toBe('$2.50M');
    expect(fmtUsd(-2_500)).toBe('-$2.5K');
    expect(fmtUsd(42)).toBe('$42');
    expect(fmtUsd(null)).toBe('$0');
  });

  it('fmtPct abbreviates the five-digit ROIs that really occur', () => {
    // A +94,581% wallet is real and overflowed the stat tiles.
    expect(fmtPct(94_581)).toBe('+94.6K%');
    expect(fmtPct(1_500)).toBe('+1500%');
    expect(fmtPct(12.34)).toBe('+12.3%');
    expect(fmtPct(-5)).toBe('-5.0%');
    expect(fmtPct(2_000_000)).toBe('+2.0M%');
  });

  it('shortWallet elides the middle and tolerates nothing', () => {
    expect(shortWallet('0x1234567890abcdef1234')).toBe('0x1234…1234');
    expect(shortWallet('')).toBe('');
    expect(shortWallet(null)).toBe('');
  });
});
