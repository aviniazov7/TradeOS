import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import {
  CALENDAR_UPSTREAM,
  calendarFetchInit,
  calendarHttpResponse,
  parseCalendarEvents,
  resolveCalendarFeed,
} from './calendarFeed';

const EVENTS = [
  { title: 'Core CPI m/m', country: 'USD', date: '2026-11-09T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'GDP q/q', country: 'GBP', date: '2026-11-10T09:00:00-05:00', impact: 'Low', forecast: '0.1%', previous: '0.0%' },
];

function jsonResponse(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function memoryCache(initial) {
  const saved = new Map();
  if (initial) saved.set('https://cache.tradeos/calendar-week-v2', JSON.stringify(initial));
  return {
    saved,
    async match(request) {
      const url = request.url;
      const body = saved.get(url);
      return body == null ? undefined : new Response(body);
    },
    async put(request, response) {
      saved.set(request.url, await response.text());
    },
  };
}

describe('calendar feed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a week array and rejects HTML, objects, and empty lists', () => {
    expect(parseCalendarEvents(JSON.stringify(EVENTS))).toHaveLength(2);
    expect(parseCalendarEvents('<html>blocked</html>')).toBeNull();
    expect(parseCalendarEvents(JSON.stringify({ error: 'upstream' }))).toBeNull();
    expect(parseCalendarEvents('[]')).toBeNull();
    expect(parseCalendarEvents(JSON.stringify([{ title: '', date: '2026-11-09' }]))).toBeNull();
  });

  it('caches only successful statuses and does not keep a cacheTtl that stores errors', () => {
    const init = calendarFetchInit(50);
    expect(init.headers.Accept).toContain('application/json');
    expect(init.headers['User-Agent']).toContain('Mozilla');
    expect(init.headers.Referer).toContain('forexfactory.com');
    expect(init.cf.cacheTtl).toBeUndefined();
    expect(init.cf.cacheEverything).toBeUndefined();
    expect(init.cf.cacheKey).toBeUndefined();
    expect(init.cf.cacheTtlByStatus).toEqual({ '200-299': 300 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the upstream week and stores it as the last good copy', async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () => jsonResponse(EVENTS));
    const result = await resolveCalendarFeed({ fetchImpl, cache, init: { signal: undefined } });
    expect(result).toMatchObject({ status: 200, stale: false });
    expect(result.events[0].title).toBe('Core CPI m/m');
    expect(fetchImpl).toHaveBeenCalledWith(CALENDAR_UPSTREAM, { signal: undefined });
    expect(cache.saved.get('https://cache.tradeos/calendar-week-v2')).toContain('Core CPI');
  });

  it('serves the last good week when the upstream answers 502, without echoing its body', async () => {
    const cache = memoryCache(EVENTS);
    const fetchImpl = vi.fn(async () => new Response('<html>secret-upstream-body</html>', { status: 502 }));
    const result = await resolveCalendarFeed({ fetchImpl, cache, init: {} });
    expect(result.status).toBe(200);
    expect(result.stale).toBe(true);
    expect(result.error).toBe('upstream');
    expect(JSON.stringify(result)).not.toContain('secret-upstream-body');
    const http = calendarHttpResponse(result, { 'Access-Control-Allow-Origin': 'https://tradeoslive.web.app' });
    expect(http.status).toBe(200);
    expect(http.headers.get('X-Calendar-Stale')).toBe('1');
    expect(http.headers.get('Cache-Control')).toContain('max-age=60');
    expect(await http.json()).toHaveLength(2);
  });

  it('maps a timeout with no saved week to a 502 that must not be cached', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    const result = await resolveCalendarFeed({ fetchImpl, cache: memoryCache(), init: {}, seed: [] });
    expect(result).toMatchObject({ status: 502, stale: false, error: 'timeout', events: null });
    const http = calendarHttpResponse(result, { 'Access-Control-Allow-Origin': '*' });
    expect(http.status).toBe(502);
    expect(http.headers.get('Cache-Control')).toContain('no-store');
    expect(await http.json()).toEqual({ error: 'timeout' });
  });

  it('serves the bundled week when the source misses and nothing was saved', async () => {
    const fetchImpl = vi.fn(async () => new Response('blocked', { status: 403 }));
    const result = await resolveCalendarFeed({ fetchImpl, cache: memoryCache(), init: {} });
    expect(result.status).toBe(200);
    expect(result.stale).toBe(true);
    expect(result.seeded).toBe(true);
    expect(result.error).toBe('upstream');
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].title).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('blocked');
    const http = calendarHttpResponse(result, { 'Access-Control-Allow-Origin': 'https://tradeoslive--dev-0qe24kd4.web.app' });
    expect(http.status).toBe(200);
    expect(http.headers.get('X-Calendar-Stale')).toBe('1');
  });

  it('answers GET /calendar with the week, and a no-store 502 when nothing is saved', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === CALENDAR_UPSTREAM) return jsonResponse(EVENTS);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const ok = await worker.fetch(new Request('https://trade-os.tradeos.workers.dev/calendar'), {});
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain('max-age=300');
    expect(await ok.json()).toEqual(EVENTS);
    const init = fetchMock.mock.calls[0][1];
    expect(init.cf.cacheTtl).toBeUndefined();
    expect(init.cf.cacheEverything).toBeUndefined();

    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
    const missed = await worker.fetch(new Request('https://trade-os.tradeos.workers.dev/calendar'), {});
    expect(missed.status).toBe(200);
    expect(missed.headers.get('X-Calendar-Stale')).toBe('1');
    expect(missed.headers.get('Cache-Control')).toContain('max-age=60');
    const body = await missed.json();
    expect(Array.isArray(body) && body.length > 0).toBe(true);
    expect(JSON.stringify(body)).not.toContain('nope');
  });

  it('maps a non-array 200 to shape and does not replace the saved week', async () => {
    const cache = memoryCache(EVENTS);
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'nope' }));
    const result = await resolveCalendarFeed({ fetchImpl, cache, init: {} });
    expect(result.stale).toBe(true);
    expect(result.error).toBe('shape');
    expect(result.events).toHaveLength(2);
  });
});
