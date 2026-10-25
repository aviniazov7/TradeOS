import { useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrades } from './useTrades';
import { addToUserCollection, timestamp, dateToTimestamp } from '../services/firestoreService';
import { DEFAULT_LEVERAGE } from '../utils/constants';
import { tradeExternalIds } from '../utils/tradeIds';
import { findOpenTradeForClosed } from '../utils/exchangeReconcile';

// Imports a single exchange-synced trade into the given journal. Shared by the
// journal's exchange tab, the trades-tab proposal banner AND the standalone
// /exchange route, so every path writes identical documents — the standalone
// route used to blind-add every row, double-counting a TP1 that was already
// imported from the proposals banner.
export function useExchangeImport(journalId) {
  const { user } = useAuth();
  const { trades, updateTrade } = useTrades(journalId);
  // Open trades already being closed by a row of the current import batch.
  // Callers import a batch with Promise.allSettled over one `trades`
  // snapshot, so without this two closed rows could both "close" the same
  // open trade. Released again when the update fails, so a retry can match.
  const claimedOpenIds = useRef(new Set());

  // Every close-order id already present in this journal — used by the sync
  // modal to flag rows as updates rather than new trades.
  const existingExternalIds = useMemo(() => {
    const s = new Set();
    for (const t of trades) for (const id of tradeExternalIds(t)) s.add(id);
    return s;
  }, [trades]);

  const importTrade = useCallback(async (t, targetJournalId) => {
    // Callers that just created or switched journals pass the id explicitly.
    // The hook's journalId is still the previous render's value until then.
    const destJournalId = targetJournalId || journalId || null;
    if (!user) throw new Error('No user');
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
        ...(t.lots > 0 ? { lots: t.lots } : {}),
        ...(t.notes ? { notes: String(t.notes).slice(0, 500) } : {}),
        ...(t.session ? { session: t.session } : {}),
        ...(t.liquidationPrice ? { liquidationPrice: t.liquidationPrice } : {}),
        journalId: destJournalId,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });
    }

    // Upsert: the row belongs to an existing trade when ANY of its close-order
    // ids matches — a Multi-TP position that closed across two syncs carries
    // the already-imported close's id alongside the new ones.
    const rowIds = tradeExternalIds(t);
    const byId = rowIds.length
      ? trades.find((tr) => tradeExternalIds(tr).some((id) => rowIds.includes(id)))
      : null;
    // No id match: the position may have been imported while still OPEN —
    // its open-position id never equals the closed row's id, so match it by
    // exchange + pair + direction + entry (see exchangeReconcile) and close
    // THAT trade instead of adding a second one next to a ghost open trade.
    const openMatch = byId ? null : findOpenTradeForClosed(t, trades, { claimed: claimedOpenIds.current });
    const existing = byId || openMatch;
    if (openMatch) claimedOpenIds.current.add(openMatch.id);
    if (existing) {
      // Pass the FULL merged shape — updateTrade recomputes pnl / R / percent /
      // result / positionSize from exactly what it's given, so the old partial
      // object (dates+prices+pnl only) zeroed rrRatio, NaN'd positionSize and
      // left quantity/exits/result stale: a stop-out arriving after TP1 turned
      // the pnl negative while the trade stayed a 'win'.
      const ep = t.entryPrice > 0 ? t.entryPrice : existing.entryPrice;
      const xp = t.exitPrice > 0 ? t.exitPrice : existing.exitPrice;
      const qty = t.quantity > 0 ? t.quantity : existing.quantity;
      const lev = Math.min(200, Math.max(1, t.leverage || existing.leverage || DEFAULT_LEVERAGE));
      const update = updateTrade(existing.id, {
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
        // The exchange knows limit vs market — a re-sync corrects rows that
        // were imported before a venue reported it (they defaulted to market).
        ...(t.orderType ? { orderType: t.orderType } : {}),
        ...(t.lots > 0 ? { lots: t.lots } : {}),
        pnlFromExchange: t.pnlFromExchange ?? existing.pnlFromExchange,
        // Funding paid/received (Hyperliquid) — already inside pnlFromExchange,
        // kept as its own field for reference.
        ...(typeof t.funding === 'number' && t.funding !== 0 ? { funding: t.funding } : {}),
        status: 'closed',
        // A reconciled open trade takes the CLOSED row's id as its primary id
        // (later syncs report that one); the open-position id stays in
        // externalIds so the open-positions banner still sees it as logged.
        externalId: openMatch ? (t.externalId || existing.externalId) : (existing.externalId || t.externalId),
        externalIds: [...new Set([...tradeExternalIds(existing), ...rowIds])],
        ...(t.session ? { session: t.session } : {}),
      });
      if (openMatch) {
        return update.catch((err) => {
          claimedOpenIds.current.delete(openMatch.id);
          throw err;
        });
      }
      return update;
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
      ...(t.lots > 0 ? { lots: t.lots } : {}),
      ...(t.notes ? { notes: String(t.notes).slice(0, 500) } : {}),
      // All the position's close-order ids — the next sync's merged row is
      // matched to this document by id overlap (see the upsert above).
      ...(rowIds.length > 1 ? { externalIds: rowIds } : {}),
      pnlFromExchange: pnl, pnl, netPnl: netPnlImport,
      ...(typeof t.funding === 'number' && t.funding !== 0 ? { funding: t.funding } : {}),
      pnlPercent: (pnl / (ep * qty)) * 100 * lev,
      // Risk ($) and realized R computed by the worker from the REAL exchange
      // SL and quantity — so nothing needs manual entry after import.
      riskAmount: parseFloat(t.riskAmount) || 0,
      rrRatio: parseFloat(t.rrRatio) || 0,
      result,
      positionSize: ep * qty, margin: (ep * qty) / lev,
      journalId: destJournalId,
      createdAt: dateToTimestamp(entryD), updatedAt: timestamp(),
    });
  }, [user, trades, updateTrade, journalId]);

  return { importTrade, existingExternalIds };
}
