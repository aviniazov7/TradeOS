// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { CALENDAR_FILTERS_PREFIX } from '../../utils/econCalendarFilters';

const auth = { user: { uid: 'user-a' }, loading: false };

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../services/newsService', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, translateNews: vi.fn(async () => null) };
});

vi.mock('../../services/pushService', () => ({
  pushSupported: () => false,
  subscribeToPush: vi.fn(),
  getNotifySchedule: vi.fn(async () => null),
  saveNotifySchedule: vi.fn(async (s) => s),
}));

vi.mock('../../services/firestoreService', () => ({
  setUserSetting: vi.fn(),
}));

import { EconomicCalendar } from './NewsPage';

const CACHE_KEY = 'tradeos_econ_calendar_v3';

function iso(offsetDays, hour) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

const EVENTS = [
  { title: 'Core CPI m/m', country: 'USD', date: iso(0, 12), impact: 'High', forecast: '0.3%', previous: '0.2%', actual: '0.4%' },
  { title: 'Unemployment Rate', country: 'EUR', date: iso(0, 11), impact: 'Medium', forecast: '6.5%', previous: '6.4%' },
  { title: 'GDP q/q', country: 'GBP', date: iso(1, 12), impact: 'Low', forecast: '0.2%', previous: '0.1%' },
  { title: 'Synthetic Widget Print', country: 'USD', date: iso(0, 16), impact: 'Low' },
];

function seed() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data: EVENTS, ts: Date.now() }));
}

function button(el, label, { exact = true } = {}) {
  return [...el.querySelectorAll('button')].find((node) => {
    const text = node.textContent.trim();
    return exact ? text === label : text.includes(label);
  });
}

async function click(el, label, options) {
  const node = button(el, label, options);
  if (!node) throw new Error(`missing button ${label}`);
  await act(async () => { node.click(); });
}

async function typeSearch(el, value) {
  const input = el.querySelector('input[aria-label="חיפוש ביומן הכלכלי"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

describe('economic calendar filters', () => {
  let el;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    localStorage.clear();
    auth.user = { uid: 'user-a' };
    auth.loading = false;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in test'));
    seed();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    el.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function show() {
    await act(async () => { root.render(<EconomicCalendar />); });
  }

  it('filters the cached week by currency, importance, day and Hebrew or English text', async () => {
    await show();
    const section = el.querySelector('[aria-label="יומן כלכלי"]');
    const search = el.querySelector('input[aria-label="חיפוש ביומן הכלכלי"]');
    expect(section.getAttribute('dir')).toBe('rtl');
    expect(search.className).toContain('w-full');
    expect(search.className).toContain('h-11');
    expect(search.className).toContain('bg-bg-secondary');
    expect(search.className).toContain('text-text-primary');
    expect(search.className).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(el.querySelector('.overflow-x-auto')).toBeTruthy();
    expect(button(el, 'היום').className).toContain('min-h-11');
    expect(fetch).not.toHaveBeenCalled();

    expect(el.textContent).toContain('מדד המחירים לצרכן הליבה');
    expect(el.textContent).toContain('Synthetic Widget Print');
    expect(el.textContent).not.toContain('שיעור האבטלה');
    expect(el.textContent).not.toContain('התוצר המקומי הגולמי');

    await click(el, 'מדינות (1)');
    await click(el, 'אירופה', { exact: false });
    expect(el.textContent).toContain('שיעור האבטלה');
    await click(el, 'מדינות (2)');

    await click(el, 'היום');
    expect(button(el, 'היום').getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).not.toContain('התוצר המקומי הגולמי');

    await click(el, 'חשיבות: הכל');
    await click(el, 'בינוני');
    expect(el.textContent).toContain('שיעור האבטלה');
    expect(el.textContent).not.toContain('מדד המחירים לצרכן הליבה');

    await click(el, 'חשיבות: בינוני');
    await click(el, 'הכל');
    await typeSearch(el, 'אבטלה');
    expect(el.textContent).toContain('שיעור האבטלה');
    expect(el.textContent).not.toContain('Synthetic Widget Print');

    await typeSearch(el, 'widget');
    expect(el.textContent).toContain('Synthetic Widget Print');
    expect(el.textContent).not.toContain('שיעור האבטלה');

    await typeSearch(el, 'אין דבר כזה');
    expect(el.textContent).toContain('אין אירועים שתואמים לחיפוש');
  });

  it('remembers the search per user and does not copy it to the next account', async () => {
    await show();
    await typeSearch(el, 'widget');
    const saved = JSON.parse(localStorage.getItem(`${CALENDAR_FILTERS_PREFIX}user-a`));
    expect(saved.query).toBe('widget');
    expect(saved.countries).toEqual(['USD']);

    await act(async () => { root.unmount(); });
    auth.user = { uid: 'user-b' };
    root = createRoot(el);
    await show();
    const search = el.querySelector('input[aria-label="חיפוש ביומן הכלכלי"]');
    expect(search.value).toBe('');
    expect(el.textContent).toContain('מדד המחירים לצרכן הליבה');
    expect(JSON.parse(localStorage.getItem(`${CALENDAR_FILTERS_PREFIX}user-a`)).query).toBe('widget');
    const other = JSON.parse(localStorage.getItem(`${CALENDAR_FILTERS_PREFIX}user-b`) || 'null');
    expect(other?.query || '').not.toBe('widget');

    await act(async () => { root.unmount(); });
    auth.user = { uid: 'user-a' };
    root = createRoot(el);
    await show();
    expect(el.querySelector('input[aria-label="חיפוש ביומן הכלכלי"]').value).toBe('widget');
    expect(el.textContent).toContain('Synthetic Widget Print');
    expect(el.textContent).not.toContain('מדד המחירים לצרכן הליבה');
  });
});
