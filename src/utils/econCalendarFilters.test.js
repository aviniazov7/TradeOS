import { describe, expect, it } from 'vitest';
import {
  CALENDAR_FILTERS_PREFIX,
  defaultCalendarFilters,
  filterCalendarEvents,
  loadCalendarFilters,
  saveCalendarFilters,
} from './econCalendarFilters';

const NOW = new Date(2026, 10, 9, 12, 0, 0);

function at(day, hour) {
  return new Date(2026, 10, day, hour, 0, 0).toISOString();
}

const EVENTS = [
  { title: 'Core CPI m/m', country: 'USD', date: at(9, 15), impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'Unemployment Rate', country: 'EUR', date: at(9, 10), impact: 'Medium', forecast: '6.5%', previous: '6.4%' },
  { title: 'GDP q/q', country: 'GBP', date: at(10, 9), impact: 'Low', forecast: '0.2%', previous: '0.1%' },
  { title: 'Retail Sales', country: 'USD', date: at(8, 9), impact: 'High', forecast: '0.4%', previous: '0.1%' },
  { title: 'Bank Holiday', country: 'JPY', date: at(9, 0), impact: 'Holiday' },
  { title: 'Fed Chair Speaks', country: 'USD', date: at(9, 18), impact: 'High' },
];

function titles(list) {
  return list.map((e) => e.title);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

describe('economic calendar filters', () => {
  it('keeps the default view on USD for the whole loaded week', () => {
    const out = filterCalendarEvents(EVENTS, defaultCalendarFilters(), { now: NOW });
    expect(titles(out)).toEqual(['Core CPI m/m', 'Retail Sales', 'Fed Chair Speaks']);
  });

  it('filters by importance, currency, and a single local day', () => {
    const out = filterCalendarEvents(EVENTS, {
      impact: 'Medium',
      countries: ['EUR'],
      period: 'today',
      query: '',
    }, { now: NOW });
    expect(titles(out)).toEqual(['Unemployment Rate']);
  });

  it('treats an empty currency list as every country and hides other impact levels', () => {
    const out = filterCalendarEvents(EVENTS, {
      impact: 'Low',
      countries: [],
      period: 'tomorrow',
      query: '',
    }, { now: NOW });
    expect(titles(out)).toEqual(['GDP q/q']);
  });

  it('keeps only events that have not started yet', () => {
    const out = filterCalendarEvents(EVENTS, {
      impact: 'all',
      countries: ['USD'],
      period: 'upcoming',
      query: '',
    }, { now: NOW });
    expect(titles(out)).toEqual(['Core CPI m/m', 'Fed Chair Speaks']);
  });

  it('matches Hebrew and English text, including more than one word', () => {
    const labelOf = (event) => (event.title === 'Core CPI m/m' ? 'מדד המחירים לצרכן הליבה (חודשי) ארה"ב' : '');
    const he = filterCalendarEvents(EVENTS, {
      impact: 'all',
      countries: [],
      period: 'thisWeek',
      query: 'מדד מחירים',
    }, { now: NOW, labelOf });
    expect(titles(he)).toEqual(['Core CPI m/m']);

    const en = filterCalendarEvents(EVENTS, {
      impact: 'all',
      countries: ['USD'],
      period: 'thisWeek',
      query: 'fed chair',
    }, { now: NOW });
    expect(titles(en)).toEqual(['Fed Chair Speaks']);
  });

  it('leaves this-week mode on the feed as loaded, including a day outside the local week', () => {
    const far = { title: 'Far Print', country: 'USD', date: at(20, 9), impact: 'High' };
    const out = filterCalendarEvents([...EVENTS, far], defaultCalendarFilters(), { now: NOW });
    expect(titles(out)).toContain('Far Print');
  });

  it('remembers filters per user and ignores another user and a logged-out session', () => {
    const store = memoryStorage();
    saveCalendarFilters('user-a', {
      impact: 'High',
      countries: ['USD', 'EUR', 'NOPE'],
      period: 'today',
      query: '  cpi  ',
    }, undefined, store);
    saveCalendarFilters('user-b', { impact: 'Low', countries: ['GBP'], period: 'tomorrow', query: 'gdp' }, undefined, store);
    saveCalendarFilters('', { impact: 'High', countries: ['JPY'], period: 'today', query: 'x' }, undefined, store);

    expect(loadCalendarFilters('user-a', undefined, store)).toEqual({
      impact: 'High',
      countries: ['USD', 'EUR'],
      period: 'today',
      query: '  cpi  ',
    });
    expect(loadCalendarFilters('user-b', undefined, store).period).toBe('tomorrow');
    expect(loadCalendarFilters(null, undefined, store)).toEqual(defaultCalendarFilters());
    expect(store.getItem(CALENDAR_FILTERS_PREFIX)).toBeNull();
    expect(store.getItem(`${CALENDAR_FILTERS_PREFIX}user-a`)).toContain('"impact":"High"');
  });

  it('falls back to defaults when the stored value is corrupt', () => {
    const store = memoryStorage();
    store.setItem(`${CALENDAR_FILTERS_PREFIX}user-a`, '{');
    expect(loadCalendarFilters('user-a', undefined, store)).toEqual(defaultCalendarFilters());
    store.setItem(`${CALENDAR_FILTERS_PREFIX}user-a`, JSON.stringify({
      impact: 'Severe',
      countries: 'USD',
      period: 'nextMonth',
      query: 'x'.repeat(200),
    }));
    const loaded = loadCalendarFilters('user-a', undefined, store);
    expect(loaded.impact).toBe('all');
    expect(loaded.countries).toEqual(['USD']);
    expect(loaded.period).toBe('thisWeek');
    expect(loaded.query).toHaveLength(80);
  });
});
