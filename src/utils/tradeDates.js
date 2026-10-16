// Entry/exit instants for a trade. Firestore sends Timestamps (toDate),
// sometimes a plain {seconds} / {_seconds} object, sometimes ISO strings,
// and sometimes a number of SECONDS. `new Date(null)` and `new Date(seconds)`
// both land on 01/01/1970 — the share card used to show that whenever the
// entry field was empty or stored in seconds.

const YEAR_2000 = Date.UTC(2000, 0, 1);

/** Date, or null when the value is missing, invalid, or the Unix epoch. */
export function coerceTradeDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return realTradeDate(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    // 1e11 ms is 1973; modern timestamps in ms are ~1e12. Below that a
    // positive number is seconds (a 2026 instant in seconds is ~1.8e9,
    // which `new Date` reads as January 1970).
    const ms = value < 1e11 ? value * 1000 : value;
    return realTradeDate(new Date(ms));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return coerceTradeDate(Number(trimmed));
    return realTradeDate(new Date(trimmed));
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try { return realTradeDate(value.toDate()); } catch { return null; }
    }
    if (typeof value.seconds === 'number') return coerceTradeDate(value.seconds);
    if (typeof value._seconds === 'number') return coerceTradeDate(value._seconds);
  }
  return null;
}

function realTradeDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (date.getTime() < YEAR_2000) return null;
  return date;
}

function earliest(dates) {
  const real = dates.filter(Boolean);
  if (!real.length) return null;
  return real.sort((a, b) => a.getTime() - b.getTime())[0];
}

function latest(dates) {
  const real = dates.filter(Boolean);
  if (!real.length) return null;
  return real.sort((a, b) => b.getTime() - a.getTime())[0];
}

/** The trade's real entry. Falls back to the first fill, then createdAt. */
export function tradeEntryDate(trade) {
  const direct = coerceTradeDate(trade?.entryDate);
  if (direct) return direct;
  const fills = Array.isArray(trade?.entries) ? trade.entries.map((f) => coerceTradeDate(f?.date)) : [];
  return earliest(fills) || coerceTradeDate(trade?.createdAt);
}

/** The trade's real exit. Falls back to the latest recorded exit row. */
export function tradeExitDate(trade) {
  const direct = coerceTradeDate(trade?.exitDate);
  if (direct) return direct;
  const rows = Array.isArray(trade?.exits) ? trade.exits.map((e) => coerceTradeDate(e?.date)) : [];
  return latest(rows);
}
