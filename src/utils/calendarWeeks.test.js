import { describe, it, expect } from 'vitest';
import { chunkWeeks, weekTotals } from './calendarWeeks';

describe('calendar weeks', () => {
  it('pads a short month grid into weeks of seven', () => {
    const days = [null, new Date(2026, 9, 1)];
    const weeks = chunkWeeks(days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][2]).toBeNull();
  });

  it('sums trade count and P&L for the days that have trades', () => {
    const day = new Date(2026, 9, 14);
    const data = { '2026-10-14': { pnl: 40, trades: [{}, {}, {}] } };
    expect(weekTotals([null, day, null], data)).toEqual({ pnl: 40, count: 3 });
    expect(weekTotals([null, null], {})).toEqual({ pnl: 0, count: 0 });
  });
});
