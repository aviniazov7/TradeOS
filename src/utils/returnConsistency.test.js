import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountPeriodReturn,
  accountTradeTime,
  buildAccountReturnBook,
  summaryAccountReturn,
} from './accountReturn';
import { computeApiStats } from './apiStats';
import { computeDashboardStats } from './dashboardStats';
import { getPeriodStart } from './period';
import { summarizeSeries } from './portfolioPerformance';

const closed = (id, netPnl, exitDate, extra = {}) => ({
  id,
  status: 'closed',
  result: netPnl > 0 ? 'win' : netPnl < 0 ? 'loss' : 'breakeven',
  netPnl,
  pnl: netPnl,
  entryDate: exitDate,
  exitDate,
  ...extra,
});

function seriesFrom(trades) {
  const sorted = [...trades].sort((a, b) => accountTradeTime(a) - accountTradeTime(b)
    || String(a.id).localeCompare(String(b.id)));
  let value = 0;
  return sorted.map((t) => {
    value += t.netPnl;
    return { t: accountTradeTime(t), pnl: t.netPnl, value, id: t.id, balanceBefore: t.balanceBefore };
  });
}

// The arguments each screen actually passes. Home sums saved openings and
// always has a wallet figure (0 when none). The journal prefers the saved
// opening and only falls back to a live wallet.
function screenReturns(trades, { opening = 0, equity = null, live = false, period = 'all', now }) {
  const pnl = trades.reduce((sum, t) => sum + Number(t.netPnl || 0), 0);
  const fallback = live ? equity : null;
  const homeEquity = live ? equity : (Number(opening) > 0 ? Number(opening) + pnl : 0);
  const effectiveInitial = live ? Math.max(0, Number(equity) - pnl) : (Number(opening) || 0);
  const periodPct = accountPeriodReturn(trades, {
    openingBalance: opening, fallbackBalance: fallback, period, now,
  });
  const analytics = computeDashboardStats(trades, effectiveInitial, period, {
    now,
    openingBalance: opening,
    fallbackBalance: fallback,
  }).balanceChangePercent;
  const home = summarizeSeries(seriesFrom(trades), period, {
    declaredStart: Number(opening) > 0 ? Number(opening) : 0,
    equity: homeEquity,
    now,
    trades,
  }).percent;
  const header = summaryAccountReturn(
    trades,
    buildAccountReturnBook(trades, { openingBalance: opening, fallbackBalance: fallback }),
  );
  return { periodPct, analytics, home, header };
}

function expectSame(parts, expected, { period = 'all' } = {}) {
  const values = period === 'all'
    ? [parts.periodPct, parts.analytics, parts.home, parts.header]
    : [parts.periodPct, parts.analytics, parts.home];
  if (expected == null) {
    for (const value of values) expect(value).toBeNull();
    return;
  }
  for (const value of values) expect(value).toBeCloseTo(expected, 5);
}

describe('return percent is the same on every screen', () => {
  const now = new Date(2026, 9, 16, 15, 0, 0, 0);
  const weekStart = getPeriodStart('week', now);
  const prior = new Date(weekStart.getTime() - 86400000).toISOString();
  const inside = new Date(weekStart.getTime() + 60 * 1000).toISOString();

  it('wires the home card, the journal, and the analytics tab to accountReturn', () => {
    const home = readFileSync(new URL('./portfolioPerformance.js', import.meta.url), 'utf8');
    const dash = readFileSync(new URL('./dashboardStats.js', import.meta.url), 'utf8');
    const journal = readFileSync(new URL('../components/journal/TradeJournal.jsx', import.meta.url), 'utf8');
    const analytics = readFileSync(new URL('../components/journal/JournalAnalyticsTab.jsx', import.meta.url), 'utf8');
    expect(home).toContain('measureAccountReturn');
    expect(dash).toContain('accountPeriodReturn');
    expect(journal).toContain('useDashboardStats(trades, effectiveInitial, period, statsOptions)');
    expect(journal).toContain('fallbackBalance: balanceIsLive ? liveExchangeBalance : null');
    expect(analytics).toContain('accountPeriodReturn');
    expect(analytics).toContain('fallbackBalance: balanceIsLive ? displayedCurrentBalance : null');
  });

  it('keeps a withdrawal out of the percent when an opening balance was saved', () => {
    const trades = [closed('a', -20, '2026-06-01T00:00:00Z')];
    const opening = 2589.34;
    const equity = 393.58;
    const parts = screenReturns(trades, { opening, equity, live: true, now });
    const expected = (-20 / opening) * 100;
    expectSame(parts, expected);
    const walletGap = ((equity - opening) / opening) * 100;
    expect(Math.abs(parts.home - walletGap)).toBeGreaterThan(80);
    expect(parts.analytics).not.toBeCloseTo((-20 / (equity - (-20))) * 100, 1);
  });

  it('keeps deposits in the base when no opening balance was saved', () => {
    const trades = [closed('a', -20, '2026-06-01T00:00:00Z')];
    const equity = 393.58;
    const parts = screenReturns(trades, { opening: 0, equity, live: true, now });
    expectSame(parts, (-20 / (equity - (-20))) * 100);
  });

  it('uses one week window and the balance that week opened at', () => {
    const trades = [closed('old', -200, prior), closed('now', 10, inside)];
    const opening = 1000;
    const parts = screenReturns(trades, { opening, equity: 400, live: true, period: 'week', now });
    expectSame(parts, (10 / (opening - 200)) * 100, { period: 'week' });
    // The trades-tab header has no period control; it stays all-time.
    expect(parts.header).toBeCloseTo((-190 / opening) * 100, 5);
    expect(parts.header).not.toBeCloseTo(parts.home, 1);
  });

  it('uses the same month window on the home card and the analytics tab', () => {
    const monthStart = getPeriodStart('month', now);
    const trades = [
      closed('old', 5, new Date(monthStart.getTime() - 86400000).toISOString()),
      closed('now', -50, new Date(monthStart.getTime() + 60 * 1000).toISOString()),
    ];
    const parts = screenReturns(trades, { opening: 500, equity: 200, live: false, period: 'month', now });
    expectSame(parts, (-50 / (500 + 5)) * 100, { period: 'month' });
  });

  it('leaves P&L booked after a wipe out of every screen', () => {
    const trades = [
      closed('a', -1500, '2026-01-01T00:00:00Z'),
      closed('b', 50, '2026-01-02T00:00:00Z'),
    ];
    const parts = screenReturns(trades, { opening: 1000, equity: 0, live: true, now });
    expectSame(parts, -150);
    expect(parts.home).not.toBeCloseTo(-145, 1);
    expect(computeApiStats(trades, 1000, { now }).returnPercent).toBeCloseTo(-150, 5);
    const dollars = summarizeSeries(seriesFrom(trades), 'all', {
      declaredStart: 1000, equity: 0, now, trades,
    });
    expect(dollars.pnl).toBe(-1450);
    expect(dollars.percent).toBeCloseTo(-150, 5);
  });

  it('returns null for a zero, dust, or negative balance', () => {
    const trades = [closed('a', -20, '2026-06-01T00:00:00Z')];
    expectSame(screenReturns(trades, { opening: 0, equity: 0, live: true, now }), null);
    expectSame(screenReturns(trades, { opening: 0, equity: 1e-8, live: true, now }), null);
    expectSame(screenReturns(trades, { opening: 0, equity: -10, live: true, now }), null);
    expectSame(screenReturns(trades, { opening: 0, equity: null, live: false, now }), null);
    expectSame(screenReturns(trades, { opening: 1e-8, equity: null, live: false, now }), null);
    expectSame(screenReturns(trades, { opening: -50, equity: null, live: false, now }), null);
    // A dust opening must not explode, on the API either.
    expect(computeApiStats(trades, 1e-8, { now }).returnPercent).toBeNull();
  });

  it('uses today\'s wallet when the account start cannot be rebuilt', () => {
    const trades = [closed('a', 500, '2026-06-01T00:00:00Z')];
    const parts = screenReturns(trades, { opening: 0, equity: 100, live: true, now });
    expectSame(parts, (500 / 100) * 100);
  });
});
