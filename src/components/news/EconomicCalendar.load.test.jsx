// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { CALENDAR_CACHE_TTL_MS, CALENDAR_LOAD_ERROR, CALENDAR_STALE_NOTICE } from '../../utils/econCalendarLoad';

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
const SAVED = [{ title: 'Core CPI m/m', country: 'USD', date: new Date().toISOString(), impact: 'High', forecast: '0.3%', previous: '0.2%' }];

function jsonResponse(body, { status = 200, stale = false } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(stale ? { 'X-Calendar-Stale': '1' } : {}),
    },
  });
}

describe('economic calendar load', () => {
  let el;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    localStorage.clear();
    auth.user = { uid: 'user-a' };
    auth.loading = false;
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    el.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function show() {
    await act(async () => { root.render(<EconomicCalendar />); });
  }

  it('keeps the saved week on screen when the worker returns 502', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: SAVED,
      ts: Date.now() - CALENDAR_CACHE_TTL_MS - 60_000,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'upstream' }, { status: 502 })));
    await show();
    expect(el.textContent).toContain('מדד המחירים לצרכן הליבה');
    expect(el.textContent).toContain(CALENDAR_STALE_NOTICE);
    expect(el.textContent).not.toContain(CALENDAR_LOAD_ERROR);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a source-down error when there is no saved week', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'timeout' }, { status: 502 })));
    await show();
    expect(el.textContent).toContain(CALENDAR_LOAD_ERROR);
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    expect(el.textContent).not.toContain(CALENDAR_STALE_NOTICE);
  });

  it('marks a worker stale week so retry does not treat it as fresh', async () => {
    const week = [{ title: 'Core CPI m/m', country: 'USD', date: new Date().toISOString(), impact: 'High', forecast: '0.3%', previous: '0.2%' }];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(week, { stale: true })));
    await show();
    expect(el.textContent).toContain('מדד המחירים לצרכן הליבה');
    expect(el.textContent).toContain(CALENDAR_STALE_NOTICE);
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(Date.now() - stored.ts).toBeGreaterThan(CALENDAR_CACHE_TTL_MS);
  });
});
