import { describe, it, expect } from 'vitest';
import { getSessionFromDate, SESSION_UNKNOWN } from './sessions';

// The single source of truth for which trading session a trade belongs to.
// The worker mirrors these exact bands (worker/index.js sessionFromDate) — the
// two used to disagree, so the same wall-clock entry was bucketed differently
// depending only on whether the trade was imported or typed by hand.

// Israel is UTC+2 in winter and UTC+3 during DST.
const winter = (h, m = 0) => new Date(Date.UTC(2026, 0, 15, h - 2, m));
const summer = (h, m = 0) => new Date(Date.UTC(2026, 6, 15, h - 3, m));

describe('getSessionFromDate — Israel-local bands', () => {
  it('buckets by Israel local hour, identically in winter and in DST', () => {
    for (const at of [winter, summer]) {
      expect(getSessionFromDate(at(10))).toBe('London');
      expect(getSessionFromDate(at(15))).toBe('London/NY Overlap');
      expect(getSessionFromDate(at(20))).toBe('New York');
      expect(getSessionFromDate(at(3))).toBe('Asia');
    }
  });

  it('honours the band edges exactly', () => {
    expect(getSessionFromDate(winter(8, 59))).toBe('Asia');
    expect(getSessionFromDate(winter(9))).toBe('London');
    expect(getSessionFromDate(winter(13, 59))).toBe('London');
    expect(getSessionFromDate(winter(14))).toBe('London/NY Overlap');
    expect(getSessionFromDate(winter(17, 59))).toBe('London/NY Overlap');
    expect(getSessionFromDate(winter(18))).toBe('New York');
    expect(getSessionFromDate(winter(22, 59))).toBe('New York');
    expect(getSessionFromDate(winter(23))).toBe('Asia');
  });

  it('an overnight trade is explicitly Asia, never the invalid-date fallback', () => {
    // Callers pass fallback: SESSION_UNKNOWN for unparseable dates, so a valid
    // 02:00 trade must not be collapsed into "not specified".
    expect(getSessionFromDate(winter(2), { fallback: SESSION_UNKNOWN })).toBe('Asia');
  });

  it('reads a Firestore Timestamp, a Date and an ISO string alike', () => {
    const d = winter(10);
    expect(getSessionFromDate({ toDate: () => d })).toBe('London');
    expect(getSessionFromDate(d)).toBe('London');
    expect(getSessionFromDate(d.toISOString())).toBe('London');
  });

  it('empty is empty; unparseable takes the caller fallback', () => {
    expect(getSessionFromDate(null)).toBe('');
    expect(getSessionFromDate('')).toBe('');
    expect(getSessionFromDate('not a date')).toBe('Asia');
    expect(getSessionFromDate('not a date', { fallback: SESSION_UNKNOWN })).toBe(SESSION_UNKNOWN);
  });
});
