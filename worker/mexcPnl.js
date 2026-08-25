/**
 * MEXC closed-position record → the fields the journal needs. Pure, no I/O, so
 * it can be unit tested outside the Worker runtime (same reasoning as
 * newsImpact.js, tradeMerge.js and bybitPnl.js).
 *
 * Two things here were settled against a real account rather than the docs,
 * because MEXC's API host is unreachable from CI. Both are stated once, here,
 * so the sync route and anything added later cannot drift apart on them.
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Trading fees on the record.
 *
 * In practice this endpoint returns NONE of these field names and the result is
 * 0 — which is why the net figure has always been right, and also why an
 * imported trade displayed "fees: $0" for a cost that was really charged. The
 * chain is kept because the field naming has varied across MEXC's contract API
 * versions, and normalizeClosedPosition adds whatever it finds back into the
 * gross figure, so a field appearing later cannot silently double-subtract.
 */
export function tradingFees(p) {
  // The chain is `||`, not `??`, to match the code this replaced — and the
  // Bybit module, which was aligned for the same reason. They differ on a
  // NUMERIC zero: `{ fee: 0, fees: 2 }` falls through to 2 with `||` and stops
  // at 0 with `??`. This is a refactor, so the original behaviour wins.
  return Math.abs(num(p?.fee || p?.fees || p?.closeFee || p?.close_fee || p?.holdFee || p?.totalFee || 0));
}

/** positionType 1 is a long; anything else is a short. */
export function positionDirection(p) {
  return (p?.positionType ?? p?.position_type) === 1 ? 'long' : 'short';
}

/**
 * Size in COIN units.
 *
 * MEXC reports volume in CONTRACTS, and each symbol has its own contract size
 * (BTC_USDT is 0.0001 BTC per contract). Reading the raw volume inflates
 * quantity, position size and every P&L derived from them by 100x-10,000x.
 */
export function positionQuantity(p, contractSize = 1) {
  return num(p?.closeVol || p?.close_vol || p?.holdVol || p?.hold_vol || 0) * (contractSize || 1);
}

/**
 * Normalized view of one closed position.
 *
 * `realised` is NET of costs, exactly like Bybit's closedPnl. Measured on a
 * real ICPUSDT long — 3,055.4826 USDT at 2.437 closed at 2.383 — where the
 * price-only P&L is -67.7046 and MEXC reported -68.5272, the -0.8226 gap being
 * the costs baked in. The journal treats pnlFromExchange as GROSS and derives
 * net = gross - fees downstream, so `grossPnl` adds the fees back and the
 * subtraction lands on exactly the figure MEXC displays.
 *
 * `stopLoss` should come from the matched OPENING order when one was found, so
 * that it is the ORIGINAL stop rather than one later moved to break-even —
 * pass it in as `openOrder`.
 */
export function normalizeClosedPosition(p, { contractSize = 1, openOrder = null } = {}) {
  const fees = tradingFees(p);
  const netPnl = num(p?.realised || p?.realisedPnl || p?.realise || p?.realised_pnl || 0);
  const entryPrice = num(p?.openAvgPrice || p?.open_avg_price || 0);
  const exitPrice = num(p?.closeAvgPrice || p?.close_avg_price || 0);
  const quantity = positionQuantity(p, contractSize);

  const stopLoss = (openOrder?.sl > 0 ? openOrder.sl : num(p?.stopLossPrice || p?.stop_loss_price || 0)) || 0;
  const takeProfit = (openOrder?.tp > 0 ? openOrder.tp : num(p?.takeProfitPrice || p?.take_profit_price || 0)) || 0;

  // Risk in dollars and realized R, the same way the Bybit path derives them.
  const slDist = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;
  const riskAmount = slDist > 0 ? Number((slDist * quantity).toPrecision(6)) : 0;
  // UNSIGNED: the app stores R unsigned and takes the sign from pnl at display
  // time, so a signed value here renders as "--1.04R".
  const rrRatio = slDist > 0 && exitPrice > 0
    ? Number((Math.abs(exitPrice - entryPrice) / slDist).toFixed(2))
    : 0;

  return {
    direction: positionDirection(p),
    entryPrice,
    exitPrice,
    quantity,
    leverage: num(p?.leverage) || 1,
    fees,
    netPnl,
    grossPnl: netPnl + fees,
    stopLoss,
    takeProfit,
    riskAmount,
    rrRatio,
  };
}
