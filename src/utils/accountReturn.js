import { coerceTradeDate } from './tradeDates';
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
  const closed = list.filter(isClosedTrade);
  const totalPnl = closed.reduce((sum, t) => sum + safePnl(t), 0);

  let start = openingClass === 'sane' ? saneBalance(openingBalance) : null;
  let flat = null;
  if (start == null && liveClass === 'sane') {
    const live = saneBalance(fallbackBalance);
    const implied = saneBalance(live - totalPnl);
    if (implied != null) start = implied;
    else flat = live;
  }

  const ordered = [...closed].sort((a, b) => {
    const delta = timeOf(a) - timeOf(b);
    if (delta) return delta;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });

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

/** Balance to pass into tradeShownPercent for one row. 0 keeps position mode. */
export function balanceForTrade(book, trade) {
  if (!book || book.mode === 'position') return 0;
  if (!trade) return book.current ?? null;
  const balance = book.byId.get(trade.id);
  return balance == null ? null : balance;
}
