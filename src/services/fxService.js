// USD/ILS representative rates (Bank of Israel) via the worker's /fx/usdils.
// → { rates: { 'YYYY-MM-DD': 3.65 }, fallback: [days from Yahoo], source }
//
// A closed year never changes, so its rates are also kept in localStorage —
// reopening last year's report costs no request. The current year is cached
// in memory only (a new rate is published every business day).

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
const LS_PREFIX = 'tradeos_fx_usdils_v1:';
const memory = new Map();

const readLs = (key) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeLs = (key, data) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(data)); } catch { /* quota / private mode */ }
};

export async function fetchUsdIlsRates(from, to, { signal } = {}) {
  const key = `${from}_${to}`;
  if (memory.has(key)) return memory.get(key);
  const closedRange = to < new Date().toISOString().slice(0, 10);
  if (closedRange) {
    const cached = readLs(key);
    if (cached?.rates) { memory.set(key, cached); return cached; }
  }

  const res = await fetch(`${WORKER_URL}/fx/usdils?from=${from}&to=${to}`, { signal });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !body?.rates) throw new Error(body?.error || 'לא ניתן לטעון שערי דולר כרגע');

  const data = { rates: body.rates, fallback: Array.isArray(body.fallback) ? body.fallback : [], source: body.source || 'boi' };
  memory.set(key, data);
  // Only persist a closed range that came fully from the official source —
  // a fallback answer should be retried against BOI next time.
  if (closedRange && data.fallback.length === 0) writeLs(key, data);
  return data;
}
