import { winRateOf } from './calculations';

const DAY = 86400000;

// Same windows as the home portfolio card: rolling 7 / 30 days, or everything.
const PERIOD_DAYS = { week: 7, month: 30, all: null };

/** Closed-trade return on capital. Null when there is no positive base. */
export function tradingReturnPercent(pnl, capital) {
  const base = Number(capital);
  const p = Number(pnl) || 0;
  if (!Number.isFinite(base) || !(base > 0) || !Number.isFinite(p)) return null;
  return (p / base) * 100;
}

/** Sum of journal opening balances the user actually saved (> 0). */
export function declaredStartCapital(journals) {
  return (journals || []).reduce((sum, j) => {
    const n = Number(j?.initialBalance);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/**
 * P&L and % for the home portfolio card.
 *
 * The % is trading performance for that window, not the change in the wallet.
 * Deposits and withdrawals move `equity` and are left out:
 *   • a saved opening balance is the capital base (plus P&L already booked
 *     before a week/month window);
 *   • with no opening balance, the base is the wallet minus closed-trade P&L,
 *     so cashflows sit in the base instead of the return.
 * `pnl` is the same sum the card prints as רווח/הפסד.
 *
 * series: [{ t, pnl, value }] oldest → newest, value = running closed P&L.
 */
export function summarizeSeries(series, period, { declaredStart = 0, equity = null, now = Date.now() } = {}) {
  const list = series || [];
  const days = PERIOD_DAYS[period] === undefined ? PERIOD_DAYS.all : PERIOD_DAYS[period];
  const from = days ? now - days * DAY : 0;
  const inRange = list.filter((p) => p.t >= from);
  const pnl = inRange.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const all = list.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const pre = all - pnl;

  const declared = Number(declaredStart);
  // null / undefined means "no wallet figure", not a $0 account.
  const equityNow = equity == null || equity === '' ? NaN : Number(equity);
  let capital = 0;
  if (Number.isFinite(declared) && declared > 0) {
    capital = declared + (days ? pre : 0);
  } else if (Number.isFinite(equityNow)) {
    // equity = (opening + net deposits/withdrawals + unrealized) + all closed P&L.
    // Subtracting closed P&L leaves the cashflows in the base.
    capital = (equityNow - all) + (days ? pre : 0);
  }

  let points;
  if (days) {
    let acc = 0;
    points = [{ t: from, value: 0 }, ...inRange.map((p) => ({ t: p.t, value: (acc += Number(p.pnl) || 0) }))];
  } else {
    points = list.length ? [{ t: list[0].t, value: 0 }, ...list.map((p) => ({ t: p.t, value: p.value }))] : [];
  }

  const wins = inRange.filter((p) => p.pnl > 0).length;
  const losses = inRange.filter((p) => p.pnl < 0).length;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const today = list.filter((p) => p.t >= dayStart.getTime()).reduce((s, p) => s + (Number(p.pnl) || 0), 0);

  return {
    pnl,
    percent: tradingReturnPercent(pnl, capital),
    capital,
    count: inRange.length,
    winRate: inRange.length ? Math.round(winRateOf(wins, losses)) : null,
    today,
    points,
  };
}
