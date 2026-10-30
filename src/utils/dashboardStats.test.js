import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateExpectancy, calculateProfitFactor, calculateWinRate, initialRiskUsd,
} from './calculations';
import { computeApiStats } from './apiStats';
import { computeDashboardStats } from './dashboardStats';

// Two closed trades on a $1,000 account. Position return on the winner is
// 100% (leverage 10); the account return is the P&L over the balance.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const winner = {
  id: 'w', pair: 'BTCUSDT', direction: 'long', status: 'closed', result: 'win',
  entryPrice: 100, exitPrice: 110, quantity: 2, positionSize: 200, leverage: 10,
  stopLoss: 90, originalStopLoss: 90, riskAmount: 0, fees: 0,
  pnl: 20, netPnl: 20, pnlPercent: 100,
  entryDate: '2026-06-01T10:00:00.000Z', exitDate: '2026-06-01T12:00:00.000Z',
};
const loser = {
  id: 'l', pair: 'ETHUSDT', direction: 'long', status: 'closed', result: 'loss',
  entryPrice: 100, exitPrice: 90, quantity: 5, positionSize: 500, leverage: 10,
  stopLoss: 90, originalStopLoss: 90, riskAmount: 0, fees: 0,
  pnl: -50, netPnl: -50,
  entryDate: '2026-06-02T10:00:00.000Z', exitDate: '2026-06-02T12:00:00.000Z',
};
const trades = [winner, loser];

describe('computeDashboardStats', () => {
  it('matches the shared ratio helpers and the account-balance return', () => {
    const stats = computeDashboardStats(trades, 1000, 'all', { now: NOW });
    expect(stats.totalPnL).toBe(-30);
    expect(stats.currentBalance).toBe(970);
    expect(stats.balanceChangePercent).toBeCloseTo(-3);
    expect(stats.winRate).toBe(calculateWinRate(trades));
    expect(stats.winCount).toBe(1);
    expect(stats.lossCount).toBe(1);
    expect(stats.profitFactor).toBe(calculateProfitFactor(trades));
    expect(stats.expectancy).toBe(calculateExpectancy(trades));
    expect(stats.totalTrades).toBe(2);
    // Winner-only R (dashboard avgRR), not the all-trades average.
    expect(stats.avgRR).toBe(1);
    expect(stats.maxDrawdown).toBeGreaterThan(0);
  });

  it('is the only implementation the dashboard hook calls', () => {
    const src = readFileSync(new URL('../hooks/useDashboardStats.js', import.meta.url), 'utf8');
    expect(src).toContain('computeDashboardStats(trades, initialBalance, period)');
    expect(src).not.toContain('calculateWinRate');
  });
});

describe('computeApiStats', () => {
  it('reports account return and real risk, not a $0 risk or a position percent', () => {
    expect(initialRiskUsd(winner)).toBe(20);
    expect(initialRiskUsd(loser)).toBe(50);
    const stats = computeApiStats(trades, 1000, { now: NOW });
    expect(stats.returnPercent).toBeCloseTo(-3);
    expect(stats.returnPercent).not.toBeCloseTo(100);
    expect(stats.riskAmount).toBe(70);
    expect(stats.startBalance).toBe(1000);
    expect(stats.currentBalance).toBe(970);
    expect(stats.totalPnl).toBe(-30);
    expect(stats.counts).toEqual({
      total: 2, closed: 2, open: 0, partial: 0, wins: 1, losses: 1, breakeven: 0,
    });
    expect(stats.winRate).toBe(50);
    expect(stats.profitFactor).toBeCloseTo(0.4);
    expect(stats.expectancy).toBe(-15);
    expect(stats.avgR).toBeCloseTo(0);
    expect(stats.maxDrawdown).toBeGreaterThan(0);
    expect(stats.maxDrawdownAmount).toBeGreaterThan(0);
  });

  it('returns a null account return when the journal has no opening balance', () => {
    const stats = computeApiStats(trades, 0, { now: NOW });
    expect(stats.returnPercent).toBeNull();
    expect(stats.maxDrawdown).toBeNull();
    expect(stats.riskAmount).toBe(70);
  });

  it('counts a breakeven and keeps an open trade out of the P&L', () => {
    const be = { ...winner, id: 'b', result: 'breakeven', netPnl: 0, pnl: 0, exitPrice: 100 };
    const open = { ...winner, id: 'o', status: 'open', result: 'win', netPnl: 999, exitPrice: 0, exitDate: null };
    const stats = computeApiStats([be, open], 1000, { now: NOW });
    expect(stats.counts.breakeven).toBe(1);
    expect(stats.counts.open).toBe(1);
    expect(stats.totalPnl).toBe(0);
  });
});
