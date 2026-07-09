import { getTradeResult } from './calculations';

// ─── Trade data-cleanup scan (admin one-time tool) ───────────────
//
// Pure analysis over a user's trade docs — NO Firestore access here. Finds
// three kinds of damage left by the pre-fix client (see PendingLimitOrders
// auto-close fix + MEXC contract-unit conversion in worker/index.js):
//
// 1. pnlFixes    — closed exchange trades where the stored pnl/netPnl/result
//                  disagree with pnlFromExchange (the exchange's settled PnL,
//                  the source of truth). Fix: pnl = pnlFromExchange,
//                  netPnl = pnlFromExchange - fees, result from netPnl.
// 2. suspects    — closed exchange trades WITHOUT pnlFromExchange: the sync
//                  always writes pnlFromExchange when it closes a trade, so
//                  this is the signature of a client-side fabricated close
//                  (mark-price crossed SL/TP → status:'closed' + client-math
//                  netPnl from a contract-inflated positionSize).
// 3. dupeGroups  — several docs sharing the same source+externalId (unstable
//                  IDs / open→closed re-sync races). Keep the best doc,
//                  propose deleting the rest.
//
// The caller (DataCleanupModal) shows everything as a preview and only
// writes what the admin explicitly confirms.

export const EXCHANGE_SOURCES = new Set(['mexc', 'bybit', 'okx', 'bitget', 'binance']);

export const isExchangeTrade = (t) =>
  EXCHANGE_SOURCES.has(String(t?.source || '').toLowerCase()) || !!t?.externalId;

// Money comparison tolerance — anything under half a cent is float noise.
const EPSILON = 0.005;

// |netPnl| above this gets a "high" badge in the preview (sort/eyeball aid
// only — every signature match is listed regardless).
export const SUSPECT_HIGH_PNL = 1000;

const num = (v) => (typeof v === 'number' && !isNaN(v) ? v : null);

// Mirrors useTrades.computeTradeFields: exitPrice > 0 or explicit 'closed'.
const isClosed = (t) => t?.status === 'closed' || Number(t?.exitPrice) > 0;

const createdMs = (t) => {
  const v = t?.createdAt;
  if (!v) return Infinity;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  const s = v.seconds ?? v._seconds;
  if (typeof s === 'number') return s * 1000;
  const d = new Date(v);
  return isNaN(d) ? Infinity : d.getTime();
};

// ─── 1. pnl / netPnl / result drift vs pnlFromExchange ──────────

function findPnlFixes(trades, skipIds) {
  const fixes = [];
  for (const t of trades) {
    if (skipIds.has(t.id)) continue;
    const exchangePnl = num(t.pnlFromExchange);
    if (exchangePnl === null || !isClosed(t)) continue;

    const fees = num(t.fees) ?? 0;
    const expected = {
      pnl: exchangePnl,
      netPnl: exchangePnl - fees,
      result: getTradeResult(exchangePnl - fees),
    };
    const pnlDrift = num(t.pnl) === null || Math.abs(t.pnl - expected.pnl) > EPSILON;
    const netDrift = num(t.netPnl) === null || Math.abs(t.netPnl - expected.netPnl) > EPSILON;
    const resultDrift = t.result !== expected.result;
    if (!pnlDrift && !netDrift && !resultDrift) continue;

    fixes.push({
      trade: t,
      updates: expected,
      delta: expected.netPnl - (num(t.netPnl) ?? 0),
    });
  }
  return fixes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ─── 2. fabricated auto-close signature ─────────────────────────

function findSuspects(trades, skipIds) {
  const suspects = [];
  for (const t of trades) {
    if (skipIds.has(t.id)) continue;
    if (!isExchangeTrade(t)) continue;
    if (t.status !== 'closed') continue;
    if (num(t.pnlFromExchange) !== null) continue;
    if (t.pnlSuspect === true) continue; // already flagged in a previous run

    const netPnl = num(t.netPnl);
    suspects.push({
      trade: t,
      netPnl,
      high: netPnl !== null && Math.abs(netPnl) >= SUSPECT_HIGH_PNL,
    });
  }
  return suspects.sort((a, b) => Math.abs(b.netPnl ?? 0) - Math.abs(a.netPnl ?? 0));
}

// ─── 3. duplicate externalId ─────────────────────────────────────

// Higher score = better doc to keep. Prefer the one holding the exchange's
// settled PnL, then an explicit close, then the earliest-created (original).
function keeperScore(t) {
  let score = 0;
  if (num(t.pnlFromExchange) !== null) score += 4;
  if (t.status === 'closed') score += 2;
  return score;
}

function findDuplicateGroups(trades) {
  const byKey = new Map();
  for (const t of trades) {
    if (!t.externalId) continue;
    const key = `${String(t.source || '').toLowerCase()}|${String(t.externalId)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }

  const groups = [];
  for (const [key, docs] of byKey) {
    if (docs.length < 2) continue;
    const sorted = [...docs].sort(
      (a, b) => keeperScore(b) - keeperScore(a) || createdMs(a) - createdMs(b)
    );
    groups.push({ key, keep: sorted[0], remove: sorted.slice(1) });
  }
  return groups.sort((a, b) => b.remove.length - a.remove.length);
}

// ─── Entry point ─────────────────────────────────────────────────

export function scanTrades(trades) {
  const dupeGroups = findDuplicateGroups(trades);
  // A doc slated for removal must not also appear as fixable/suspect.
  const dupeRemoveIds = new Set(dupeGroups.flatMap((g) => g.remove.map((t) => t.id)));

  const pnlFixes = findPnlFixes(trades, dupeRemoveIds);
  const suspects = findSuspects(trades, dupeRemoveIds);

  return {
    pnlFixes,
    suspects,
    dupeGroups,
    stats: {
      total: trades.length,
      pnlFixes: pnlFixes.length,
      suspects: suspects.length,
      dupeRemovals: dupeRemoveIds.size,
      clean:
        trades.length -
        pnlFixes.length -
        suspects.length -
        dupeRemoveIds.size,
    },
  };
}
