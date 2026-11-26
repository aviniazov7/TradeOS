import { calculateMaxStreaks, initialRiskUsd, safePnl, signedTradeR, winRateOf } from './calculations';
import { computeDashboardStats, sliceTradesForStats, windowBounds } from './dashboardStats';
import { jerusalemMinutes } from './journalRiskRules.js';
import { getSessionFromDate, SESSION_UNKNOWN } from './sessions.js';
import { effectiveSetups } from './setupStats.js';

const GROUP_BY = new Set(['session', 'setup', 'weekday', 'hour']);

export function parseGroupBy(raw) {
  if (raw == null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string' || !GROUP_BY.has(raw.trim())) {
    return { ok: false, error: 'groupBy must be session, setup, weekday, or hour' };
  }
  return { ok: true, value: raw.trim() };
}

function instantOf(raw) {
  if (raw == null || raw === '') return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jerusalemWeekday(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);
}

function groupKeys(trade, groupBy, mode) {
  if (groupBy === 'session') {
    if (mode === 'backtest') return [trade.session || 'לא ידוע'];
    const stored = typeof trade.session === 'string' ? trade.session.trim() : '';
    if (stored) return [stored];
    const instant = instantOf(trade.entryDate || trade.exitDate);
    return [instant ? getSessionFromDate(instant, { fallback: SESSION_UNKNOWN }) : SESSION_UNKNOWN];
  }
  if (groupBy === 'setup') {
    if (mode === 'backtest') return [trade.strategy || 'ללא אסטרטגיה'];
    // Stored setups win. A trade written after the form dropped that field
    // has none, so the entry trigger is the one key. Both empty → ללא סטאפ.
    const setups = effectiveSetups(trade);
    return setups.length ? setups : ['ללא סטאפ'];
  }
  const instant = instantOf(mode === 'backtest'
    ? (trade.date || trade.createdAt)
    : (trade.entryDate || trade.exitDate));
  if (!instant) return ['(no date)'];
  if (groupBy === 'weekday') return [jerusalemWeekday(instant)];
  const minutes = jerusalemMinutes(instant);
  return [minutes == null ? '(no date)' : String(Math.floor(minutes / 60)).padStart(2, '0')];
}

/**
 * One bucket per session, setup, weekday, or hour.
 * A live trade with several stored setups is counted in each. A live trade
 * with no stored setups is counted once under its entry trigger. Weekday and hour use
 * Asia/Jerusalem. Live groups are closed trades; backtest groups are the
 * rows in the stats window. Dollar P&L is null for backtests.
 */
export function groupTradeStats(trades, groupBy, mode) {
  const buckets = new Map();
  for (const trade of trades || []) {
    for (const key of groupKeys(trade, groupBy, mode)) {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, count: 0, wins: 0, losses: 0, breakeven: 0, pnl: 0, rSum: 0, rCount: 0 };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (trade.result === 'win') bucket.wins += 1;
      else if (trade.result === 'loss') bucket.losses += 1;
      else if (trade.result === 'breakeven') bucket.breakeven += 1;
      if (mode === 'backtest') {
        const r = Number(trade.rResult);
        bucket.rSum += Number.isFinite(r) ? r : 0;
        bucket.rCount += 1;
      } else {
        bucket.pnl += safePnl(trade);
        const r = signedTradeR(trade);
        if (r != null) {
          bucket.rSum += r;
          bucket.rCount += 1;
        }
      }
    }
  }
  return [...buckets.values()]
    .sort((a, b) => (b.count - a.count) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((bucket) => ({
      key: bucket.key,
      count: bucket.count,
      wins: bucket.wins,
      losses: bucket.losses,
      breakeven: bucket.breakeven,
      winRate: winRateOf(bucket.wins, bucket.losses),
      totalPnl: mode === 'backtest' ? null : Math.round(bucket.pnl * 100) / 100,
      totalR: mode === 'backtest' ? bucket.rSum : (bucket.rCount ? bucket.rSum : null),
      avgR: bucket.rCount ? bucket.rSum / bucket.rCount : null,
    }));
}

/**
 * Public-API stats for one journal and period.
 *
 * Return % is the journal's account return (`accountPeriodReturn`): measurable
 * closed P&L over the balance the period opened at. Trades taken after that
 * balance was wiped out are left out. It is never P&L ÷ position notional.
 * The percent is null when that balance is missing, zero, negative, or dust
 * (a withdrawn MEXC wallet can still report ~1e-8). That is not a 0% return
 * and not a return on the position.
 *
 * riskAmount is the sum of each closed trade's real dollar risk
 * (initialRiskUsd): |entry − stop| × size, falling back to a declared
 * riskAmount only when the stop cannot price it. A stored riskAmount of 0
 * does not hide a risk the entry, stop and size already define.
 *
 * avgR is the journal header "R ממוצע": mean signed net R of closed trades
 * that had a defined risk. Null when none of them did.
 */
export function computeApiStats(trades, initialBalance = 0, { period = 'all', from = null, to = null, now = new Date(), groupBy = '' } = {}) {
  const options = { from, to, now };
  const opening = Number(initialBalance) || 0;
  const dash = computeDashboardStats(trades, opening, period, options);
  const { closed, prePeriodPnl } = sliceTradesForStats(trades, period, options);
  const startBalance = opening + prePeriodPnl;
  const breakeven = closed.filter((t) => t.result === 'breakeven').length;
  const riskAmount = closed.reduce((sum, t) => sum + initialRiskUsd(t), 0);
  const rs = closed.map((t) => signedTradeR(t)).filter((r) => r != null);
  const pf = dash.profitFactor;
  const returnPercent = dash.balanceChangePercent;

  return {
    period: from != null || to != null ? 'custom' : (period || 'all'),
    from: from ?? null,
    to: to ?? null,
    initialBalance: opening,
    counts: {
      total: dash.totalTrades + dash.openCount,
      closed: dash.totalTrades,
      open: dash.openCount,
      partial: dash.partialCount,
      wins: dash.winCount,
      losses: dash.lossCount,
      breakeven,
    },
    winRate: dash.winRate,
    totalPnl: dash.totalPnL,
    startBalance,
    currentBalance: dash.currentBalance,
    returnPercent,
    riskAmount,
    profitFactor: Number.isFinite(pf) ? pf : null,
    profitFactorInfinite: pf === Infinity,
    expectancy: dash.expectancy,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    maxDrawdown: dash.maxDrawdown,
    maxDrawdownAmount: dash.maxDrawdownAbsolute,
    ...(groupBy ? { groupBy, groups: groupTradeStats(closed, groupBy, 'live') } : {}),
  };
}

function backtestMillis(trade) {
  const raw = trade?.date || trade?.createdAt || '';
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function rResultOf(trade) {
  const n = Number(trade?.rResult);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stats for one backtest journal.
 *
 * Backtest rows store an R result (`rResult`), not dollar P&L, and the
 * journal has no opening balance. Dollar fields from the live stats object
 * are null. `avgR` is the backtest screen's mean R (missing `rResult`
 * counts as 0). `profitFactor` is that screen's R profit factor. `avgR` is
 * null when the window has no trades.
 */
export function computeBacktestApiStats(trades, { period = 'all', from = null, to = null, now = new Date(), groupBy = '' } = {}) {
  const list = Array.isArray(trades) ? trades : [];
  const { periodStart, periodEnd } = windowBounds(period, { from, to, now });
  const filtered = (!periodStart && !periodEnd)
    ? list
    : list.filter((trade) => {
      const ms = backtestMillis(trade);
      if (ms == null) return false;
      if (periodStart && ms < periodStart.getTime()) return false;
      if (periodEnd && ms > periodEnd.getTime()) return false;
      return true;
    });

  const wins = filtered.filter((trade) => trade.result === 'win').length;
  const losses = filtered.filter((trade) => trade.result === 'loss').length;
  const breakeven = filtered.filter((trade) => trade.result === 'breakeven').length;
  const rs = filtered.map(rResultOf);
  const totalR = rs.reduce((sum, r) => sum + r, 0);
  const positive = rs.filter((r) => r > 0).reduce((sum, r) => sum + r, 0);
  const negative = Math.abs(rs.filter((r) => r < 0).reduce((sum, r) => sum + r, 0));
  const profitFactorR = negative > 0 ? positive / negative : positive > 0 ? Infinity : 0;
  const ordered = [...filtered].sort((a, b) => (backtestMillis(a) ?? 0) - (backtestMillis(b) ?? 0));
  const streaks = calculateMaxStreaks(ordered);
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const trade of ordered) {
    equity += rResultOf(trade);
    if (equity > peak) peak = equity;
    if (peak - equity > maxDrawdownR) maxDrawdownR = peak - equity;
  }

  return {
    type: 'backtest',
    isBacktest: true,
    period: from != null || to != null ? 'custom' : (period || 'all'),
    from: from ?? null,
    to: to ?? null,
    initialBalance: null,
    counts: {
      total: filtered.length,
      closed: filtered.length,
      open: 0,
      partial: 0,
      wins,
      losses,
      breakeven,
    },
    winRate: winRateOf(wins, losses),
    totalPnl: null,
    totalR,
    startBalance: null,
    currentBalance: null,
    returnPercent: null,
    riskAmount: null,
    profitFactor: Number.isFinite(profitFactorR) ? profitFactorR : null,
    profitFactorInfinite: profitFactorR === Infinity,
    expectancy: null,
    avgR: filtered.length ? totalR / filtered.length : null,
    bestR: filtered.length ? Math.max(...rs) : null,
    worstR: filtered.length ? Math.min(...rs) : null,
    maxWinStreak: streaks.maxWin,
    maxLossStreak: streaks.maxLoss,
    maxDrawdown: null,
    maxDrawdownAmount: null,
    maxDrawdownR,
    ...(groupBy ? { groupBy, groups: groupTradeStats(filtered, groupBy, 'backtest') } : {}),
  };
}
