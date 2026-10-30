import { useMemo } from 'react';
import { computeDashboardStats, tradeDate } from '../utils/dashboardStats';

export { tradeDate };

export function useDashboardStats(trades, initialBalance = 0, period = 'all', options) {
  return useMemo(
    () => computeDashboardStats(trades, initialBalance, period, options),
    [trades, initialBalance, period, options],
  );
}
