/**
 * MEXC closed-position record → the fields the journal needs. Pure, no I/O, so
 * it can be unit tested outside the Worker runtime (same reasoning as
 * newsImpact.js, tradeMerge.js and bybitPnl.js).
 *
 * On the net-versus-gross question, read the note on normalizeClosedPosition
 * before changing anything: it is settled by CONVENTION, not by measurement.
 *
 * Direction IS a single source of truth now: both the closed-position loop and
 * the open-positions branch of the sync route call positionDirection, so a new
 * field spelling has exactly one place to be added. They diverged before, and
 * the same record then imported long while open and short once closed.
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

/**
 * positionType 1 is a long; anything else is a short.
 *
 * THREE spellings, because the open-positions branch of the sync route reads a
 * third one (`p.type`) that this used to miss — so the same position could be
 * imported long while it was open and short once it closed.
 */
export function positionDirection(p) {
  return (p?.positionType ?? p?.position_type ?? p?.type) === 1 ? 'long' : 'short';
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
 * Whether the contract size is actually KNOWN.
 *
 * mexcContractSizes() returns {} when its fetch or parse fails, and the call
 * site coerces a missing entry to 1 — which silently leaves the quantity in
 * CONTRACTS. That was tolerable while quantity fed only display, but a risk
 * figure in DOLLARS derived from it would be wrong by the contract size, up to
 * 10,000x, and would look entirely plausible on screen.
 */
const sizeKnown = (contractSize) => Number.isFinite(contractSize) && contractSize > 0;

/**
 * Normalized view of one closed position.
 *
 * NET VERSUS GROSS — settled by CONVENTION, not measurement. Exchange
 * realized-PnL fields are net of costs (Bybit documents closedPnl that way),
 * and MEXC is assumed to follow. An attempt to confirm it from a screenshot of
 * a real ICPUSDT trade did NOT discriminate: the residual it produced depends
 * entirely on which price MEXC's Amount(USDT) is measured at, and the reading
 * that reproduces MEXC's own PNL Rate makes `realised` LESS negative than the
 * price move, which costs cannot do. The prices are also displayed to only
 * three decimals, so the price-only P&L is knowable to about +/-1.25 USDT —
 * wider than any fee being looked for. Settling it properly needs one API
 * capture of a closed position with its matching fee and funding records.
 *
 * What IS certain, and is why this is safe either way: netPnl is INVARIANT.
 * The journal derives net = gross - fees, and grossPnl is netPnl + fees, so
 * (netPnl + f) - f = netPnl for every f. The journal's Net P&L equals the
 * figure MEXC displays no matter which convention is true. Only `pnl` and the
 * return percentage read the gross value, and only when a fee field is present
 * — which this endpoint does not currently return.
 *
 * `stopLoss` prefers the `openOrder` the caller matched — see matchOpeningOrder
 * below for the time and price gates that matching applies. It falls back to
 * the position's CURRENT stop when nothing matched, so this is the original
 * stop in the common case, not a guarantee.
 */
// `contractSize` must be the REAL size, or null/undefined when it could not
// be looked up — do not coerce it to 1 at the call site, or the risk guard
// below can never fire.
export function normalizeClosedPosition(p, { contractSize = null, openOrder = null } = {}) {
  const fees = tradingFees(p);
  const netPnl = num(p?.realised || p?.realisedPnl || p?.realise || p?.realised_pnl || 0);
  const entryPrice = num(p?.openAvgPrice || p?.open_avg_price || 0);
  const exitPrice = num(p?.closeAvgPrice || p?.close_avg_price || 0);
  const quantity = positionQuantity(p, contractSize);

  const stopLoss = (openOrder?.sl > 0 ? openOrder.sl : num(p?.stopLossPrice || p?.stop_loss_price || 0)) || 0;
  const takeProfit = (openOrder?.tp > 0 ? openOrder.tp : num(p?.takeProfitPrice || p?.take_profit_price || 0)) || 0;

  // Risk in dollars and realized R, the same way the Bybit path derives them.
  // Risk is withheld when the contract size is unknown: quantity would still be
  // in contracts, and a dollar figure off by the contract size reads as fact.
  const slDist = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;
  const riskAmount = slDist > 0 && sizeKnown(contractSize)
    ? Number((slDist * quantity).toPrecision(6))
    : 0;
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

// Pick the opening order that belongs to a closed position, so its stop and
// target can be carried onto the journal entry.
//
// `opens` are the same-symbol, same-side filled orders, ascending by fillTime,
// each { fillTime, price, used, sl, tp }; `used` claims one order per position
// so two positions opened minutes apart cannot both inherit the same stop.
//
// The match is the nearest fill in time within TOL_MS whose price agrees with
// the position's average open price to within PRICE_TOL. The price gate is what
// keeps an unrelated order that merely filled in the same two-minute window
// from donating its stop — and now that the stop drives a dollar risk and an R
// on screen, a wrong one is not a cosmetic slip. It applies only when BOTH
// prices are known: an order with no recorded fill price still matches on time,
// exactly as it did before the gate existed.
export const OPEN_MATCH_TOL_MS = 2 * 60 * 1000;
export const OPEN_MATCH_PRICE_TOL = 0.002;

export function matchOpeningOrder(opens, openMs, openAvg) {
  if (!Array.isArray(opens) || !(openMs > 0)) return -1;
  const avg = num(openAvg);
  let bestIdx = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < opens.length; i++) {
    const o = opens[i];
    if (!o || o.used) continue;
    const d = Math.abs(num(o.fillTime) - openMs);
    // Strictly-better only: on a tie the earlier order wins, which keeps the
    // result stable regardless of how the exchange ordered equal timestamps.
    if (d > OPEN_MATCH_TOL_MS || d >= bestDelta) continue;
    const ap = num(o.price);
    if (ap > 0 && avg > 0 && Math.abs(ap - avg) > avg * OPEN_MATCH_PRICE_TOL) continue;
    bestDelta = d;
    bestIdx = i;
  }
  return bestIdx;
}
