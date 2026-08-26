import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrades } from './useTrades';
import { addToUserCollection, updateUserDocument, timestamp, dateToTimestamp } from '../services/firestoreService';
import { DEFAULT_LEVERAGE } from '../utils/constants';
import { tradeExternalIds } from '../utils/tradeIds';
import { matchSyncRow, findStaleOpenTrades } from '../utils/tradeMatching';

// Imports a single exchange-synced trade into the given journal. Shared by the
// journal's exchange tab, the trades-tab proposal banner AND the standalone
// /exchange route, so every path writes identical documents — the standalone
// route used to blind-add every row, double-counting a TP1 that was already
// imported from the proposals banner.
export function useExchangeImport(journalId) {
  const { user } = useAuth();
  const { trades, updateTrade, deleteTrade } = useTrades(journalId);

  // Every close-order id already present in this journal — used by the sync
  // modal to flag rows as updates rather than new trades.
  const existingExternalIds = useMemo(() => {
    const s = new Set();
    for (const t of trades) for (const id of tradeExternalIds(t)) s.add(id);
    return s;
  }, [trades]);

  // `claimed` is the set of journal-document ids another row of the SAME import
  // batch has already reconciled into. Imports run against a `trades` snapshot
  // that cannot refresh between rows, so without it every row sharing a
  // position's identity matches the same document and the last write silently
  // destroys the others.
  const importTrade = useCallback(async (t, claimed = null) => {
    if (!user) throw new Error('No user');
    const claim = (doc, row) => {
      // Only identity matches need claiming — an id match is unique to its row.
      const ids = tradeExternalIds(row);
      const byId = ids.length && tradeExternalIds(doc).some((id) => ids.includes(id));
      if (!byId && claimed && doc?.id != null) claimed.add(doc.id);
      return doc;
    };
    const safeTs = (raw) => {
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    };
    const entryD = safeTs(t.entryDate) || new Date();
    const exitD = safeTs(t.exitDate) || entryD;
    const fees = typeof t.fees === 'number' ? Math.abs(t.fees) : 0;

    // Open positions from the exchange: keep status=open and save every field
    // the worker provided (stopLoss, tps, leverage, qty, …) instead of
    // squashing them into a closed-trade shape.
    if (t._isOpen) {
      const ep = t.entryPrice > 0 ? t.entryPrice : 0;
      const qty = t.quantity > 0 ? t.quantity : 0;
      const lev = Math.min(200, Math.max(1, t.leverage || DEFAULT_LEVERAGE));

      // The open-position id embeds the exchange's `updatedTime`, so the SAME
      // live position arrives with a brand-new id on every sync and used to
      // import as another duplicate row. Refresh the position we already hold
      // instead. Only values the exchange actually reports are written: the
      // worker hardcodes fees:0 on every open position and reports stopLoss:0
      // whenever the stop is not attached exchange-side, so writing those
      // unconditionally erased a stop the user had typed in and fired a false
      // "position with no protective stop" alert. entryDate is left alone too:
      // it records when the position opened, and each snapshot would drag it
      // forward. The snapshot id is NOT accumulated into externalIds — the next
      // snapshot's id differs by construction, so it could never match anyway
      // and the array would grow on every single sync.
      const live = matchSyncRow(trades, t, { isOpenRow: true, exclude: claimed });
      if (live) {
        claim(live, t);
        const slOpen = parseFloat(t.stopLoss) || 0;
        return updateUserDocument(user.uid, 'trades', live.id, {
          entryPrice: ep, quantity: qty, leverage: lev,
          ...(slOpen > 0 ? { stopLoss: slOpen } : {}),
          ...(Array.isArray(t.tps) && t.tps.length ? { tps: t.tps } : {}),
          ...(fees > 0 ? { fees } : {}),
          status: 'open',
          positionSize: t.positionSize || ep * qty,
          margin: ep * qty / lev,
          ...(t.liquidationPrice ? { liquidationPrice: t.liquidationPrice } : {}),
          externalId: live.externalId || t.externalId,
          // Positive evidence the exchange still held this position open, which
          // is what the reconciler's freshness guard needs. `updatedAt` cannot
          // serve: every journal edit bumps it, and a user annotating a live
          // position would then block its close from ever reconciling.
          exchangeOpenAt: timestamp(),
          updatedAt: timestamp(),
        });
      }

      return addToUserCollection(user.uid, 'trades', {
        pair: t.pair, direction: t.direction,
        entryPrice: ep, quantity: qty, leverage: lev,
        stopLoss: parseFloat(t.stopLoss) || 0,
        tps: Array.isArray(t.tps) ? t.tps : [],
        fees,
        status: 'open',
        orderType: t.orderType || 'market',
        entryDate: entryD,
        source: t.source, externalId: t.externalId,
        positionSize: t.positionSize || ep * qty,
        margin: ep * qty / lev,
        ...(t.session ? { session: t.session } : {}),
        ...(t.liquidationPrice ? { liquidationPrice: t.liquidationPrice } : {}),
        journalId: journalId || null,
        // See the refresh path above — this is what the close reconciler reads.
        exchangeOpenAt: timestamp(),
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });
    }

    // Upsert: the row belongs to an existing trade when ANY of its close-order
    // ids matches — a Multi-TP position that closed across two syncs carries
    // the already-imported close's id alongside the new ones.
    // …and when NOTHING overlaps, the row may still be the close of a position
    // we imported while it was open — those carry a position-snapshot id that
    // can never match a closing order's id. Reconciling on position identity
    // is what stops the close landing as a duplicate trade while the original
    // open row lingers forever as phantom live risk.
    const rowIds = tradeExternalIds(t);
    const existing = matchSyncRow(trades, t, { exclude: claimed });
    if (existing) claim(existing, t);
    if (existing) {
      // Pass the FULL merged shape — updateTrade recomputes pnl / R / percent /
      // result / positionSize from exactly what it's given, so the old partial
      // object (dates+prices+pnl only) zeroed rrRatio, NaN'd positionSize and
      // left quantity/exits/result stale: a stop-out arriving after TP1 turned
      // the pnl negative while the trade stayed a 'win'.
      const ep = t.entryPrice > 0 ? t.entryPrice : existing.entryPrice;
      // An open document has NO exitPrice, and Firestore rejects an update that
      // carries `undefined` — the whole write would throw, losing the close.
      const xp = t.exitPrice > 0 ? t.exitPrice : (existing.exitPrice || 0);
      const qty = t.quantity > 0 ? t.quantity : existing.quantity;
      const lev = Math.min(200, Math.max(1, t.leverage || existing.leverage || DEFAULT_LEVERAGE));
      return updateTrade(existing.id, {
        entryDate: entryD,
        exitDate: exitD,
        fees,
        entryPrice: ep,
        exitPrice: xp,
        quantity: qty,
        leverage: lev,
        stopLoss: parseFloat(t.stopLoss) || existing.stopLoss || 0,
        ...(Array.isArray(t.exits) && t.exits.length ? { exits: t.exits } : {}),
        riskAmount: parseFloat(t.riskAmount) || existing.riskAmount || 0,
        pnlFromExchange: t.pnlFromExchange ?? existing.pnlFromExchange,
        status: 'closed',
        externalId: existing.externalId || t.externalId,
        externalIds: [...new Set([...tradeExternalIds(existing), ...rowIds])],
        ...(t.session ? { session: t.session } : {}),
        // Reconciling a position that was open: a liquidation price is
        // meaningless once the position is gone and would keep rendering on
        // the closed trade.
        ...(existing.status === 'open' && existing.liquidationPrice != null
          ? { liquidationPrice: null }
          : {}),
      });
    }

    // Create new trade — compute netPnl correctly by subtracting fees, and
    // derive result from netPnl (not gross pnl) so a small win eaten by large
    // fees is correctly classified as a loss.
    const ep = t.entryPrice > 0 ? t.entryPrice : 1;
    // exitPrice fallback: use entry price (yields 0 PnL) instead of 1, which
    // previously surfaced as a phantom TP at price 1.
    const xp = t.exitPrice > 0 ? t.exitPrice : ep;
    const qty = t.quantity > 0 ? t.quantity : 1;
    const lev = Math.min(200, Math.max(1, t.leverage || DEFAULT_LEVERAGE));
    const pnl = t.pnlFromExchange ?? 0;
    const netPnlImport = pnl - fees;
    const result = netPnlImport > 0 ? 'win' : netPnlImport < 0 ? 'loss' : 'breakeven';
    return addToUserCollection(user.uid, 'trades', {
      pair: t.pair, direction: t.direction,
      orderType: t.orderType || 'market',
      entryPrice: ep, exitPrice: xp, quantity: qty, leverage: lev,
      stopLoss: parseFloat(t.stopLoss) || 0,
      tps: Array.isArray(t.tps) ? t.tps : [],
      // Multi-TP breakdown from the exchange sync (Bybit positions closed in
      // several take-profits) — dropping it collapses the trade back to a
      // single 100% exit in the edit form.
      ...(Array.isArray(t.exits) && t.exits.length ? { exits: t.exits } : {}),
      ...(t.session ? { session: t.session } : {}),
      fees, status: 'closed',
      entryDate: entryD, exitDate: exitD,
      source: t.source, externalId: t.externalId,
      // All the position's close-order ids — the next sync's merged row is
      // matched to this document by id overlap (see the upsert above).
      ...(rowIds.length > 1 ? { externalIds: rowIds } : {}),
      pnlFromExchange: pnl, pnl, netPnl: netPnlImport,
      // NET-based, matching computeTradeFields and the exchange's own PNL Rate.
      // A gross-based figure overstated the return by the cost of the trade.
      pnlPercent: (netPnlImport / (ep * qty)) * 100 * lev,
      // Risk ($) and realized R computed by the worker from the REAL exchange
      // SL and quantity — so nothing needs manual entry after import.
      riskAmount: parseFloat(t.riskAmount) || 0,
      rrRatio: parseFloat(t.rrRatio) || 0,
      result,
      positionSize: ep * qty, margin: (ep * qty) / lev,
      journalId: journalId || null,
      createdAt: dateToTimestamp(entryD), updatedAt: timestamp(),
    });
  }, [user, trades, updateTrade, journalId]);

  // Import a whole selection. Callers MUST use this rather than fanning out
  // over importTrade: rows are matched against a `trades` snapshot that cannot
  // refresh mid-batch, so running them concurrently let two rows reconcile into
  // the same document and one write silently destroyed the other.
  //
  // Order matters as much as serialisation. A close and the open row of a
  // DIFFERENT position on the same pair both look like that one document —
  // e.g. yesterday's long closed and a new long opened before this sync — and
  // only the close is entitled to it. Closes therefore run first and claim
  // their document, leaving the open row to correctly create a new one.
  //
  // Returns Promise.allSettled-shaped results in the caller's original row
  // order, so each row's success can still be mapped back to the row.
  const importTrades = useCallback(async (rows) => {
    const list = rows || [];
    const claimed = new Set();
    const ordered = list
      .map((row, index) => ({ row, index }))
      .sort((a, b) => Number(!!a.row?._isOpen) - Number(!!b.row?._isOpen));
    const results = new Array(list.length);
    for (const { row, index } of ordered) {
      try {
        results[index] = { status: 'fulfilled', value: await importTrade(row, claimed) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
    return results;
  }, [importTrade]);

  // Journal rows still marked open that this exchange no longer reports. Pass
  // ONLY a successful open-positions response — see findStaleOpenTrades.
  const staleOpenTrades = useCallback(
    (openRows, source) => findStaleOpenTrades(trades, openRows, source),
    [trades]
  );

  // Remove rows the user confirmed are stale. They are duplicates left by an
  // import bug, not real positions, so deleting is the correct repair — the
  // trade that actually closed was imported separately and is untouched.
  const removeTrades = useCallback(async (ids) => {
    let removed = 0;
    for (const id of ids || []) {
      try { await deleteTrade(id); removed++; } catch { /* keep going */ }
    }
    return removed;
  }, [deleteTrade]);

  // Whether an incoming sync row will UPDATE a journal trade rather than
  // create one. The sync modal badges rows with this, so a reconciled open
  // position reads as "update" instead of quietly looking like a new trade.
  const matchExisting = useCallback(
    (row) => matchSyncRow(trades, row, { isOpenRow: !!row?._isOpen }),
    [trades]
  );

  // importTrade is deliberately NOT exported: fanning out over it concurrently
  // is exactly the pattern that let two rows reconcile into one document.
  return { importTrades, existingExternalIds, matchExisting, staleOpenTrades, removeTrades };
}
