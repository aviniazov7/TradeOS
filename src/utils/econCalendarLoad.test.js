import { describe, expect, it } from 'vitest';
import {
  CALENDAR_CACHE_TTL_MS,
  readCalendarCache,
} from './econCalendarLoad';

const NOW = new Date('2026-11-09T12:00:00Z').getTime();
const EVENTS = [{ title: 'Core CPI m/m', country: 'USD', date: '2026-11-09T08:30:00-05:00', impact: 'High' }];

describe('stored economic calendar', () => {
  it('treats a copy from the last hour as fresh', () => {
    const stored = readCalendarCache({ data: EVENTS, ts: NOW - 5 * 60 * 1000 }, NOW);
    expect(stored.fresh).toBe(true);
    expect(stored.events).toEqual(EVENTS);
  });

  it('keeps a copy older than the hour as a fallback, and drops one older than a week', () => {
    const stale = readCalendarCache({ data: EVENTS, ts: NOW - CALENDAR_CACHE_TTL_MS - 1000 }, NOW);
    expect(stale.fresh).toBe(false);
    expect(stale.events).toHaveLength(1);
    expect(readCalendarCache({ data: EVENTS, ts: NOW - 8 * 24 * 60 * 60 * 1000 }, NOW)).toBeNull();
  });

  it('ignores corrupt, empty, and future-dated cache', () => {
    expect(readCalendarCache('{', NOW)).toBeNull();
    expect(readCalendarCache({ data: [], ts: NOW }, NOW)).toBeNull();
    expect(readCalendarCache({ data: EVENTS, ts: NOW + 60_000 }, NOW)).toBeNull();
    expect(readCalendarCache(null, NOW)).toBeNull();
  });
});
