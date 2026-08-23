// Matching an incoming exchange-sync row to the journal trade it belongs to.
//
// Exchange rows arrive keyed by DIFFERENT ids depending on which endpoint
// produced them: an OPEN position is keyed by a snapshot of the position
// (`SYMBOL_posIdx_updatedTime` on Bybit, the positionId on MEXC), while the
// row that later reports that same position's CLOSE is keyed by the CLOSING
// ORDER's id. Those two never overlap, so id-matching alone left the original
// open row in the journal forever AND inserted the close as a second,
// duplicate trade — the phantom open row then counted as live risk in
// RiskSupervisor and suppressed future proposals for that pair.
//
// Position identity (exchange + pair + direction) closes that gap. It is only
// ever used as a FALLBACK after id-matching fails, and only against trades the
// same exchange created, so a manually entered trade is never rewritten by a
// sync.

import { tradeExternalIds } from './tradeIds';

// How far the incoming row's entry price may sit from the open trade's before
// we stop believing they are the same position. Wide enough to survive the
// exchange re-averaging a position, tight enough that a genuinely different
// position on the same pair doesn't get swallowed.
const ENTRY_PRICE_TOLERANCE = 0.01; // 1%

/**
 * Milliseconds for any date shape the app stores: Firestore Timestamp (live or
 * serialized), Date, ISO string, or epoch ms. Returns null when unparseable —
 * callers must treat null as "unknown", never as 0 (epoch), which would make
 * every comparison silently true.
 */
export function tradeDateMs(value) {
  if (value == null) return null;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object') {
    const secs = value.seconds ?? value._seconds;
    return typeof secs === 'number' ? secs * 1000 : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * The journal trade whose exchange ids overlap the incoming row's — the
 * highest-confidence match. A Multi-TP position that closed across two syncs
 * carries the already-imported close's id alongside the new ones.
 */
export function matchByExternalId(trades, row) {
  const rowIds = tradeExternalIds(row);
  if (!rowIds.length) return null;
  return (trades || []).find((t) => tradeExternalIds(t).some((id) => rowIds.includes(id))) || null;
}

/**
 * The still-open journal trade that an incoming row describes, matched on
 * position identity rather than ids.
 *
 * `requireEntryPrice` guards the risky direction: a CLOSED row could belong to
 * an older position on the same pair, so it must also agree on entry price.
 * An OPEN row needs no such guard — an exchange holds at most one live
 * position per (pair, direction), so identity alone is conclusive, and
 * demanding a price match there would duplicate the row every time the user
 * scaled in and moved the average.
 */
export function matchOpenPosition(trades, row, { requireEntryPrice = true } = {}) {
  if (!row?.source || !row?.pair || !row?.direction) return null;
  const rowEntry = Number(row.entryPrice) || 0;
  const closeMs = tradeDateMs(row.exitDate);

  const candidates = (trades || []).filter((t) => {
    if (t?.status !== 'open') return false;
    if (t.source !== row.source) return false;
    if (t.pair !== row.pair || t.direction !== row.direction) return false;
    // A close that happened BEFORE the exchange last told us this position was
    // still open cannot belong to it. Without this, syncing a long history
    // while holding a live position would let a months-old close on the same
    // pair reconcile into it and mark it closed. `updatedAt` is the strongest
    // signal we have (the row was refreshed from live open positions then);
    // entryDate/createdAt cover documents written before that was tracked.
    const lastKnownOpenMs = Math.max(
      tradeDateMs(t.entryDate) ?? -Infinity,
      tradeDateMs(t.createdAt) ?? -Infinity,
      tradeDateMs(t.updatedAt) ?? -Infinity,
    );
    if (closeMs != null && Number.isFinite(lastKnownOpenMs) && lastKnownOpenMs > closeMs) return false;
    if (!requireEntryPrice) return true;
    const openEntry = Number(t.entryPrice) || 0;
    if (!(openEntry > 0) || !(rowEntry > 0)) return false;
    return Math.abs(openEntry - rowEntry) <= rowEntry * ENTRY_PRICE_TOLERANCE;
  });
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  // Several live positions on the same pair+direction (hedged or legacy
  // duplicates): the nearest entry price wins, and the most recently opened
  // breaks a tie — the freshest row is the one the exchange is reporting on.
  return candidates.reduce((best, t) => {
    const dist = (x) => (rowEntry > 0 ? Math.abs((Number(x.entryPrice) || 0) - rowEntry) : 0);
    const d = dist(t);
    const bd = dist(best);
    if (d !== bd) return d < bd ? t : best;
    return (tradeDateMs(t.entryDate) || 0) > (tradeDateMs(best.entryDate) || 0) ? t : best;
  });
}

/**
 * The journal trade an incoming sync row should UPDATE, or null when it is
 * genuinely new. Ids first, position identity second.
 */
export function matchSyncRow(trades, row, { isOpenRow = false } = {}) {
  return matchByExternalId(trades, row)
    || matchOpenPosition(trades, row, { requireEntryPrice: !isOpenRow });
}
