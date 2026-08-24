/**
 * Bybit closed-PnL record → the fields every consumer needs. Pure, no I/O, so
 * it can be unit tested outside the Worker runtime.
 *
 * Two consumers read the SAME endpoint and each used to re-derive these fields
 * for itself: the cron poller that pushes "position closed" notifications, and
 * the /exchange/sync route that writes journal trades. They disagreed in shape
 * and, more dangerously, they encoded the fee and side semantics twice — so a
 * correction learned on one path could silently miss the other. Both quirks
 * below cost real debugging once already; they are now stated in one place.
 */

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Trading fees on the record. closed-pnl carries openFee + closeFee; the
 * execFee/tradingFee/cumExecFee names belong to OTHER endpoints and are only a
 * fallback — reading those first is why fees imported as 0 for a long time.
 * toPrecision(10) trims float-sum noise (5.079 + 0.0000000003 rendering as a
 * twelve-digit number in the edit form).
 */
export function tradingFees(p) {
  // The fallback chain is `||`, not `??`, on purpose: a field present but zero
  // must fall through to the next name, which is what the original did.
  const raw = Math.abs(num(p?.openFee)) + Math.abs(num(p?.closeFee))
    || Math.abs(num(p?.execFee || p?.tradingFee || p?.cumExecFee || 0));
  return raw ? +raw.toPrecision(10) : 0;
}

/**
 * The POSITION's direction.
 *
 * `side` on closed-pnl is the side of the CLOSING order, so a long — which is
 * closed by a Sell — reports side 'Sell'. Reading it directly imported every
 * long as a short until this flip was verified against a real account.
 */
export function positionDirection(p) {
  return p?.side === 'Sell' ? 'long' : 'short';
}

/**
 * Normalized view of one closed-PnL record.
 *
 * `netPnl` is Bybit's own figure: closedPnl is ALREADY net of the open and
 * close fees. `grossPnl` adds them back, because the journal treats
 * pnlFromExchange as gross and derives net = gross − fees downstream; passing
 * the net value straight through subtracted the fees a SECOND time and turned a
 * real $10.02 win into $6.45. Consumers pick the one they mean rather than
 * re-deriving it.
 */
export function normalizeClosedPnl(p) {
  const fees = tradingFees(p);
  const netPnl = num(p?.closedPnl);
  const entryPrice = num(p?.avgEntryPrice ?? p?.entryPrice);
  const quantity = num(p?.qty);
  const leverage = num(p?.leverage) || 1;
  const createdMs = parseInt(p?.createdTime, 10) || 0;
  const updatedMs = parseInt(p?.updatedTime, 10) || 0;
  const margin = entryPrice > 0 && quantity > 0 ? (entryPrice * quantity) / leverage : 0;

  return {
    externalId: p?.orderId || String(updatedMs || createdMs || ''),
    pair: p?.symbol,
    direction: positionDirection(p),
    entryPrice,
    exitPrice: num(p?.avgExitPrice ?? p?.exitPrice),
    quantity,
    leverage,
    fees,
    netPnl,
    grossPnl: netPnl + fees,
    // Return on the margin actually committed.
    roiPct: margin > 0 ? (netPnl / margin) * 100 : 0,
    createdMs,
    updatedMs,
    exitMs: updatedMs || createdMs || 0,
  };
}
