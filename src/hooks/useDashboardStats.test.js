import { describe, it, expect } from 'vitest';
import { tradeDate } from './useDashboardStats';
import { safePnl } from '../utils/calculations';

// safePnl and tradeDate are the two pure guards that keep dirty/incomplete trade
// rows from poisoning the dashboard. tradeDate specifically prevents the
// 1970-bucketing bug (closed trades with no exitDate — broker CSV imports and
// live SL/TP auto-closes).

describe('safePnl', () => {
  it('prefers netPnl, falls back to pnl', () => {
    expect(safePnl({ netPnl: 12, pnl: 99 })).toBe(12);
    expect(safePnl({ pnl: 7 })).toBe(7);
  });
  it('coerces numeric strings; dirty values default to 0', () => {
    expect(safePnl({ netPnl: '15.5' })).toBe(15.5);
    expect(safePnl({ netPnl: NaN })).toBe(0);
    expect(safePnl({ netPnl: undefined, pnl: null })).toBe(0);
    expect(safePnl(null)).toBe(0);
  });
});

describe('tradeDate — 1970 regression guard', () => {
  const exit = new Date(2026, 7, 4);
  const entry = new Date(2026, 7, 1);

  it('uses exitDate when present', () => {
    expect(tradeDate({ exitDate: exit, entryDate: entry }).getTime()).toBe(exit.getTime());
  });
  it('falls back to entryDate when exitDate is missing (NOT 1970)', () => {
    const d = tradeDate({ entryDate: entry });
    expect(d.getFullYear()).toBe(2026);
    expect(d.getTime()).toBe(entry.getTime());
  });
  it('handles exitDate:null (broker CSV import) via entryDate', () => {
    expect(tradeDate({ exitDate: null, entryDate: entry }).getFullYear()).toBe(2026);
  });
});
