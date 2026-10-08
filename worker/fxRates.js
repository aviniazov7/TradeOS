// USD/ILS representative rates ("שער יציג") for the tax report.
//
// GET /fx/usdils?from=YYYY-MM-DD&to=YYYY-MM-DD
//   → { from, to, source, rates: { 'YYYY-MM-DD': 3.65, ... }, fallback: [days] }
//
// Primary source: Bank of Israel's public SDMX API (official representative
// rate, published once per Israeli business day). Fallback: Yahoo USDILS=X
// daily closes — used only for a calendar year BOI couldn't serve, and every
// day that came from Yahoo is listed in `fallback` so the UI can say so.
//
// Rates are fetched and cached PER CALENDAR YEAR in caches.default (never KV —
// quota): a closed year never changes (30 days), the current year refreshes
// every few hours. Days without a rate (weekends, Israeli holidays) are simply
// absent; the client picks the nearest previous business day.

const BOI_URL = (from, to) => (
  'https://edge.boi.org.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS'
  + `?startperiod=${from}&endperiod=${to}&format=csv`
);
const YAHOO_URL = (p1, p2) => (
  `https://query1.finance.yahoo.com/v8/finance/chart/USDILS=X?interval=1d&period1=${p1}&period2=${p2}`
);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEARS = 3; // a tax report needs one year (+ a few days before it)
const UPSTREAM_TIMEOUT_MS = 12000;

const isValidDay = (s) => {
  if (!DAY_RE.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// A sane USD/ILS value — guards against a malformed row poisoning the cache.
const isSaneRate = (r) => Number.isFinite(r) && r > 1 && r < 10;

/** Parse BOI's SDMX CSV → { 'YYYY-MM-DD': rate }. Column positions come from the header row. */
export function parseBoiCsv(text) {
  const out = {};
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return out;
  const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const iDate = header.indexOf('TIME_PERIOD');
  const iVal = header.indexOf('OBS_VALUE');
  if (iDate < 0 || iVal < 0) return out;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const day = (cells[iDate] || '').trim();
    const rate = parseFloat(cells[iVal]);
    if (isValidDay(day) && isSaneRate(rate)) out[day] = rate;
  }
  return out;
}

/**
 * Parse Yahoo's chart JSON → { 'YYYY-MM-DD': close }. A daily bar's timestamp
 * is midnight in the exchange's timezone (Europe/London for FX), so the date
 * is read in THAT zone — reading it in UTC shifts BST days one day back.
 */
export function parseYahooChart(json) {
  const out = {};
  const res = json?.chart?.result?.[0];
  const ts = res?.timestamp;
  const closes = res?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return out;
  const tz = res?.meta?.exchangeTimezoneName || 'Europe/London';
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  for (let i = 0; i < ts.length; i++) {
    const rate = Number(closes[i]);
    if (!isSaneRate(rate)) continue;
    const day = fmt.format(new Date(ts[i] * 1000));
    if (isValidDay(day)) out[day] = Math.round(rate * 10000) / 10000;
  }
  return out;
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
}

async function fetchBoiYear(year) {
  const r = await fetchWithTimeout(BOI_URL(`${year}-01-01`, `${year}-12-31`), {
    headers: { Accept: 'text/csv', 'User-Agent': 'Mozilla/5.0 TradeOS' },
  });
  if (!r.ok) throw new Error(`BOI ${r.status}`);
  const rates = parseBoiCsv(await r.text());
  if (!Object.keys(rates).length) throw new Error('BOI empty');
  return rates;
}

async function fetchYahooYear(year) {
  const p1 = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const p2 = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
  const r = await fetchWithTimeout(YAHOO_URL(p1, p2), {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const rates = parseYahooChart(await r.json());
  if (!Object.keys(rates).length) throw new Error('Yahoo empty');
  return rates;
}

const cacheReq = (kind, year) => new Request(`https://cache.tradeos.internal/fx/usdils/${kind}/${year}`);

async function cacheGet(kind, year) {
  try {
    const hit = await caches.default.match(cacheReq(kind, year));
    return hit ? await hit.json() : null;
  } catch { return null; }
}

async function cachePut(kind, year, data, maxAge) {
  try {
    await caches.default.put(cacheReq(kind, year), new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` },
    }));
  } catch { /* cache is best-effort */ }
}

/**
 * One calendar year of rates: { rates, source: 'boi' | 'yahoo' | null }.
 * BOI first (fresh cache → network → stale cache), then Yahoo.
 */
async function getYear(year, currentYear) {
  const closed = year < currentYear;
  const boiCached = await cacheGet('boi', year);
  if (boiCached) return { rates: boiCached, source: 'boi' };
  try {
    const rates = await fetchBoiYear(year);
    await cachePut('boi', year, rates, closed ? 30 * 86400 : 4 * 3600);
    await cachePut('boi-stale', year, rates, 30 * 86400);
    return { rates, source: 'boi' };
  } catch (err) {
    console.warn('fx: BOI failed for', year, err?.message || err);
  }
  const stale = await cacheGet('boi-stale', year);
  if (stale) return { rates: stale, source: 'boi' };

  const yCached = await cacheGet('yahoo', year);
  if (yCached) return { rates: yCached, source: 'yahoo' };
  try {
    const rates = await fetchYahooYear(year);
    await cachePut('yahoo', year, rates, 3600);
    return { rates, source: 'yahoo' };
  } catch (err) {
    console.warn('fx: Yahoo failed for', year, err?.message || err);
  }
  return { rates: {}, source: null };
}

/** Validate ?from/?to. Returns { from, to } or { error }. */
export function parseRange(searchParams, today = new Date()) {
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  if (!isValidDay(from) || !isValidDay(to)) return { error: 'from/to must be YYYY-MM-DD' };
  if (from > to) return { error: 'from must be before to' };
  const fy = Number(from.slice(0, 4));
  const ty = Number(to.slice(0, 4));
  if (fy < MIN_YEAR) return { error: `from must be ${MIN_YEAR} or later` };
  if (ty > today.getUTCFullYear() + 1) return { error: 'to is too far in the future' };
  if (ty - fy + 1 > MAX_YEARS) return { error: `range is limited to ${MAX_YEARS} calendar years` };
  return { from, to };
}

export async function handleFxUsdIls(url, cors) {
  const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
  const range = parseRange(url.searchParams);
  if (range.error) return json({ error: range.error }, 400);
  const { from, to } = range;

  const currentYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  const parts = await Promise.all(years.map((y) => getYear(y, currentYear)));

  const rates = {};
  const fallback = [];
  const sources = new Set();
  parts.forEach(({ rates: yr, source }) => {
    if (source) sources.add(source);
    for (const [day, rate] of Object.entries(yr)) {
      if (day < from || day > to) continue;
      rates[day] = rate;
      if (source === 'yahoo') fallback.push(day);
    }
  });
  if (!Object.keys(rates).length) {
    return json({ error: 'אין כרגע נתוני שער דולר — נסה שוב מאוחר יותר' }, 502);
  }
  fallback.sort();
  const source = sources.size > 1 ? 'boi+yahoo' : [...sources][0];
  // Short browser cache: the worker's own per-year cache does the heavy lifting.
  return json({ from, to, source, rates, fallback }, 200, { 'Cache-Control': 'public, max-age=1800' });
}
