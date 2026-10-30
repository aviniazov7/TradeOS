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
 * The ONE closed-trade predicate, shared by the dashboard stats, the trade
 * table and the monthly calendar — so a trade never counts as closed on one
 * screen and open on another. Broker CSV imports carry
 * status:'closed' + pnlFromExchange with NO exit price, so exitPrice alone
 * must not decide; explicit 'open'/'partial' status always wins.
 */
export function isClosedTrade(t) {
  if (!t) return false;
  if (t.status === 'closed') return true;
  if (t.status === 'partial' || t.status === 'open') return false;
  return parseFloat(t.exitPrice) > 0 || typeof t.pnlFromExchange === 'number';
}

/**
 * The ONE day-bucketing key (YYYY-MM-DD, LOCAL midnight). toISOString()
 * buckets by UTC, so a trade or journal written 00:30–03:00 Israel time
 * landed on yesterday's key while "today" logic elsewhere uses local
 * midnight — every screen that groups by day must go through this helper.
 */
export function localDayKey(date = new Date()) {
  let d = date;
  if (typeof d?.toDate === 'function') d = d.toDate(); // Firestore Timestamp
  else if (!(d instanceof Date)) d = new Date(d);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * THE win-rate definition, shared by every screen: wins / (wins + losses).
 * Breakevens are excluded from the denominator (they are neither), so a
 * per-strategy / per-month / per-session table can never disagree with the
 * headline number. 0 when nothing is decided yet.
 */
export function winRateOf(wins, losses) {
  const decided = (wins || 0) + (losses || 0);
  return decided > 0 ? ((wins || 0) / decided) * 100 : 0;
}

/**
 * Calculate win rate from an array of trades
 */
export function calculateWinRate(trades) {
  // Win rate is over DECIDED trades only (wins vs losses). Dividing by the full
  // array wrongly counts breakevens and any malformed/undecided rows (e.g. a
  // 'closed' status with no exit price) in the denominator, which can crater a
  // real ~55% win rate down to single digits. This also keeps the headline
  // consistent with the "41W 33L" sub-label, which counts only wins + losses.
  const wins = trades.filter((t) => t.result === 'win').length;
  const losses = trades.filter((t) => t.result === 'loss').length;
  return winRateOf(wins, losses);
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(trades) {
  const grossProfit = trades
    .filter((t) => safePnl(t) > 0)
    .reduce((sum, t) => sum + safePnl(t), 0);
  const grossLoss = Math.abs(
    trades.filter((t) => safePnl(t) < 0).reduce((sum, t) => sum + safePnl(t), 0)
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
  // Three weights (win/loss/breakeven), not two: weighting the loss side by
  // (1 − winRate) silently counts breakevens as losses — 4 wins of +100,
  // 2 losses of −100 and 4 BE would compute −20/trade instead of +20.
  const winRate = wins.length / trades.length;
  const lossRate = losses.length / trades.length;
  const avgWin = wins.length
    ? wins.reduce((s, t) => s + safePnl(t), 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((s, t) => s + safePnl(t), 0) / losses.length)
    : 0;
  return winRate * avgWin - lossRate * avgLoss;
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
 * Drawdown of a P&L sequence (chronological, one value per closed trade).
 *
 * The dollar drawdown is always meaningful. The PERCENT drawdown is only
 * meaningful against real capital: with no starting balance the "equity" is
 * just cumulative P&L, so +10 then −9 would read as a 90% drawdown on a $1
 * account move. In that case maxDrawdownPct is null — the UI shows the dollar
 * figure instead of inventing a percentage.
 */
export function computeDrawdown(pnls, startBalance = 0) {
  const start = Number.isFinite(startBalance) ? startBalance : 0;
  let equity = start;
  let peak = start;
  let maxDrawdownAbs = 0;
  const curve = [];
  for (const p of pnls) {
    equity += Number.isFinite(p) ? p : 0;
    curve.push(equity);
    if (equity > peak) peak = equity;
    if (peak - equity > maxDrawdownAbs) maxDrawdownAbs = peak - equity;
  }
  const hasCapital = start > 0;
  return {
    curve,
    maxDrawdownAbs,
    maxDrawdownPct: hasCapital ? (curve.length ? calculateMaxDrawdown(curve, start) : 0) : null,
  };
}

/**
 * Signed net R for display and averages: NET P&L / initial risk (fees are
 * inside the number). Same definition as the journal header "R ממוצע".
 * Legacy rows whose risk can't be priced fall back to the stored rrRatio
 * magnitude, signed by the net P&L. null when the trade never had a risk.
 */
export function signedTradeR(t) {
  const r = tradeRMultiple(t);
  if (r !== null && (t?.netPnl != null || t?.pnl != null || toNum(t?.fees) > 0)) return r;
  if (r !== null && t?.netPnl == null && t?.pnl == null) {
    // No dollars on file (older fixtures): the price ratio is the only R,
    // and with no fees it equals the net R. Sign it by the price move.
    const gross = tradeRewardRisk(t);
    if (gross > 0) {
      const entry = toNum(t?.entryPrice);
      const exits = Array.isArray(t?.exits)
        ? t.exits.map((e) => ({ price: toNum(e?.price), percent: toNum(e?.percent) })).filter((e) => e.price > 0 && e.percent > 0)
        : [];
      const exit = exits.length ? calculateWeightedExitPrice(exits) : toNum(t?.exitPrice);
      if (entry > 0 && exit > 0) {
        const favorable = t?.direction === 'short' ? entry - exit : exit - entry;
        return favorable < 0 ? -gross : gross;
      }
    }
  }
  if (r !== null) return r;
  const rr = Math.abs(toNum(t?.rrRatio));
  if (!rr) return null;
  return safePnl(t) < 0 ? -rr : rr;
}

/**
 * Percent return AFTER fees. The stored pnlPercent is gross (fees never
 * entered that formula), so the table's % column and the net P&L column
 * disagreed whenever a trade had commission. Scales the stored percent by
 * net/gross when the size can't be repriced.
 */
export function tradeNetPercent(t) {
  const net = safePnl(t);
  const entry = toNum(t?.entryPrice);
  const units = positionUnits(t);
  if (entry > 0 && units > 0) {
    const lev = t?.assetClass === 'futures_cme' ? 1 : (parseFloat(t?.leverage) || 1);
    return (net / (entry * units)) * 100 * lev;
  }
  const gross = Number(t?.pnl);
  const stored = Number(t?.pnlPercent);
  if (Number.isFinite(stored) && Number.isFinite(gross) && gross !== 0) return stored * (net / gross);
  return Number.isFinite(stored) ? stored : 0;
}

/**
 * Smallest balance that may be a return denominator. MEXC still reports a
 * positive dust equity (~1e-8 USDT) after the wallet is emptied; `> 0` treats
 * that residue as an account and the percent explodes. Sub-cent equity is not
 * an account. One cent and above still counts, including a small live wallet.
 */
export const MIN_SANE_ACCOUNT_BALANCE = 0.01;

/** Finite balance of at least one cent, or null. */
export function saneBalance(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN_SANE_ACCOUNT_BALANCE) return null;
  return n;
}

/**
 * Net P&L as a percent of the journal account. `accountBalance` is the
 * balance before this trade when the caller has one, otherwise a sane
 * account balance. null when the balance is missing, zero, negative, or
 * dust — callers show "—" and leave the trade out of averages. A usable
 * zero is not a 0% return and must not fall through to the position percent
 * while the column is still labeled as a return on the account.
 */
export function tradeAccountPercent(t, accountBalance) {
  const balance = saneBalance(accountBalance);
  if (balance == null) return null;
  const net = safePnl(t);
  if (!Number.isFinite(net)) return null;
  return (net / balance) * 100;
}

/**
 * The percent a journal surface should show for a trade.
 * Net P&L over the account when a sane balance is known. An explicit balance
 * that is negative or dust does not fall back to the position return — the
 * percent is null and `onAccount` stays true so the UI can show "—".
 * Pass `strictAccount` when the journal is measuring account return but this
 * row has no balance (null / 0): same "—" result. Without it, 0 still means
 * "no account balance was set" and the position return is shown.
 * Pass `net` for a live unrealized P&L that is not stored on the trade, and
 * `positionPercent` as the fallback when that row has no balance.
 */
export function tradeShownPercent(t, accountBalance, { net, positionPercent, strictAccount = false } = {}) {
  const balance = saneBalance(accountBalance);
  const numeric = Number(accountBalance);
  const given = accountBalance != null && accountBalance !== '' && Number.isFinite(numeric) && numeric !== 0;
  const unusable = given && balance == null;
  const dollars = net === undefined ? safePnl(t) : Number(net);
  if (balance != null && Number.isFinite(dollars)) {
    return { percent: (dollars / balance) * 100, onAccount: true };
  }
  if (unusable || strictAccount) return { percent: null, onAccount: true };
  if (net === undefined) return { percent: tradeNetPercent(t), onAccount: false };
  if (positionPercent != null && Number.isFinite(Number(positionPercent))) {
    return { percent: Number(positionPercent), onAccount: false };
  }
  return { percent: null, onAccount: false };
}

/**
 * Average reward:risk of winning trades, NET of fees.
 * A winner's R is net P&L / initial risk (the same R the table and the
 * "R ממוצע" header show). Rows with no stored P&L keep the price ratio —
 * with no fees the two are equal. 0 when there is no winning R.
 */
export function calculateAvgRR(trades) {
  const rrs = trades
    .filter((t) => t.result === 'win')
    .map((t) => {
      if (t?.netPnl != null || t?.pnl != null) {
        const r = tradeRMultiple(t);
        if (r != null) return r;
      }
      return tradeRewardRisk(t);
    })
    .filter((rr) => rr > 0);
  if (!rrs.length) return 0;
  return rrs.reduce((s, rr) => s + rr, 0) / rrs.length;
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
 * Longest winning / losing runs over trades sorted oldest → newest. Same
 * streak rule as calculateCurrentStreak: a breakeven neither extends nor
 * breaks a run (W, BE, W is a 2-win streak).
 */
export function calculateMaxStreaks(sortedTrades) {
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  for (const t of sortedTrades) {
    if (t.result === 'win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
    else if (t.result === 'loss') { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
    // breakeven / undecided: skipped
  }
  return { maxWin, maxLoss };
}

/**
 * Milliseconds the trade was actually open, or null.
 * Exchange imports often stamp exitDate === entryDate (duration 0). Counting
 * those zeros used to halve the average next to a chart that skipped them
 * (a 53-minute trade beside a zero-length import read as 26 minutes).
 */
export function tradeDurationMs(trade) {
  if (!trade?.entryDate || !trade?.exitDate) return null;
  const entry = trade.entryDate?.toDate ? trade.entryDate.toDate() : new Date(trade.entryDate);
  const exit = trade.exitDate?.toDate ? trade.exitDate.toDate() : new Date(trade.exitDate);
  const a = entry?.getTime?.();
  const b = exit?.getTime?.();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return b - a;
}

export function calculateAvgDuration(trades) {
  const durations = (trades || []).map(tradeDurationMs).filter((ms) => ms != null);
  if (!durations.length) return 0;
  return durations.reduce((s, ms) => s + ms, 0) / durations.length;
}

/**
 * Calculate Sortino Ratio (like Sharpe but only penalizes downside volatility).
 * Standard downside deviation (target 0): sqrt(Σ min(r, 0)² / N) over ALL N
 * observations. Dividing by the number of losers instead overstated the
 * downside deviation (and understated Sortino) whenever most trades won.
 */
export function calculateSortinoRatio(returns) {
  if (!returns.length) return 0;
  const clean = returns.filter(r => isFinite(r));
  if (!clean.length) return 0;
  const mean = clean.reduce((s, r) => s + r, 0) / clean.length;
  const downsideReturns = clean.filter((r) => r < 0);
  if (!downsideReturns.length) return mean > 0 ? Infinity : 0;
  const downsideVariance = downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / clean.length;
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

/**
 * Net P&L for a trade, guaranteed finite. netPnl/pnl can be undefined, null,
 * NaN (a bad exchange-import parse) or a numeric string; coerce and default to
 * 0 so a single dirty row can't poison a sum, chart or ratio.
 */
export function safePnl(t) {
  const v = Number(t?.netPnl ?? t?.pnl ?? 0);
  return Number.isFinite(v) ? v : 0;
}

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * True when `stop` sits on the LOSING side of `entry` — i.e. it actually
 * defines risk. A stop at or through entry (moved to breakeven / trailed into
 * profit) defines none. Unknown direction: any stop other than entry counts.
 */
export function isStopOnRiskSide(direction, entry, stop) {
  const e = toNum(entry);
  const s = toNum(stop);
  if (!(e > 0) || !(s > 0)) return false;
  if (direction === 'long') return s < e;
  if (direction === 'short') return s > e;
  return s !== e;
}

/**
 * The stop that defined the trade's risk AT ENTRY. originalStopLoss is written
 * once on create and kept on every edit / SL move, so it wins; legacy trades
 * without it fall back to the current stop. Either one only counts while it is
 * on the risk side — a breakeven stop is not "the risk". 0 when unknown.
 */
export function initialStopLoss(t) {
  if (!t) return 0;
  if (isStopOnRiskSide(t.direction, t.entryPrice, t.originalStopLoss)) return toNum(t.originalStopLoss);
  if (isStopOnRiskSide(t.direction, t.entryPrice, t.stopLoss)) return toNum(t.stopLoss);
  return 0;
}

/**
 * How many price units the position holds (P&L per $1 move). positionSize is
 * persisted as the USD NOTIONAL (entry × quantity for crypto/stocks, price ×
 * pointValue × contracts for CME futures), so notional / entry is right for
 * every asset class. trade.quantity on futures is the bare contract count, so
 * it is only used directly for non-futures trades.
 */
export function positionUnits(t) {
  const entry = toNum(t?.entryPrice);
  const notional = toNum(t?.positionSize);
  if (entry > 0 && notional > 0) return notional / entry;
  if (t?.assetClass === 'futures_cme') {
    const pv = toNum(t?.contract?.pointValue);
    const c = toNum(t?.contract?.contracts);
    return pv > 0 && c > 0 ? pv * c : 0;
  }
  return Math.max(0, toNum(t?.quantity));
}

/**
 * The dollars at risk when the trade was opened: |entry − initial stop| × units.
 * Falls back to the declared riskAmount when the stop/size can't price it
 * (e.g. a legacy trade whose stop was moved to breakeven before
 * originalStopLoss existed). 0 when the risk was never defined.
 */
export function initialRiskUsd(t) {
  const entry = toNum(t?.entryPrice);
  const stop = initialStopLoss(t);
  const units = positionUnits(t);
  if (stop > 0 && units > 0) return Math.abs(entry - stop) * units;
  const declared = toNum(t?.riskAmount);
  return declared > 0 ? declared : 0;
}

/**
 * Signed R-multiple of a closed trade: NET P&L / initial risk in dollars.
 * Using net P&L for both magnitude and sign (instead of a gross price-based
 * rrRatio signed by the net P&L) keeps fees inside the R. Measured against the
 * ORIGINAL stop, so trailing the stop never rewrites a trade's R. null when
 * the trade had no defined risk.
 */
export function tradeRMultiple(t) {
  const risk = initialRiskUsd(t);
  return risk > 0 ? safePnl(t) / risk : null;
}

/**
 * Unsigned reward:risk on price (|exit − entry| / |entry − initial stop|), at
 * read time. Falls back to the stored rrRatio when exit/stop prices are absent
 * (broker imports) — legacy values may be signed, hence Math.abs.
 */
export function tradeRewardRisk(t) {
  const stop = initialStopLoss(t);
  const entry = toNum(t?.entryPrice);
  const exits = Array.isArray(t?.exits)
    ? t.exits.map((e) => ({ price: toNum(e?.price), percent: toNum(e?.percent) })).filter((e) => e.price > 0 && e.percent > 0)
    : [];
  const exit = exits.length ? calculateWeightedExitPrice(exits) : toNum(t?.exitPrice);
  if (stop > 0 && entry > 0 && exit > 0) return calculateRR(entry, exit, stop);
  return Math.abs(toNum(t?.rrRatio));
}

/**
 * Realized P&L sitting inside a still-open PARTIAL position (TP1 taken, rest
 * running). For a manual partial, computeTradeFields stores the P&L of the
 * executed exits only, so the stored net P&L IS the realized part.
 * Exchange-sourced rows are excluded: their stored P&L is the exchange's
 * figure for the whole position, not the executed legs. 0 for anything else.
 *
 * Deliberately NOT folded into isClosedTrade / closed-trade totals: exits carry
 * no timestamp (so the P&L can't be put on the right calendar day), and the
 * live-wallet calibration in the journal assumes total P&L = Σ closed trades.
 */
export function partialRealizedPnl(t) {
  if (!t || t.status !== 'partial' || !Array.isArray(t.exits) || !t.exits.length) return 0;
  if (t.pnlFromExchange != null || t.externalId) return 0;
  return safePnl(t);
}

/**
 * The ONE canonical P&L computation for a trade — shared by the journal
 * (add / import / edit) and the dashboard's live SL/TP auto-close, so a trade
 * closed either way stores identical, reconciled fields. Handles exchange
 * imports (pnlFromExchange), CME futures, crypto partial exits, and fees. The
 * result is classified off NET P&L, so fees can flip a thin gross win to a loss.
 */
export function computeTradeFields(tradeData) {
  let pnl, rrRatio, pnlPercent;
  const isFutures = tradeData.assetClass === 'futures_cme' && tradeData.contract;
  const hasExchangePnl = typeof tradeData.pnlFromExchange === 'number';
  const isClosed = (tradeData.exitPrice > 0) || tradeData.status === 'closed';
  // R is measured against the stop the trade was OPENED with — trailing the
  // stop to breakeven must not turn a 2R winner into "4R" or "no R".
  const riskStop = initialStopLoss(tradeData);

  if (hasExchangePnl && isClosed) {
    pnl = tradeData.pnlFromExchange;
    const exitForRR = tradeData.exits?.length
      ? calculateWeightedExitPrice(tradeData.exits)
      : (tradeData.exitPrice || 0);
    rrRatio = calculateRR(tradeData.entryPrice, exitForRR, riskStop);
  } else if (isFutures) {
    const { pointValue, contracts } = tradeData.contract;
    if (tradeData.exits?.length) {
      pnl = tradeData.exits.some((e) => e.contracts != null)
        ? calculateFuturesContractsPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, pointValue)
        : calculateFuturesPartialPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, pointValue, contracts);
      rrRatio = calculateRR(tradeData.entryPrice, calculateWeightedExitPrice(tradeData.exits), riskStop);
    } else {
      pnl = calculateFuturesPnL(tradeData.direction, tradeData.entryPrice, tradeData.exitPrice, pointValue, contracts);
      rrRatio = calculateRR(tradeData.entryPrice, tradeData.exitPrice, riskStop);
    }
  } else if (tradeData.exits?.length) {
    pnl = calculatePartialPnL(tradeData.direction, tradeData.entryPrice, tradeData.exits, tradeData.quantity);
    rrRatio = calculateRR(tradeData.entryPrice, calculateWeightedExitPrice(tradeData.exits), riskStop);
  } else {
    pnl = calculatePnL(tradeData.direction, tradeData.entryPrice, tradeData.exitPrice, tradeData.quantity);
    rrRatio = calculateRR(tradeData.entryPrice, tradeData.exitPrice, riskStop);
  }

  if (isFutures) {
    const notional = calculateFuturesNotional(tradeData.entryPrice, tradeData.contract.pointValue, tradeData.contract.contracts);
    pnlPercent = notional ? (pnl / notional) * 100 : 0;
  } else {
    pnlPercent = calculatePnLPercent(pnl, tradeData.entryPrice, tradeData.quantity, tradeData.leverage);
  }
  const netPnl = calculateNetPnL(pnl, tradeData.fees);
  const result = getTradeResult(netPnl);
  return { pnl, pnlPercent, rrRatio, netPnl, result };
}
