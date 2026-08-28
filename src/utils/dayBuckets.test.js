import { describe, it, expect } from 'vitest';
import { localDayKey } from './calculations';

// Two charts bucketed dates by hand and both got it wrong in a way that shows
// a plausible number rather than an error. These pin the shared key that
// replaced them.

describe('localDayKey as a chart bucket', () => {
  it('separates the same calendar day in different years', () => {
    // The journal's daily-P&L chart keyed on MM/dd with the period filter
    // defaulting to "all", so a +$800 day in 2026 and a -$900 day in 2025
    // merged into one red -$100 bar labelled 03/15.
    const a = new Date(2025, 2, 15, 12);
    const b = new Date(2026, 2, 15, 12);
    expect(localDayKey(a)).not.toBe(localDayKey(b));
  });

  it('zero-pads, so a bucket key and a record key cannot disagree', () => {
    // "2026-3-7" vs "2026-03-07" silently dropped every match.
    expect(localDayKey(new Date(2026, 2, 7))).toBe('2026-03-07');
  });

  it('walking calendar days never skips one, even across a DST shift', () => {
    // Israel springs forward on the last Friday of March; that day is 23 hours
    // long. Stepping back by a fixed 86,400,000 ms produced 30 timestamps
    // landing on only 29 distinct dates, and every signup on the skipped day
    // vanished from the admin chart behind an apparent zero.
    const base = new Date(2026, 3, 10, 12); // well after the transition
    const keys = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      keys.push(localDayKey(d));
    }
    expect(new Set(keys).size).toBe(30);
    expect(keys.every(Boolean)).toBe(true);
  });

  it('the fixed-millisecond walk it replaced is the thing that breaks', () => {
    // Not asserting a skip here — whether one occurs depends on the machine's
    // timezone, and this suite must pass under UTC too. What is asserted is
    // that a calendar walk is invariant to that, which the ms walk is not:
    // the calendar walk yields 30 distinct days in every timezone.
    const base = new Date(2026, 3, 10, 12);
    const calendar = [];
    for (let i = 29; i >= 0; i--) {
      calendar.push(localDayKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)));
    }
    expect(new Set(calendar).size).toBe(30);
    // Consecutive keys must be strictly increasing, so the axis cannot double
    // back or repeat a label.
    expect([...calendar].sort()).toEqual(calendar);
  });

  it('returns empty for an unparseable date rather than a NaN key', () => {
    expect(localDayKey('not a date')).toBe('');
    expect(localDayKey(null)).toBe('');
  });
});
