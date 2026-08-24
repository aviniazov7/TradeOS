/**
 * Exchange close records → journal trades. Pure functions, no I/O, so they can
 * be unit tested outside the Worker runtime (same reasoning as newsImpact.js).
 *
 * Bybit's closed-pnl endpoint returns ONE ROW PER CLOSING ORDER, so a position
 * taken off in several take-profits arrives as several rows and, left alone,
 * imports as several unrelated journal trades. This merges the rows belonging
 * to one position into a single trade whose exits[] carries the TP1/TP2/…
 * breakdown, exactly like a manually entered multi-TP trade.
 *
 * This is the code most likely to corrupt journal data when an exchange changes
 * its API, and until now none of it was reachable from a test. Every rule below
 * exists because of a specific failure that already happened in production —
 * the comments say which.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const MERGE_WINDOW_MS = 7 * DAY_MS;

const ms = (d) => new Date(d).getTime();

/**
 * The identity two close rows must share to belong to the same position.
 *
 * Prefer the matched OPENING order: grouping on entry price alone merged two
 * DIFFERENT positions that happened to fill at the same limit price inside the
 * window into one trade with a combined quantity and a fabricated TP1/TP2
 * breakdown.
 */
export function positionKey(row) {
  return row?._openOrderId
    ? `${row.pair}|${row.direction}|#${row._openOrderId}`
    : `${row?.pair}|${row?.direction}|${row?.entryPrice}`;
}

/** Collapse one cluster of close rows into a single journal trade. */
function mergeCluster(cluster) {
  if (cluster.length === 1) {
    return { ...cluster[0], externalIds: [cluster[0].externalId] };
  }
  const totalQty = cluster.reduce((s, r) => s + r.quantity, 0);
  const exits = cluster.map((r) => ({
    price: r.exitPrice,
    percent: totalQty > 0 ? Math.round((r.quantity / totalQty) * 10000) / 100 : 0,
  }));
  // Pin the last slice so the percents sum to EXACTLY 100. Rounded thirds
  // (33.33 × 3 = 99.99) demoted the trade from 'closed' to 'partial' on its next
  // edit-save, which made it vanish from analytics; 100.01 blocked saving.
  const sumButLast = exits.slice(0, -1).reduce((s, e) => s + e.percent, 0);
  exits[exits.length - 1].percent = Number(Math.max(0, 100 - sumButLast).toFixed(2));

  const rawWeighted = totalQty > 0
    ? cluster.reduce((s, r) => s + r.exitPrice * r.quantity, 0) / totalQty
    : cluster[cluster.length - 1].exitPrice;
  // Trim float noise (0.16276246773993532 → 0.16276247) so the UI shows a sane
  // weighted price.
  const exitPrice = rawWeighted > 0 ? Number(rawWeighted.toPrecision(8)) : rawWeighted;

  const mergedSl = cluster.find((r) => r.stopLoss > 0)?.stopLoss || 0;
  const first = cluster[0];
  // Risk and R are recomputed for the FULL position — the per-record values
  // only ever covered that record's slice of the quantity.
  const slDist = mergedSl > 0 ? Math.abs(first.entryPrice - mergedSl) : 0;
  const riskAmount = slDist > 0 ? Number((slDist * totalQty).toPrecision(6)) : 0;
  // Unsigned, like the per-row value: the app stores R unsigned and takes the
  // sign from pnl at display time.
  const rrRatio = slDist > 0 && exitPrice > 0
    ? Number((Math.abs(exitPrice - first.entryPrice) / slDist).toFixed(2))
    : 0;

  return {
    ...first,
    quantity: totalQty,
    exitPrice,
    exits,
    pnlFromExchange: cluster.reduce((s, r) => s + r.pnlFromExchange, 0),
    fees: +(cluster.reduce((s, r) => s + r.fees, 0)).toPrecision(10),
    entryDate: cluster.reduce((m, r) => (ms(r.entryDate) < ms(m) ? r.entryDate : m), first.entryDate),
    exitDate: cluster[cluster.length - 1].exitDate,
    stopLoss: mergedSl,
    riskAmount,
    rrRatio,
    // EVERY closing order's id. The client upserts on any-id overlap, so a
    // position that keeps closing across syncs updates the same journal trade
    // instead of being filtered out as "already imported" — which silently
    // dropped every close after the first and froze the trade as a win.
    externalIds: cluster.map((r) => r.externalId),
  };
}

/**
 * Merge per-close rows into journal trades, newest close first.
 *
 * Rows of one position separated by more than `windowMs` are treated as
 * different positions: the same pair reopened at the same price weeks later is
 * a new trade, not a late take-profit on the old one.
 */
export function mergeClosedPositions(rows, { windowMs = MERGE_WINDOW_MS } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = positionKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const merged = [];
  for (const group of groups.values()) {
    group.sort((a, b) => ms(a.exitDate) - ms(b.exitDate));
    let cluster = [];
    const flush = () => {
      if (cluster.length) merged.push(mergeCluster(cluster));
      cluster = [];
    };
    for (const row of group) {
      if (cluster.length && ms(row.exitDate) - ms(cluster[cluster.length - 1].exitDate) > windowMs) flush();
      cluster.push(row);
    }
    flush();
  }

  for (const t of merged) delete t._openOrderId;
  merged.sort((a, b) => ms(b.exitDate) - ms(a.exitDate));
  return merged;
}
