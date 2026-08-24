// Live order tracking: the price-driven decisions behind the dashboard's open
// positions — did a limit order fill, did a stop get hit, was a take-profit
// reached, and what does the trade look like once it closes.
//
// This lived inside PendingLimitOrders.jsx, wrapped in component closures and
// useEffect bodies, which meant the code that computes and PERMANENTLY WRITES a
// trade's final netPnl had no test coverage at all. It is plain arithmetic over
// a trade and a price, so it belongs here where it can be exercised directly.
//
// Everything in this module is pure. Timing (the post-SL-change cooldown), refs
// that stop an effect firing twice, and the Firestore writes themselves stay in
// the component — those are React concerns, not trading logic.

import { computeTradeFields } from './calculations';

/** Long positions fill and profit upward; shorts do the mirror image. */
const isLong = (trade) => trade?.direction === 'long';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Has a pending LIMIT order reached its entry price? A long limit fills when
 * price trades down to it, a short when price trades up to it. A trade already
 * flagged `limitTriggered` stays triggered, and a non-limit order is never
 * "pending" in the first place.
 */
export function isLimitTriggered(trade, currentPrice) {
  if (trade?.limitTriggered) return true;
  if (trade?.orderType !== 'limit') return false;
  if (currentPrice == null) return false;
  const entry = num(trade.entryPrice);
  if (!entry) return false;
  return isLong(trade) ? currentPrice <= entry : currentPrice >= entry;
}

/**
 * Is the position actually exposed to the market? A limit order that has not
 * filled yet has no risk, so neither its stop nor its targets should fire.
 */
export function isMarketActive(trade, currentPrice) {
  return trade?.orderType !== 'limit' || isLimitTriggered(trade, currentPrice);
}

/** Has price traded through the stop? Closed trades and unfilled limits never. */
export function isStopHit(trade, currentPrice) {
  if (!trade || trade.status === 'closed' || currentPrice == null) return false;
  if (!isMarketActive(trade, currentPrice)) return false;
  const sl = num(trade.stopLoss);
  if (!sl) return false;
  return isLong(trade) ? currentPrice <= sl : currentPrice >= sl;
}

/**
 * Take-profit levels newly reached at this price.
 *
 * Indexes are continuous across ALREADY-EXECUTED exits and still-planned
 * targets, because that is how `tpReached` is stored: a trade that took TP1 as
 * a partial exit has its remaining targets numbered from 1, not from 0.
 * Returns `{ index, isLast }` per newly-reached level; levels already present
 * in `tpReached` are skipped so an effect cannot re-fire on them.
 */
export function reachedTakeProfits(trade, currentPrice, tpReached = []) {
  if (!trade || trade.status === 'closed' || currentPrice == null) return [];
  if (!isMarketActive(trade, currentPrice)) return [];

  const executed = (trade.exits || [])
    .map((e) => num(e.price))
    .filter((p) => p > 0);
  const planned = (trade.tps || []).map((p) => num(p)).filter((p) => p > 0);
  const total = executed.length + planned.length;
  const long = isLong(trade);

  const hits = [];
  planned.forEach((tp, i) => {
    const index = executed.length + i;
    if (tpReached.includes(index)) return;
    const reached = long ? currentPrice >= tp : currentPrice <= tp;
    if (reached) hits.push({ index, isLast: index === total - 1 });
  });
  return hits;
}

/** Unrealised P&L in dollars at the current price, from the stored notional. */
export function livePnl(trade, currentPrice) {
  const entry = num(trade?.entryPrice);
  const notional = num(trade?.positionSize);
  if (!currentPrice || !entry || !notional) return null;
  const qty = notional / entry;
  return isLong(trade) ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
}

/**
 * The document update for a trade closing at `closePrice` from a live stop or
 * final take-profit.
 *
 * Partial exits are completed rather than discarded: the already-executed TPs
 * plus the remaining size at the close price go through the canonical
 * computeTradeFields, so the stored netPnl and result account for both the
 * partials AND fees — which is why a stop that still lands in net profit after
 * earlier TPs is not recorded as a loss. A clean full close carries no exits
 * array and just uses exitPrice.
 *
 * `exitDate` is passed in (the caller supplies Firestore's server timestamp) so
 * this stays a pure function of its inputs.
 */
export function buildCloseUpdate(trade, closePrice, exitDate) {
  // Refuse rather than coerce. This is a WRITE path: a price that does not
  // parse used to land as NaN, which is loudly broken; coercing it to 0 would
  // instead store a plausible-looking total loss, permanently.
  const price = parseFloat(closePrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const entry = num(trade?.entryPrice);

  const executed = (trade?.exits || [])
    .map((e) => ({ price: num(e.price), percent: num(e.percent) }))
    .filter((e) => e.price > 0 && e.percent > 0);
  const executedPct = executed.reduce((s, e) => s + e.percent, 0);
  const remainingPct = Math.max(0, 100 - executedPct);
  const exits = executed.length && remainingPct > 0
    ? [...executed, { price, percent: remainingPct }]
    : executed;

  const quantity = num(trade?.quantity) || (entry > 0 ? num(trade?.positionSize) / entry : 0);
  const { pnl, pnlPercent, rrRatio, netPnl, result } = computeTradeFields({
    ...trade, status: 'closed', exitPrice: price, exits, quantity,
  });

  const update = { status: 'closed', exitPrice: price, pnl, pnlPercent, rrRatio, netPnl, result };
  if (exitDate !== undefined) update.exitDate = exitDate;
  if (executed.length) update.exits = exits;
  return update;
}
