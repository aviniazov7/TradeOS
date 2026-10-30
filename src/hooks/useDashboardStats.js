import { useMemo } from 'react';
import { computeDashboardStats, tradeDate } from '../utils/dashboardStats';

export { tradeDate };

export function useDashboardStats(trades, initialBalance = 0, period = 'all') {
  return useMemo(
    () => computeDashboardStats(trades, initialBalance, period),
    [trades, initialBalance, period],
  );
}
