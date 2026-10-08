// Open → closed reconciliation for exchange-synced trades.
//
// An exchange position imported while OPEN is stored under the open-position
// id, but the same position arrives CLOSED under a different id on every
// venue:
//   • Bybit  open `${symbol}_${positionIdx}_${updatedTime}` → closed: the
//            closing order id(s)
//   • MEXC   open positionId → closed: the history row id (or symbol_openMs)
//   • OKX    open posId → closed `${posId}:${cTime}`
//   • Bitget open positionId (or pair_cTime) → closed positionId
// so the id upsert in useExchangeImport missed and the sync wrote a SECOND
// (closed) trade next to a ghost open one. This finds the open trade a closed
// row belongs to, so the import updates it instead.

import { tradeExternalIds } from './tradeIds';

// Open-position snapshots can be taken a little before the closed row's
// reported entry (clock skew between endpoints) and Bybit stamps an open
// position with its LAST activity time, which can be anywhere in the
// position's life — so the open trade's entry must fall inside the closed
// position's lifetime, padded by this much on both sides.
export const RECONCILE_TIME_TOLERANCE_MS = 10 * 60 * 1000;
// Average entry drift allowed between the open snapshot and the final
// position (fees/rounding; a small add to the position).
export const RECONCILE_PRICE_TOLERANCE = 0.005;

const toMs = (v) => {
  if (!v) return 0;
  const d = typeof v?.toDate === 'function' ? v.toDate() : v instanceof Date ? v : new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};
const normPair = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// "posId:cTime" → "posId" (OKX closed ids carry the open position id first).
const idRoot = (id) => String(id).split(':')[0];
const relDiff = (a, b) => {
  const x = parseFloat(a);
  const y = parseFloat(b);
  if (!(x > 0) || !(y > 0)) return Infinity;
  return Math.abs(x - y) / y;
};

/** Every id a closed row can share with its open position. */
export function closedRowIdentity(row) {
  const ids = new Set();
  for (const id of tradeExternalIds(row)) { ids.add(String(id)); ids.add(idRoot(id)); }
  if (row?.positionId != null && row.positionId !== '') ids.add(String(row.positionId));
  return ids;
}

/**
 * The open (or partial) trade a closed exchange row should close, or null.
 *
 * Candidates: same source (exchange), pair and direction; status open/partial;
 * not already claimed by another row of the same import batch; and — when
 * both sides have dates — an open entry inside the closed position's
 * lifetime. A candidate must then share a position id (OKX posId prefix,
 * positionId) OR have an entry price within RECONCILE_PRICE_TOLERANCE. A
 * close that is clearly SMALLER than the open snapshot is a partial close of
 * a still-open position and is not matched (the remainder stays open).
 * Best: id match first, then the closest entry price, then the closest time.
 */
export function findOpenTradeForClosed(row, trades = [], { claimed } = {}) {
  if (!row || !row.source || row._isOpen || row.status === 'open') return null;
  const pair = normPair(row.pair);
  if (!pair) return null;
  const rowIds = closedRowIdentity(row);
  const entryMs = toMs(row.entryDate);
  const exitMs = Math.max(toMs(row.exitDate), entryMs);
  const rowQty = parseFloat(row.quantity) || 0;

  let best = null;
  for (const t of trades) {
    if (!t || (t.status !== 'open' && t.status !== 'partial')) continue;
    if (claimed?.has(t.id)) continue;
    if (t.source !== row.source || t.direction !== row.direction) continue;
    if (normPair(t.pair) !== pair) continue;

    const tMs = toMs(t.entryDate);
    const datesKnown = entryMs > 0 && tMs > 0;
    if (datesKnown && (tMs < entryMs - RECONCILE_TIME_TOLERANCE_MS || tMs > exitMs + RECONCILE_TIME_TOLERANCE_MS)) continue;

    const idMatch = tradeExternalIds(t).some((id) => rowIds.has(String(id)) || rowIds.has(idRoot(id)));
    const priceDiff = relDiff(t.entryPrice, row.entryPrice);
    const priceMatch = priceDiff <= RECONCILE_PRICE_TOLERANCE;
    // Without dates a price-only match could pick an unrelated old trade.
    if (!idMatch && !(priceMatch && datesKnown)) continue;

    const tQty = parseFloat(t.quantity) || 0;
    if (rowQty > 0 && tQty > 0 && rowQty < tQty * 0.98) continue;

    const score = [idMatch ? 0 : 1, Number.isFinite(priceDiff) ? priceDiff : 1, datesKnown ? Math.abs(tMs - entryMs) : Infinity];
    if (!best || score[0] < best.score[0]
      || (score[0] === best.score[0] && (score[1] < best.score[1]
        || (score[1] === best.score[1] && score[2] < best.score[2])))) {
      best = { trade: t, score };
    }
  }
  return best ? best.trade : null;
}
