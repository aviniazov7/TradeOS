import { coerceTradeDate } from './tradeDates';
import { getPeriodStart } from './period';
import { isClosedTrade, safePnl, saneBalance, tradeAccountPercent } from './calculations';

// A stored balance from before this trade wins over a reconstructed one.
// Importers and manual edits can set any of these; absent means "unknown".
const SNAPSHOT_KEYS = ['balanceBefore', 'accountBalance', 'equityBefore'];

function providedClass(value, { zeroIsMissing }) {
  if (value == null || value === '') return 'missing';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'missing';
  if (n === 0) return zeroIsMissing ? 'missing' : 'unusable';
  return saneBalance(n) == null ? 'unusable' : 'sane';
}

function timeOf(trade) {
  return coerceTradeDate(trade?.exitDate)?.getTime()
    || coerceTradeDate(trade?.entryDate)?.getTime()
    || 0;
}

/** Close time used to order the book and to cut a week/month/year window. */
export function accountTradeTime(trade) {
  return timeOf(trade);
}

function orderedClosed(trades) {
  return (Array.isArray(trades) ? trades : []).filter(isClosedTrade).sort((a, b) => {
    const delta = timeOf(a) - timeOf(b);
    if (delta) return delta;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}

/** Sane balance stored on the trade itself, or null. */
export function tradeBalanceSnapshot(trade) {
  if (!trade || typeof trade !== 'object') return null;
  for (const key of SNAPSHOT_KEYS) {
    const n = saneBalance(trade[key]);
    if (n != null) return n;
  }
  return null;
}

/**
 * Balance before each trade, and how the journal should label the column.
 *
 * `mode`:
 *   - `account` — a sane opening balance, a sane live wallet, or a per-trade
 *     snapshot. Rows use that balance; a row without one shows "—".
 *   - `unavailable` — a balance was reported but it is zero, negative, or
 *     dust. Every row shows "—". Do not fall back to the position percent.
 *   - `position` — no account balance was set. Callers keep "% נטו".
 *
 * Closed trades walk in close order. The start is the journal opening
 * balance when that is sane. Otherwise, when the live wallet is sane, the
 * start is that wallet minus closed P&L (cashflows stay in the base). When
 * that implied start is not sane either, every row uses the live wallet
 * itself. A dust or empty wallet is never the denominator.
 *
 * `basis` is the book's starting balance (the header divides measurable P&L
 * by it). `current` is the equity after the closed trades, for a new ticket.
 */
export function buildAccountReturnBook(trades, { openingBalance = 0, fallbackBalance = null } = {}) {
  const list = Array.isArray(trades) ? trades : [];
  const openingClass = providedClass(openingBalance, { zeroIsMissing: true });
  const liveClass = providedClass(fallbackBalance, { zeroIsMissing: false });
  const ordered = orderedClosed(list);
  const totalPnl = ordered.reduce((sum, t) => sum + safePnl(t), 0);

  let start = openingClass === 'sane' ? saneBalance(openingBalance) : null;
  let flat = null;
  if (start == null && liveClass === 'sane') {
    const live = saneBalance(fallbackBalance);
    const implied = saneBalance(live - totalPnl);
    if (implied != null) start = implied;
    else flat = live;
  }

  const byId = new Map();
  let running = start;
  for (const t of ordered) {
    const snap = tradeBalanceSnapshot(t);
    let base = snap;
    if (base == null && running != null) base = saneBalance(running);
    if (base == null && flat != null) base = flat;
    byId.set(t.id, base ?? null);
    if (snap != null) {
      running = saneBalance(snap + safePnl(t));
      flat = null;
    } else if (running != null) {
      running = saneBalance(running + safePnl(t));
    }
  }

  const current = running != null ? saneBalance(running) : flat;
  for (const t of list) {
    if (byId.has(t.id)) continue;
    byId.set(t.id, tradeBalanceSnapshot(t) ?? current ?? null);
  }

  const anySnapshot = list.some((t) => tradeBalanceSnapshot(t) != null);
  let mode = 'position';
  if (openingClass === 'sane' || liveClass === 'sane' || anySnapshot) mode = 'account';
  else if (openingClass === 'unusable' || liveClass === 'unusable') mode = 'unavailable';

  return {
    byId,
    basis: start ?? flat ?? null,
    // A real start walks forward. A flat live wallet is the denominator of
    // every row and does not move when earlier P&L is added back.
    anchored: start != null,
    current: current ?? null,
    mode,
  };
}

/** Closed P&L of trades that have a usable balance, divided by the book start. */
export function portfolioReturnPercent(trades, book) {
  const basis = saneBalance(book?.basis);
  if (basis == null) return null;
  let pnl = 0;
  let count = 0;
  for (const t of (trades || []).filter(isClosedTrade)) {
    if (saneBalance(book.byId.get(t.id)) == null) continue;
    pnl += safePnl(t);
    count += 1;
  }
  if (!count) return null;
  return (pnl / basis) * 100;
}

/**
 * Mean of per-trade account returns. Trades with no usable balance are
 * left out — they must not pull the average.
 */
export function averageAccountReturn(trades, book) {
  const pcts = [];
  for (const t of (trades || []).filter(isClosedTrade)) {
    const pct = tradeAccountPercent(t, book?.byId?.get(t.id));
    if (pct != null) pcts.push(pct);
  }
  if (!pcts.length) return null;
  return pcts.reduce((sum, n) => sum + n, 0) / pcts.length;
}

/**
 * Header "על היתרה": measurable closed P&L over the book's starting balance.
 * With no single basis (only per-trade snapshots), the mean of those
 * returns. null when nothing can be measured.
 */
export function summaryAccountReturn(trades, book) {
  if (!book || book.mode === 'position') return null;
  const portfolio = portfolioReturnPercent(trades, book);
  if (portfolio != null) return portfolio;
  return averageAccountReturn(trades, book);
}

function asDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The window the journal's period control uses (midnight local, rolling
 * 7 days / 1 month / 1 year). A caller that already resolved `from` / `to`
 * passes `window` and that wins over the named period.
 */
function resolveBounds({ period = 'all', now = new Date(), window = null } = {}, useWindow) {
  if (useWindow) {
    return { start: asDate(window?.start), end: asDate(window?.end) };
  }
  const clock = asDate(now) || new Date();
  return { start: getPeriodStart(period, clock), end: null };
}

function inBounds(trade, start, end) {
  const ts = timeOf(trade);
  if (start && ts < start.getTime()) return false;
  if (end && ts > end.getTime()) return false;
  return true;
}

/**
 * Return % for one account over a period, plus the denominator.
 *
 * All-time is `summaryAccountReturn`: measurable closed P&L over the book's
 * starting balance (or the mean of per-trade returns when only snapshots
 * exist). A week/month/year uses that same book, but the denominator is the
 * balance the window opened at — the start walked forward by measurable
 * P&L booked before the window. A saved opening is that start, so deposits
 * and withdrawals are not part of the percent. With no opening, the start
 * is the live wallet minus closed P&L and cashflows stay in the base.
 * P&L taken after the balance was wiped out is left out. The percent is
 * null when the denominator is missing, zero, negative, or dust.
 */
export function measureAccountReturn(trades, options = {}) {
  const list = Array.isArray(trades) ? trades : [];
  const built = options.book || buildAccountReturnBook(list, {
    openingBalance: options.openingBalance ?? 0,
    fallbackBalance: options.fallbackBalance ?? null,
  });
  const useWindow = options.window !== undefined;
  const bounds = resolveBounds(options, useWindow);
  if (!bounds.start && !bounds.end) {
    return { percent: summaryAccountReturn(list, built), capital: saneBalance(built?.basis) };
  }
  if (!built || built.mode === 'position') return { percent: null, capital: null };

  const ordered = orderedClosed(list);
  const periodTrades = ordered.filter((t) => inBounds(t, bounds.start, bounds.end));
  const basis = saneBalance(built.basis);
  if (basis == null) {
    return { percent: averageAccountReturn(periodTrades, built), capital: null };
  }

  let capital = basis;
  if (built.anchored && bounds.start) {
    let running = basis;
    for (const t of ordered) {
      if (timeOf(t) >= bounds.start.getTime()) break;
      const before = saneBalance(built.byId.get(t.id));
      running = before == null ? null : saneBalance(before + safePnl(t));
    }
    capital = running;
  }
  if (saneBalance(capital) == null) return { percent: null, capital: null };

  let pnl = 0;
  let count = 0;
  for (const t of periodTrades) {
    if (saneBalance(built.byId.get(t.id)) == null) continue;
    pnl += safePnl(t);
    count += 1;
  }
  if (!count) return { percent: null, capital };
  return { percent: (pnl / capital) * 100, capital };
}

/** The percent `measureAccountReturn` would show. Null when it cannot. */
export function accountPeriodReturn(trades, options = {}) {
  return measureAccountReturn(trades, options).percent;
}

/** Balance to pass into tradeShownPercent for one row. 0 keeps position mode. */
export function balanceForTrade(book, trade) {
  if (!book || book.mode === 'position') return 0;
  if (!trade) return book.current ?? null;
  const balance = book.byId.get(trade.id);
  return balance == null ? null : balance;
}
