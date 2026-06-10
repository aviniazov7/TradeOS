/**
 * Calculate P&L for a trade
 */
export function calculatePnL(direction, entryPrice, exitPrice, quantity) {
  if (!entryPrice || !exitPrice || !quantity) return 0;
  return direction === 'long'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
}

/**
 * Dollar P&L for an exchange-traded futures contract (CME etc.):
 * points moved × dollar value per point × number of contracts.
 * Example: ES long 5000→5010 with 2 contracts = 10 × $50 × 2 = $1,000.
 */
export function calculateFuturesPnL(direction, entryPrice, exitPrice, pointValue, contracts) {
  if (!entryPrice || !exitPrice || !pointValue || !contracts) return 0;
  const points = direction === 'long'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;
  return points * pointValue * contracts;
}

/**
 * Futures P&L across partial exits. Exits are percent-of-position based,
 * mirroring calculatePartialPnL for crypto.
 */
export function calculateFuturesPartialPnL(direction, entryPrice, exits, pointValue, contracts) {
  if (!exits?.length || !entryPrice || !pointValue || !contracts) return 0;
  return exits.reduce((sum, exit) => {
    const partContracts = contracts * (exit.percent / 100);
    return sum + calculateFuturesPnL(direction, entryPrice, exit.price, pointValue, partContracts);
  }, 0);
}

/**
 * Futures P&L from per-exit contract counts (exact — no percent rounding).
 * Used when each exit records how many contracts closed at its price, which
 * is how futures traders think ("closed 1 of 3"). Each exit: { price, contracts }.
 */
export function calculateFuturesContractsPnL(direction, entryPrice, exits, pointValue) {
  if (!exits?.length || !entryPrice || !pointValue) return 0;
  return exits.reduce((sum, exit) =>
    sum + calculateFuturesPnL(direction, entryPrice, exit.price, pointValue, exit.contracts || 0), 0);
}

/**
 * Futures notional value: price × pointValue × contracts. Used for
 * positionSize and as the honest denominator for percent returns (no
 * leverage inflation — real futures margin is exchange-set and unknown here).
 */
export function calculateFuturesNotional(price, pointValue, contracts) {
  if (!price || !pointValue || !contracts) return 0;
  return price * pointValue * contracts;
}

/**
 * Calculate P&L percentage (ROE — return on margin when leverage provided)
 */
export function calculatePnLPercent(pnl, entryPrice, quantity, leverage = 1) {
  if (!entryPrice || !quantity) return 0;
  const lev = parseFloat(leverage) || 1;
  return (pnl / (entryPrice * quantity)) * 100 * lev;
}

/**
 * Calculate Risk:Reward ratio
 */
export function calculateRR(entryPrice, exitPrice, stopLoss) {
  if (!entryPrice || !exitPrice || !stopLoss) return 0;
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk === 0) return 0;
  const reward = Math.abs(exitPrice - entryPrice);
  return reward / risk;
}

/**
 * Calculate weighted average exit price from partial exits
 */
export function calculateWeightedExitPrice(exits) {
  if (!exits?.length) return 0;
  const totalPercent = exits.reduce((s, e) => s + e.percent, 0);
  if (totalPercent === 0) return 0;
  return exits.reduce((s, e) => s + e.price * e.percent, 0) / totalPercent;
}

/**
 * Calculate total PnL from multiple partial exits
 */
export function calculatePartialPnL(direction, entryPrice, exits, totalQuantity) {
  if (!exits?.length || !entryPrice || !totalQuantity) return 0;
  return exits.reduce((sum, exit) => {
    const qty = totalQuantity * (exit.percent / 100);
    return sum + calculatePnL(direction, entryPrice, exit.price, qty);
  }, 0);
}

/**
 * Calculate net P&L (after fees)
 */
export function calculateNetPnL(pnl, fees) {
  return pnl - (fees || 0);
}

/**
 * Determine trade result
 */
export function getTradeResult(pnl) {
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'breakeven';
}

/**
 * Calculate win rate from an array of trades
 */
export function calculateWinRate(trades) {
  if (!trades.length) return 0;
  const wins = trades.filter((t) => t.result === 'win').length;
  return (wins / trades.length) * 100;
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(trades) {
  const grossProfit = trades
    .filter((t) => (t.netPnl ?? t.pnl) > 0)
    .reduce((sum, t) => sum + (t.netPnl ?? t.pnl), 0);
  const grossLoss = Math.abs(
    trades.filter((t) => (t.netPnl ?? t.pnl) < 0).reduce((sum, t) => sum + (t.netPnl ?? t.pnl), 0)
  );
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/**
 * Calculate expectancy
 */
export function calculateExpectancy(trades) {
  if (!trades.length) return 0;
  const wins = trades.filter((t) => t.result === 'win');
  const losses = trades.filter((t) => t.result === 'loss');
  const winRate = wins.length / trades.length;
  const avgWin = wins.length
    ? wins.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? t.pnl), 0) / losses.length)
    : 0;
  return winRate * avgWin - (1 - winRate) * avgLoss;
}

/**
 * Calculate max drawdown from equity curve
 * @param {number[]} equityCurve - equity values after each trade
 * @param {number} initialBalance - balance before any trades (true starting peak)
 */
export function calculateMaxDrawdown(equityCurve, initialBalance = 0) {
  if (!equityCurve.length) return 0;
  // Start peak at initialBalance so drawdown from the very first losing trade is captured
  let peak = Math.max(initialBalance, 0);
  let maxDD = 0;
  for (const value of equityCurve) {
    if (value > peak) peak = value;
    if (peak <= 0) continue; // guard division by zero / negative peak
    const dd = ((peak - value) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Calculate average R:R (winning trades only — rrRatio is unsigned)
 */
export function calculateAvgRR(trades) {
  const winningWithRR = trades.filter((t) => t.result === 'win' && t.rrRatio > 0);
  if (!winningWithRR.length) return 0;
  return winningWithRR.reduce((s, t) => s + t.rrRatio, 0) / winningWithRR.length;
}

/**
 * Calculate Sharpe Ratio (simplified, no risk-free rate)
 */
export function calculateSharpeRatio(returns) {
  if (!returns.length) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return mean / stdDev;
}

/**
 * Calculate Calmar Ratio (totalReturn% / maxDrawdown%)
 * Returns Infinity when there's been positive return without any drawdown,
 * matching Sortino's "all-wins" behavior. Callers should clamp via clampRatio
 * before display.
 */
export function calculateCalmarRatio(totalReturnPercent, maxDrawdownPercent) {
  if (maxDrawdownPercent === 0) {
    return totalReturnPercent > 0 ? Infinity : 0;
  }
  return Math.abs(totalReturnPercent / maxDrawdownPercent);
}

/**
 * Clamp a financial ratio (Sortino/Calmar/ProfitFactor/etc.) to a safe display range.
 * - NaN / undefined / null → 0
 * - Infinity → cap (default 10)
 * - Otherwise: pass through
 * Use this in UI layers so unbounded ratios render as a finite "best case" value
 * instead of "Infinity" or rendering as 0 inconsistently.
 */
export function clampRatio(value, cap = 10) {
  if (value == null || Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return cap;
  return value;
}

/**
 * Calculate current streak from sorted trades (by exit date ASC)
 */
export function calculateCurrentStreak(sortedTrades) {
  if (!sortedTrades.length) return { type: null, count: 0 };
  let type = null;
  let count = 0;
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    const r = sortedTrades[i].result;
    if (r === 'breakeven') continue;
    if (type === null) {
      type = r;
      count = 1;
    } else if (r === type) {
      count++;
    } else {
      break;
    }
  }
  return { type, count };
}

/**
 * Calculate average trade duration in milliseconds
 */
export function calculateAvgDuration(trades) {
  const withDates = trades.filter(t => t.entryDate && t.exitDate);
  if (!withDates.length) return 0;
  const total = withDates.reduce((s, t) => {
    const entry = t.entryDate?.toDate ? t.entryDate.toDate() : new Date(t.entryDate);
    const exit = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
    return s + (exit - entry);
  }, 0);
  return total / withDates.length;
}

/**
 * Calculate Sortino Ratio (like Sharpe but only penalizes downside volatility)
 */
export function calculateSortinoRatio(returns) {
  if (!returns.length) return 0;
  const clean = returns.filter(r => isFinite(r));
  if (!clean.length) return 0;
  const mean = clean.reduce((s, r) => s + r, 0) / clean.length;
  const downsideReturns = clean.filter((r) => r < 0);
  if (!downsideReturns.length) return mean > 0 ? Infinity : 0;
  const downsideVariance = downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / downsideReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;
  return mean / downsideDev;
}

/**
 * Calculate Recovery Factor (net profit / max drawdown in absolute terms)
 */
export function calculateRecoveryFactor(totalPnL, maxDrawdownAbsolute) {
  if (maxDrawdownAbsolute === 0) return 0;
  return totalPnL / maxDrawdownAbsolute;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
export function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return num / den;
}

/**
 * Calculate DCA average price
 */
export function calculateDCAAvgPrice(entries) {
  if (!entries.length) return 0;
  const totalInvested = entries.reduce((s, e) => s + e.amount, 0);
  const totalCoins = entries.reduce((s, e) => s + e.coins, 0);
  if (totalCoins === 0) return 0;
  return totalInvested / totalCoins;
}
