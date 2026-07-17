import { useMemo } from 'react';
import {
  calculateWinRate,
  calculateProfitFactor,
  calculateExpectancy,
  calculateAvgRR,
  isClosedTrade,
} from '../utils/calculations';

export function useStats(trades) {
  return useMemo(() => {
    const closedTrades = trades.filter(isClosedTrade);
    const openTrades = trades.filter((t) => t.status === 'open');

    const totalPnL = closedTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const winRate = calculateWinRate(closedTrades);
    const profitFactor = calculateProfitFactor(closedTrades);
    const expectancy = calculateExpectancy(closedTrades);
    const avgRR = calculateAvgRR(closedTrades);

    // Today's P&L
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrades = closedTrades.filter((t) => {
      const d = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
      return d >= today;
    });
    const dailyPnL = todayTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);

    // Best strategy
    const strategyMap = {};
    closedTrades.forEach((t) => {
      if (!t.strategy) return;
      if (!strategyMap[t.strategy]) strategyMap[t.strategy] = 0;
      strategyMap[t.strategy] += t.netPnl ?? t.pnl ?? 0;
    });
    const bestStrategy =
      Object.entries(strategyMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';

    return {
      totalPnL,
      winRate,
      totalTrades: closedTrades.length,
      openTrades: openTrades.length,
      profitFactor,
      expectancy,
      avgRR,
      dailyPnL,
      bestStrategy,
    };
  }, [trades]);
}
