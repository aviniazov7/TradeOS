// MAE / MFE — Maximum Adverse / Favourable Excursion: how far price went
// AGAINST and FOR a trade between its entry and its exit.
//
//   MAE  the deepest drawdown the position sat through (price from entry to the
//        worst extreme). Compared with the stop it shows whether the stop was
//        too wide / too tight.
//   MFE  the best open profit the trade ever showed. Compared with what was
//        actually captured it shows how much was left on the table.
//
// Pure: takes a trade and OHLC candles ({ t (ms, candle OPEN time), o, h, l, c }
// ascending), returns numbers. Fetching candles lives in the component.
import {
  initialStopLoss, positionUnits, calculateWeightedExitPrice,
} from './calculations';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toMs = (d) => {
  if (!d) return 0;
  const date = typeof d?.toDate === 'function' ? d.toDate() : d instanceof Date ? d : new Date(d);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Shift a proxy series (GC=F for XAUUSD, NQ=F for NAS100) so the bar at the
 * fill matches the fill. A stable futures-versus-spot basis then does not
 * show up as MAE/MFE. The shape of the path is unchanged.
 */
export function rebaseCandlesToFill(candles, entryPrice, entryMs, stepMs = 0) {
  if (!Array.isArray(candles) || !candles.length || !(Number(entryPrice) > 0)) return candles;
  const step = stepMs > 0 ? stepMs : 1;
  let bar = candles.find((c) => c && c.t <= entryMs && c.t + step > entryMs);
  if (!bar) {
    let bestDist = Infinity;
    for (const c of candles) {
      if (!c || !Number.isFinite(c.t)) continue;
      const dist = Math.abs(c.t - entryMs);
      if (dist < bestDist) { bar = c; bestDist = dist; }
    }
  }
  const anchor = Number(bar?.c);
  if (!Number.isFinite(anchor)) return candles;
  const delta = Number(entryPrice) - anchor;
  if (Math.abs(delta) < 1e-8) return candles;
  return candles.map((c) => ({ ...c, o: c.o + delta, h: c.h + delta, l: c.l + delta, c: c.c + delta }));
}

/** Candle spacing in ms (the smallest gap — weekends/halts make bigger ones). */
export function candleStepMs(candles = []) {
  let step = Infinity;
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].t - candles[i - 1].t;
    if (d > 0 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : 0;
}

/** The average price the trade was closed at (weighted over partial exits). */
export function tradeExitPrice(trade) {
  const weighted = Array.isArray(trade?.exits) && trade.exits.length ? calculateWeightedExitPrice(trade.exits) : 0;
  return weighted > 0 ? weighted : num(trade?.exitPrice);
}

/** Can excursion be computed for this trade at all? (closed, priced, dated) */
export function canComputeExcursion(trade) {
  const entry = num(trade?.entryPrice);
  const exit = tradeExitPrice(trade);
  const a = toMs(trade?.entryDate);
  const b = toMs(trade?.exitDate);
  return entry > 0 && exit > 0 && a > 0 && b > a && (trade?.direction === 'long' || trade?.direction === 'short');
}

/**
 * @param trade   closed trade (direction, entryPrice, exit price(s), dates,
 *                quantity / positionSize / contract, stop via initialStopLoss)
 * @param candles OHLC covering the trade, ascending; may extend beyond it
 * @param opts.stepMs candle length in ms (inferred from the candles when omitted)
 * @returns null when not computable / no candle overlaps the trade, else
 *   { maePrice, mfePrice,   adverse / favourable move in price units (≥ 0)
 *     maeUsd, mfeUsd,       the same × position units (gross, before fees)
 *     maeR, mfeR,           in multiples of the ORIGINAL stop distance (null: no stop)
 *     capturedPrice, capturedUsd,  signed move at exit (negative = loss)
 *     efficiency,           captured / MFE, 0..1 for a winner (null if MFE = 0)
 *     maePct, mfePct,       % of entry
 *     stopTouched,          price reached the original stop (adverse move ≥ stop distance)
 *     candles, stepMs, coarse }  coarse = candles are long relative to the trade
 */
export function computeExcursion(trade, candles = [], opts = {}) {
  if (!canComputeExcursion(trade) || !Array.isArray(candles) || !candles.length) return null;
  const long = trade.direction === 'long';
  const entry = num(trade.entryPrice);
  const exit = tradeExitPrice(trade);
  const entryMs = toMs(trade.entryDate);
  const exitMs = toMs(trade.exitDate);
  const stepMs = opts.stepMs || candleStepMs(candles) || 0;

  // A candle opened at t covers [t, t + step). Keep those overlapping the trade.
  const inTrade = candles.filter((c) => c && c.t < exitMs && c.t + (stepMs || 1) > entryMs
    && Number.isFinite(c.h) && Number.isFinite(c.l));
  if (!inTrade.length) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const c of inTrade) {
    if (c.h > high) high = c.h;
    if (c.l < low) low = c.l;
  }
  // The trade's own prices are facts even when the candle feed disagrees a bit
  // (a different venue, a continuous futures contract): never report a best
  // price worse than the fill, nor an excursion smaller than what was captured.
  high = Math.max(high, entry, exit);
  low = Math.min(low, entry, exit);

  const maePrice = long ? entry - low : high - entry;
  const mfePrice = long ? high - entry : entry - low;
  const capturedPrice = long ? exit - entry : entry - exit;

  const units = positionUnits(trade);
  const stop = initialStopLoss(trade);
  const risk = stop > 0 ? Math.abs(entry - stop) : 0;

  const round = (n, d = 8) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);
  return {
    maePrice: round(maePrice),
    mfePrice: round(mfePrice),
    maeUsd: units > 0 ? round(maePrice * units, 2) : null,
    mfeUsd: units > 0 ? round(mfePrice * units, 2) : null,
    maeR: risk > 0 ? round(maePrice / risk, 2) : null,
    mfeR: risk > 0 ? round(mfePrice / risk, 2) : null,
    capturedPrice: round(capturedPrice),
    capturedUsd: units > 0 ? round(capturedPrice * units, 2) : null,
    efficiency: mfePrice > 0 ? round(capturedPrice / mfePrice, 4) : null,
    maePct: round((maePrice / entry) * 100, 2),
    mfePct: round((mfePrice / entry) * 100, 2),
    stopTouched: risk > 0 ? maePrice >= risk * 0.999 : null,
    stop: stop > 0 ? stop : null,
    candles: inTrade.length,
    stepMs,
    coarse: stepMs > 0 && stepMs * 3 > exitMs - entryMs,
  };
}

/**
 * Fields saved on the trade: mae / mfe in $, maeR / mfeR in multiples of the
 * original stop distance, excursionAt = when it was measured (ms).
 */
export function excursionFields(ex, now = Date.now()) {
  if (!ex) return null;
  return {
    // $ (gross, position-sized); null when the position size is unknown.
    mae: ex.maeUsd,
    mfe: ex.mfeUsd,
    maeR: ex.maeR,
    mfeR: ex.mfeR,
    excursionAt: now,
  };
}
