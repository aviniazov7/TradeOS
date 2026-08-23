import { describe, it, expect } from 'vitest';
import {
  toDate, isUserPremium, daysSinceActive, activeWithin,
  daysUntilExpiry, relativeActive, ILS, csvCell,
} from './adminStats';

const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const days = (n) => NOW - n * 86400000;

describe('toDate — every timestamp shape the app has written', () => {
  it('reads live Timestamps, serialized ones, epoch ms, ISO and Date', () => {
    const ms = Date.UTC(2026, 0, 1);
    expect(toDate({ toDate: () => new Date(ms) }).getTime()).toBe(ms);
    expect(toDate({ seconds: ms / 1000 }).getTime()).toBe(ms);
    expect(toDate({ _seconds: ms / 1000 }).getTime()).toBe(ms);
    expect(toDate(ms).getTime()).toBe(ms);
    expect(toDate('2026-01-01T00:00:00.000Z').getTime()).toBe(ms);
    expect(toDate(new Date(ms)).getTime()).toBe(ms);
  });
  it('returns null, never an Invalid Date, for junk', () => {
    expect(toDate(null)).toBe(null);
    expect(toDate(undefined)).toBe(null);
    expect(toDate('not a date')).toBe(null);
  });
});

describe('isUserPremium', () => {
  it('admins are always premium', () => {
    expect(isUserPremium({ role: 'admin', plan: 'free' })).toBe(true);
  });
  it('a plan with no expiry is lifetime', () => {
    expect(isUserPremium({ plan: 'premium' })).toBe(true);
  });
  it('honours a Firestore Timestamp expiry in both directions', () => {
    // The reason toDate exists: new Date(Timestamp) is Invalid Date, which
    // would show a paying customer as free.
    const future = { toDate: () => new Date(Date.now() + 86400000) };
    const past = { toDate: () => new Date(Date.now() - 86400000) };
    expect(isUserPremium({ plan: 'premium', planExpires: future })).toBe(true);
    expect(isUserPremium({ plan: 'premium', planExpires: past })).toBe(false);
  });
  it('keeps the badge when the expiry is set but unreadable — plan says premium', () => {
    expect(isUserPremium({ plan: 'premium', planExpires: 'garbage' })).toBe(true);
  });
  it('free users and nothing at all are not premium', () => {
    expect(isUserPremium({ plan: 'free' })).toBe(false);
    expect(isUserPremium(null)).toBe(false);
  });
});

describe('activity', () => {
  it('counts whole days since last seen', () => {
    expect(daysSinceActive({ lastActive: days(3) }, NOW)).toBe(3);
    expect(activeWithin({ lastActive: days(3) }, 7, NOW)).toBe(true);
    expect(activeWithin({ lastActive: days(30) }, 7, NOW)).toBe(false);
  });
  it('a user never seen is infinitely stale, not zero days', () => {
    // Zero would rank them as the MOST active — the opposite of the truth.
    expect(daysSinceActive({}, NOW)).toBe(Infinity);
    expect(activeWithin({}, 3650, NOW)).toBe(false);
  });
});

describe('daysUntilExpiry', () => {
  it('positive before, negative after, Infinity for lifetime', () => {
    expect(daysUntilExpiry({ planExpires: NOW + 5 * 86400000 }, NOW)).toBe(5);
    expect(daysUntilExpiry({ planExpires: NOW - 2 * 86400000 }, NOW)).toBe(-2);
    expect(daysUntilExpiry({}, NOW)).toBe(Infinity);
  });
});

describe('relativeActive', () => {
  it('scales the Hebrew label with the gap', () => {
    expect(relativeActive(NOW - 30 * 1000, NOW)).toBe('עכשיו');
    expect(relativeActive(NOW - 5 * 60000, NOW)).toBe("לפני 5 ד'");
    expect(relativeActive(NOW - 3 * 3600000, NOW)).toBe("לפני 3 שע'");
    expect(relativeActive(days(1), NOW)).toBe('אתמול');
    expect(relativeActive(days(5), NOW)).toBe('לפני 5 ימים');
    expect(relativeActive(days(35), NOW)).toBe('לפני חודש');
    expect(relativeActive(days(80), NOW)).toBe('לפני 2 חודשים');
    expect(relativeActive(null, NOW)).toBe('מעולם לא');
  });
});

describe('formatting', () => {
  it('ILS rounds and never renders NaN', () => {
    expect(ILS(1234.6)).toBe('₪1,235');
    expect(ILS(null)).toBe('₪0');
    expect(ILS('nope')).toBe('₪0');
  });
  it('csvCell quotes only when the value could break the row', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('has,comma')).toBe('"has,comma"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });
});
