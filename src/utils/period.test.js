import { describe, it, expect } from 'vitest';
import { getPeriodStart, toDate } from './period';

// Every "last week / month / year" filter on the dashboard and the backtest
// stats runs through these. A boundary off by a day silently drops or adds
// trades to a period the user is reading as fact.

describe('getPeriodStart', () => {
  it('"all" has no start — nothing is filtered out', () => {
    expect(getPeriodStart('all')).toBe(null);
    expect(getPeriodStart(undefined)).toBe(null);
    expect(getPeriodStart('nonsense')).toBe(null);
  });

  it('starts each window at LOCAL midnight, so a whole day is never half-counted', () => {
    for (const p of ['week', 'month', 'year']) {
      const d = getPeriodStart(p);
      expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    }
  });

  it('week is 7 days back, month one calendar month, year one calendar year', () => {
    const now = new Date();
    const midnightToday = new Date(now);
    midnightToday.setHours(0, 0, 0, 0);

    const week = getPeriodStart('week');
    expect(Math.round((midnightToday - week) / 86400000)).toBe(7);

    const month = getPeriodStart('month');
    // Calendar month, not 30 days: only the month number moves.
    const expectedMonth = new Date(now);
    expectedMonth.setMonth(expectedMonth.getMonth() - 1);
    expect(month.getMonth()).toBe(expectedMonth.getMonth());

    const year = getPeriodStart('year');
    expect(year.getFullYear()).toBe(now.getFullYear() - 1);
  });

  it('every window starts in the past', () => {
    const now = Date.now();
    for (const p of ['week', 'month', 'year']) {
      expect(getPeriodStart(p).getTime()).toBeLessThan(now);
    }
  });
});

describe('toDate', () => {
  it('reads a Firestore Timestamp, a Date and a string alike', () => {
    const ms = Date.UTC(2026, 0, 15);
    expect(toDate({ toDate: () => new Date(ms) }).getTime()).toBe(ms);
    expect(toDate(new Date(ms)).getTime()).toBe(ms);
    expect(toDate('2026-01-15T00:00:00.000Z').getTime()).toBe(ms);
  });

  it('falls back to the EPOCH, not null, so sorts stay stable', () => {
    // Deliberately different from formatters.safeDate: callers here sort and
    // compare, and a null would throw or reorder unpredictably.
    expect(toDate(null).getTime()).toBe(0);
    expect(toDate(undefined).getTime()).toBe(0);
    expect(toDate('').getTime()).toBe(0);
  });

  it('a missing date sorts oldest rather than crashing the sort', () => {
    const rows = [{ d: '2026-01-02' }, { d: null }, { d: '2026-01-01' }];
    const sorted = [...rows].sort((a, b) => toDate(a.d) - toDate(b.d));
    expect(sorted[0].d).toBe(null);
  });
});
