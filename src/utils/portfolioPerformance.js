import { saneBalance, winRateOf } from './calculations';
import { getPeriodStart } from './period';
import { measureAccountReturn } from './accountReturn';

// Home week/month use the journal's windows (local midnight), not a raw
// 7×24h / 30×24h slice, so the same period is the same set of trades.
const WINDOWED = new Set(['week', 'month']);

/**
 * P&L over a sane balance. Null when the base is missing, zero, negative,
 * or dust. The home card does not call this: its percent is
 * `measureAccountReturn`, which also drops P&L booked after a wipe.
 */
export function tradingReturnPercent(pnl, capital) {
  const base = saneBalance(capital);
  const p = pnl == null || pnl === '' ? 0 : Number(pnl);
  if (base == null || !Number.isFinite(p)) return null;
  return (p / base) * 100;
}

/** Sum of journal opening balances the user actually saved (> 0). */
export function declaredStartCapital(journals) {
  return (journals || []).reduce((sum, j) => {
    const n = Number(j?.initialBalance);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function seriesTrades(series) {
  return (series || []).map((p, i) => ({
    id: p.id != null ? String(p.id) : `series-${i}`,
    status: 'closed',
    netPnl: Number(p.pnl) || 0,
    pnl: Number(p.pnl) || 0,
    exitDate: p.t,
    balanceBefore: p.balanceBefore,
    accountBalance: p.accountBalance,
    equityBefore: p.equityBefore,
  }));
}

/**
 * P&L and % for the home portfolio card.
 *
 * The % is `measureAccountReturn` on this book — the same helper as the
 * journal header and the analytics tab. Deposits and withdrawals move
 * `equity` and stay out of the percent when an opening balance was saved.
 * With no opening balance, the base is the wallet minus closed-trade P&L.
 * A zero, negative, or dust wallet is not a denominator.
 * `pnl` is the same sum the card prints as רווח/הפסד (every closed trade
 * in the window, including P&L the percent leaves out after a wipe).
 *
 * `trades`, when passed, are the closed trades behind `series` (snapshots
 * included). Otherwise each point is treated as one closed trade.
 *
 * series: [{ t, pnl, value }] oldest → newest, value = running closed P&L.
 */
export function summarizeSeries(series, period, { declaredStart = 0, equity = null, now = Date.now(), trades = null } = {}) {
  const list = series || [];
  const clock = now instanceof Date ? now : new Date(now);
  const periodKey = WINDOWED.has(period) ? period : 'all';
  const periodStart = getPeriodStart(periodKey, Number.isNaN(clock.getTime()) ? new Date() : clock);
  const from = periodStart ? periodStart.getTime() : 0;
  const inRange = list.filter((p) => p.t >= from);
  const pnl = inRange.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const returnTrades = Array.isArray(trades) ? trades : seriesTrades(list);
  const measured = measureAccountReturn(returnTrades, {
    openingBalance: declaredStart,
    fallbackBalance: equity,
    period: periodKey,
    now: clock,
  });
  const capital = measured.capital ?? 0;

  let points;
  if (periodStart) {
    let acc = 0;
    points = [{ t: from, value: 0 }, ...inRange.map((p) => ({ t: p.t, value: (acc += Number(p.pnl) || 0) }))];
  } else {
    points = list.length ? [{ t: list[0].t, value: 0 }, ...list.map((p) => ({ t: p.t, value: p.value }))] : [];
  }

  const wins = inRange.filter((p) => p.pnl > 0).length;
  const losses = inRange.filter((p) => p.pnl < 0).length;
  const dayStart = new Date(clock.getTime());
  dayStart.setHours(0, 0, 0, 0);
  const today = list.filter((p) => p.t >= dayStart.getTime()).reduce((s, p) => s + (Number(p.pnl) || 0), 0);

  return {
    pnl,
    percent: measured.percent,
    capital,
    count: inRange.length,
    winRate: inRange.length ? Math.round(winRateOf(wins, losses)) : null,
    today,
    points,
  };
}
