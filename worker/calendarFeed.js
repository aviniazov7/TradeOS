// Forex Factory's public week feed, fetched only by the Worker.
// `cf.cacheTtl` + `cacheEverything` also stored 4xx/5xx, so one upstream miss
// kept /calendar on 502 for the whole TTL and a retry saw the same failure.
// Successes are cached under a new key. Errors are not cached. A last-good
// copy in the Cache API is served when the source is down.

export const CALENDAR_UPSTREAM = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const CALENDAR_GOOD_CACHE = 'https://cache.tradeos/calendar-week-v2';
export const CALENDAR_TIMEOUT_MS = 8000;

export function calendarTimeoutSignal(ms = CALENDAR_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer?.unref === 'function') timer.unref();
  return controller.signal;
}

export function calendarFetchInit(timeoutMs = CALENDAR_TIMEOUT_MS) {
  return {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TradeOS/1.0 (+https://tradeoslive.web.app)',
    },
    cf: {
      cacheKey: CALENDAR_GOOD_CACHE,
      cacheTtlByStatus: { '200-299': 300 },
    },
    signal: calendarTimeoutSignal(timeoutMs),
  };
}

export function parseCalendarEvents(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(data) || data.length === 0) return null;
  const events = data.filter((row) => row
    && typeof row === 'object'
    && typeof row.title === 'string'
    && row.title.trim()
    && typeof row.date === 'string'
    && row.date);
  return events.length ? events : null;
}

function failureCode(err) {
  const name = String(err?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  if (err?.code === 'upstream' || err?.code === 'shape' || err?.code === 'timeout' || err?.code === 'unavailable') {
    return err.code;
  }
  return 'unavailable';
}

function coded(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export async function readCalendarUpstream(fetchImpl = fetch, init = calendarFetchInit()) {
  let res;
  try {
    res = await fetchImpl(CALENDAR_UPSTREAM, init);
  } catch (err) {
    throw coded(failureCode(err));
  }
  if (!res || !res.ok) throw coded('upstream');
  let text = '';
  try { text = await res.text(); } catch { throw coded('unavailable'); }
  const events = parseCalendarEvents(text);
  if (!events) throw coded('shape');
  return events;
}

async function readGoodCache(cache) {
  if (!cache || typeof cache.match !== 'function') return null;
  try {
    const hit = await cache.match(new Request(CALENDAR_GOOD_CACHE));
    if (!hit) return null;
    return parseCalendarEvents(await hit.text());
  } catch {
    return null;
  }
}

async function writeGoodCache(cache, events) {
  if (!cache || typeof cache.put !== 'function') return;
  try {
    await cache.put(new Request(CALENDAR_GOOD_CACHE), new Response(JSON.stringify(events), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch { /* the live response still succeeds */ }
}

export async function resolveCalendarFeed({ fetchImpl = fetch, cache = null, init } = {}) {
  try {
    const events = await readCalendarUpstream(fetchImpl, init || calendarFetchInit());
    await writeGoodCache(cache, events);
    return { status: 200, events, stale: false };
  } catch (err) {
    const code = failureCode(err);
    const saved = await readGoodCache(cache);
    if (saved) return { status: 200, events: saved, stale: true, error: code };
    return { status: 502, events: null, stale: false, error: code };
  }
}

export function calendarHttpResponse(result, cors) {
  if (result.status === 200) {
    const headers = {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': result.stale ? 'public, max-age=60' : 'public, max-age=300',
      'Access-Control-Expose-Headers': 'X-Calendar-Stale',
    };
    if (result.stale) headers['X-Calendar-Stale'] = '1';
    return new Response(JSON.stringify(result.events), { status: 200, headers });
  }
  return new Response(JSON.stringify({ error: result.error || 'unavailable' }), {
    status: 502,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
