import { initialRiskUsd, signedTradeR } from './calculations';
import { computeDashboardStats, sliceTradesForStats } from './dashboardStats';

/**
 * Public-API stats for one journal and period.
 *
 * Return % is the dashboard's balance change: net P&L ÷ the account equity
 * the period opened at (journal initialBalance, plus P&L booked before the
 * window). It is never P&L ÷ position notional. With no opening balance the
 * percent is null — a zero balance must not be reported as 0% or as a
 * return on the position.
 *
 * riskAmount is the sum of each closed trade's real dollar risk
 * (initialRiskUsd): |entry − stop| × size, falling back to a declared
 * riskAmount only when the stop cannot price it. A stored riskAmount of 0
 * does not hide a risk the entry, stop and size already define.
 *
 * avgR is the journal header "R ממוצע": mean signed net R of closed trades
 * that had a defined risk. Null when none of them did.
 */
export function computeApiStats(trades, initialBalance = 0, { period = 'all', from = null, to = null, now = new Date() } = {}) {
  const options = { from, to, now };
  const opening = Number(initialBalance) || 0;
  const dash = computeDashboardStats(trades, opening, period, options);
  const { closed, prePeriodPnl } = sliceTradesForStats(trades, period, options);
  const startBalance = opening + prePeriodPnl;
  const breakeven = closed.filter((t) => t.result === 'breakeven').length;
  const riskAmount = closed.reduce((sum, t) => sum + initialRiskUsd(t), 0);
  const rs = closed.map((t) => signedTradeR(t)).filter((r) => r != null);
  const pf = dash.profitFactor;
  const returnPercent = opening > 0 && startBalance > 0 ? (dash.totalPnL / startBalance) * 100 : null;

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
  };
}
