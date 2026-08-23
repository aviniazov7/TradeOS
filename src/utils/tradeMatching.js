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

// How much of the open position an incoming close must account for before we
// believe it closed it. Anything materially smaller is a PARTIAL close: the
// position is still live on the exchange, and reconciling it would mark a
// running trade closed, hide it from risk supervision and record a fabricated
// size. Partials are left to import as their own realized rows.
const QUANTITY_TOLERANCE = 0.01; // 1%

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
export function matchByExternalId(trades, row, { requireOpen = false } = {}) {
  const rowIds = tradeExternalIds(row);
  if (!rowIds.length) return null;
  const rowSource = row?.source || null;
  return (trades || []).find((t) => {
    // MEXC/OKX/Bitget position ids are bare numbers, so an unscoped comparison
    // can collide across exchanges and rewrite a completely unrelated trade.
    if (rowSource && t?.source && t.source !== rowSource) return false;
    // An incoming OPEN row must never resurrect a closed trade: the payload
    // would set status back to 'open' while its realized exit fields stayed
    // behind, hiding the P&L from every stat and re-arming it as live risk.
    if (requireOpen && t?.status === 'closed') return false;
    return tradeExternalIds(t).some((id) => rowIds.includes(id));
  }) || null;
}

/**
 * The last moment we have positive evidence the exchange still held this
 * position open.
 *
 * `updatedAt` is deliberately NOT consulted: it is a generic mutation stamp
 * that every journal edit bumps, so annotating a live position would push it
 * past the close's timestamp and permanently block that close from ever
 * reconciling — the exact bug this matcher exists to prevent. `exchangeOpenAt`
 * is written only by a sync that actually saw the position live; the other two
 * cover documents written before that field existed.
 */
function lastSeenOpenMs(t) {
  return Math.max(
    tradeDateMs(t?.exchangeOpenAt) ?? -Infinity,
    tradeDateMs(t?.entryDate) ?? -Infinity,
    tradeDateMs(t?.createdAt) ?? -Infinity,
  );
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
export function matchOpenPosition(trades, row, {
  requireEntryPrice = true,
  requireFullClose = true,
  exclude = null,
} = {}) {
  if (!row?.source || !row?.pair || !row?.direction) return null;
  const rowEntry = Number(row.entryPrice) || 0;
  const rowQty = Number(row.quantity) || 0;
  const closeMs = tradeDateMs(row.exitDate);

  const candidates = (trades || []).filter((t) => {
    if (t?.status !== 'open') return false;
    if (t.source !== row.source) return false;
    if (t.pair !== row.pair || t.direction !== row.direction) return false;
    // Already claimed by another row of the same import batch. Imports fan out
    // concurrently over a `trades` snapshot that cannot update between calls,
    // so without this every close sharing a position's identity would match
    // the SAME document and the last write would silently destroy the rest.
    if (exclude && t.id != null && exclude.has(t.id)) return false;
    // A close that happened BEFORE the exchange last told us this position was
    // still open cannot belong to it. Without this, syncing a long history
    // while holding a live position would let a months-old close on the same
    // pair reconcile into it and mark it closed.
    const seenOpenMs = lastSeenOpenMs(t);
    if (closeMs != null && Number.isFinite(seenOpenMs) && seenOpenMs > closeMs) return false;
    // A close that covers materially less than the position is a PARTIAL —
    // the rest is still running, so the journal's open row must survive it.
    if (requireFullClose) {
      const openQty = Number(t.quantity) || 0;
      if (openQty > 0 && rowQty > 0 && rowQty < openQty * (1 - QUANTITY_TOLERANCE)) return false;
    }
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
/**
 * Journal trades still marked open for an exchange that no longer reports them.
 *
 * These are the residue of a bug that is now fixed: a position imported while
 * open, whose close then landed as a SEPARATE trade because the two carry
 * unrelated exchange ids. The close cannot reconcile them retroactively — it
 * was already imported — so they sit in the journal forever, counted by
 * RiskSupervisor as live risk that does not exist.
 *
 * `openRows` MUST come from a SUCCESSFUL open-positions response: an empty list
 * because the call failed is indistinguishable from an empty list because
 * nothing is open, and acting on the former would flag every live position as
 * stale. Callers are responsible for that distinction.
 */
export function findStaleOpenTrades(trades, openRows, source) {
  if (!source || !Array.isArray(openRows)) return [];
  const live = new Set(
    openRows
      .filter((r) => r?.pair && r?.direction)
      .map((r) => `${String(r.pair).toUpperCase()}|${r.direction}`)
  );
  return (trades || []).filter((t) =>
    t?.status === 'open'
    && t.source === source
    && t.pair && t.direction
    && !live.has(`${String(t.pair).toUpperCase()}|${t.direction}`)
  );
}

export function matchSyncRow(trades, row, { isOpenRow = false, exclude = null } = {}) {
  return matchByExternalId(trades, row, { requireOpen: isOpenRow })
    || matchOpenPosition(trades, row, {
      requireEntryPrice: !isOpenRow,
      requireFullClose: !isOpenRow,
      exclude,
    });
}
