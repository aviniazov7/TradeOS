import { describe, expect, it } from 'vitest';
import { declaredStartCapital, summarizeSeries, tradingReturnPercent } from './portfolioPerformance';

// $393.58 on a ~$2,589.34 opening balance is −84.8% if the whole gap is a loss.
const WALLET = 393.58;
const OPENING = 2589.34;
const WALLET_GAP_PERCENT = ((WALLET - OPENING) / OPENING) * 100;

function point(pnl, t) {
  return { t, pnl, value: pnl };
}

describe('home portfolio return', () => {
  it('does not count a withdrawal as trading performance', () => {
    // Opened at $2,589.34, withdrew down to $393.58, and lost $20 trading.
    // (393.58 − 2589.34) / 2589.34 = −84.8% is the wallet gap, not the P&L.
    const series = [point(-20, Date.parse('2026-06-01T00:00:00Z'))];
    const s = summarizeSeries(series, 'all', { declaredStart: OPENING, equity: WALLET, now: Date.parse('2026-10-16T00:00:00Z') });
    expect(s.pnl).toBe(-20);
    expect(s.percent).toBeCloseTo((-20 / OPENING) * 100, 5);
    expect(s.percent).toBeCloseTo(-0.772, 2);
    expect(Math.abs(s.percent - WALLET_GAP_PERCENT)).toBeGreaterThan(80);
    expect(WALLET_GAP_PERCENT).toBeCloseTo(-84.8, 1);
  });

  it('uses the wallet minus closed P&L when no opening balance was saved', () => {
    const series = [point(-20, Date.parse('2026-06-01T00:00:00Z'))];
    const s = summarizeSeries(series, 'all', { declaredStart: 0, equity: WALLET, now: Date.parse('2026-10-16T00:00:00Z') });
    // Base is 393.58 − (−20), not the withdrawn principal.
    expect(s.capital).toBeCloseTo(WALLET - (-20), 5);
    expect(s.percent).toBeCloseTo((-20 / (WALLET + 20)) * 100, 5);
    expect(Math.abs(s.percent)).toBeLessThan(10);
  });

  it('follows the selected period and matches that period\'s P&L', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const day = 86400000;
    const series = [
      point(-200, now - 40 * day),
      point(10, now - 2 * day),
    ];
    const all = summarizeSeries(series, 'all', { declaredStart: 1000, equity: 400, now });
    const week = summarizeSeries(series, 'week', { declaredStart: 1000, equity: 400, now });
    expect(all.pnl).toBe(-190);
    expect(all.percent).toBeCloseTo(-19, 5);
    // Week P&L is +$10 on capital of 1000 + (−200) already booked.
    expect(week.pnl).toBe(10);
    expect(week.percent).toBeCloseTo((10 / 800) * 100, 5);
    expect(week.percent).not.toBeCloseTo(all.percent, 1);
  });

  it('keeps a month window on that month\'s P&L', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const day = 86400000;
    const series = [point(-50, now - 10 * day), point(5, now - 40 * day)];
    const month = summarizeSeries(series, 'month', { declaredStart: 500, equity: 200, now });
    expect(month.pnl).toBe(-50);
    expect(month.percent).toBeCloseTo((-50 / (500 + 5)) * 100, 5);
  });

  it('hides the percent when there is no positive capital', () => {
    expect(tradingReturnPercent(-20, 0)).toBeNull();
    expect(tradingReturnPercent(-20, -5)).toBeNull();
    const s = summarizeSeries([point(-20, 1)], 'all', { declaredStart: 0, equity: null });
    expect(s.percent).toBeNull();
  });

  it('sums only opening balances the user saved', () => {
    expect(declaredStartCapital([
      { initialBalance: 1000 },
      { initialBalance: 0 },
      { initialBalance: '50.5' },
      { initialBalance: -3 },
    ])).toBe(1050.5);
  });
});
