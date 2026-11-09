// Client-side filters for the economic calendar.
// The list itself stays the Worker's existing Forex Factory "this week" feed
// (`GET /calendar` → ff_calendar_thisweek.json). No extra feed and no API key.
// Choices are remembered per signed-in user in localStorage, same idea as
// `tradeos_theme_${uid}`. Logged-out sessions are not written, so a shared
// browser does not leak one account's filters to the next.

export const CALENDAR_FILTERS_PREFIX = 'tradeos_econ_cal_filters_';
export const CALENDAR_QUERY_MAX = 80;

export const CALENDAR_PERIODS = ['yesterday', 'today', 'tomorrow', 'thisWeek', 'upcoming'];
export const CALENDAR_IMPACTS = ['all', 'High', 'Medium', 'Low'];

export const CALENDAR_COUNTRIES = [
  { code: 'USD', flag: '🇺🇸', label: 'ארה"ב' },
  { code: 'EUR', flag: '🇪🇺', label: 'אירופה' },
  { code: 'GBP', flag: '🇬🇧', label: 'בריטניה' },
  { code: 'JPY', flag: '🇯🇵', label: 'יפן' },
  { code: 'AUD', flag: '🇦🇺', label: 'אוסטרליה' },
  { code: 'CAD', flag: '🇨🇦', label: 'קנדה' },
  { code: 'CHF', flag: '🇨🇭', label: 'שוויץ' },
  { code: 'NZD', flag: '🇳🇿', label: 'ניו זילנד' },
  { code: 'CNY', flag: '🇨🇳', label: 'סין' },
];

const KNOWN_CODES = CALENDAR_COUNTRIES.map((c) => c.code);

export function defaultCalendarFilters() {
  return { impact: 'all', countries: ['USD'], period: 'thisWeek', query: '' };
}

export function calendarFiltersStorageKey(uid) {
  if (typeof uid !== 'string' || !uid.trim()) return null;
  return `${CALENDAR_FILTERS_PREFIX}${uid}`;
}

function knownCodes(list) {
  return Array.isArray(list) && list.length ? list : KNOWN_CODES;
}

export function sanitizeCalendarFilters(raw, countryCodes = KNOWN_CODES) {
  const allowed = new Set(knownCodes(countryCodes));
  const base = defaultCalendarFilters();
  if (!raw || typeof raw !== 'object') return base;
  const countries = Array.isArray(raw.countries)
    ? [...new Set(raw.countries.filter((code) => allowed.has(code)))]
    : base.countries;
  const query = typeof raw.query === 'string' ? raw.query.slice(0, CALENDAR_QUERY_MAX) : '';
  return {
    impact: CALENDAR_IMPACTS.includes(raw.impact) ? raw.impact : base.impact,
    countries,
    period: CALENDAR_PERIODS.includes(raw.period) ? raw.period : base.period,
    query,
  };
}

function browserStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* private mode */ }
  return null;
}

export function loadCalendarFilters(uid, countryCodes = KNOWN_CODES, storage = browserStorage()) {
  const key = calendarFiltersStorageKey(uid);
  if (!key || !storage) return defaultCalendarFilters();
  try {
    const raw = JSON.parse(storage.getItem(key) || 'null');
    return sanitizeCalendarFilters(raw, countryCodes);
  } catch {
    return defaultCalendarFilters();
  }
}

export function saveCalendarFilters(uid, filters, countryCodes = KNOWN_CODES, storage = browserStorage()) {
  const key = calendarFiltersStorageKey(uid);
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify(sanitizeCalendarFilters(filters, countryCodes)));
  } catch { /* quota / private mode */ }
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// `filters.countries` empty means every currency (the "clear all" control).
// `thisWeek` keeps the whole feed: the Worker already returns this week only.
export function filterCalendarEvents(events, filters, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
  const labelOf = typeof options.labelOf === 'function' ? options.labelOf : null;
  const safe = sanitizeCalendarFilters({
    ...filters,
    countries: Array.isArray(filters?.countries) ? filters.countries : defaultCalendarFilters().countries,
  });
  const selected = new Set(safe.countries);
  const tokens = safe.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const today = dateOnly(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return list.filter((event) => {
    if (!event || typeof event !== 'object') return false;
    const when = new Date(event.date);
    const valid = !Number.isNaN(when.getTime());
    if (safe.period === 'yesterday') {
      if (!valid || !sameDay(when, yesterday)) return false;
    } else if (safe.period === 'today') {
      if (!valid || !sameDay(when, today)) return false;
    } else if (safe.period === 'tomorrow') {
      if (!valid || !sameDay(when, tomorrow)) return false;
    } else if (safe.period === 'upcoming') {
      if (!valid || when < now) return false;
    }
    if (selected.size > 0 && !selected.has(event.country)) return false;
    if (safe.impact !== 'all' && event.impact !== safe.impact) return false;
    if (tokens.length) {
      let extra = '';
      try { extra = labelOf ? String(labelOf(event) || '') : ''; } catch { extra = ''; }
      const hay = `${event.title || ''} ${event.country || ''} ${extra}`.toLowerCase();
      if (!tokens.every((token) => hay.includes(token))) return false;
    }
    return true;
  });
}
