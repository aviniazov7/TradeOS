// How the calendar page treats the Worker's /calendar response and the copy
// kept in localStorage. The week feed is allowed to fail; a recent saved copy
// stays on screen instead of the hard error.

export const CALENDAR_CACHE_TTL_MS = 60 * 60 * 1000;
export const CALENDAR_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CALENDAR_STALE_NOTICE = 'המקור לא זמין כרגע. מוצג העדכון האחרון שנשמר במכשיר.';
export const CALENDAR_LOAD_ERROR = 'היומן הכלכלי לא זמין כרגע. המקור לא הגיב, ואין עדכון שמור להצגה.';

export function readCalendarCache(raw, now = Date.now(), {
  ttl = CALENDAR_CACHE_TTL_MS,
  maxAge = CALENDAR_CACHE_MAX_AGE_MS,
} = {}) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed.ts !== 'number' || !Array.isArray(parsed.data) || parsed.data.length === 0) {
      return null;
    }
    const age = now - parsed.ts;
    if (!Number.isFinite(age) || age < 0 || age > maxAge) return null;
    return { events: parsed.data, fresh: age < ttl, ts: parsed.ts };
  } catch {
    return null;
  }
}
