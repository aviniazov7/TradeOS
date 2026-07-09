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

// ─── Diagnostics ─────────────────────────────────────────────────
//
// Ground-truth dump for debugging display/data mismatches (e.g. analytics
// showing a net profit that disagrees with the exchange). Surfaces the raw
// field values so we stop guessing what's stored.

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const NUMERIC_FIELDS = ['netPnl', 'pnl', 'pnlFromExchange', 'fees', 'quantity', 'entryPrice', 'exitPrice', 'positionSize', 'leverage'];

const toIso = (v) => {
  if (!v) return null;
  try {
    const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v.seconds ? v.seconds * 1000 : v);
    return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  } catch {
    return String(v);
  }
};

// Compact row snapshot — everything needed to understand one trade at a glance.
const snapshot = (t) => ({
  id: t.id,
  pair: t.pair || t.symbol || null,
  direction: t.direction ?? null,
  status: t.status ?? null,
  result: t.result ?? null,
  source: t.source ?? null,
  externalId: t.externalId ?? null,
  pnl: t.pnl ?? null,
  netPnl: t.netPnl ?? null,
  pnlFromExchange: t.pnlFromExchange ?? null,
  fees: t.fees ?? null,
  quantity: t.quantity ?? null,
  entryPrice: t.entryPrice ?? null,
  exitPrice: t.exitPrice ?? null,
  positionSize: t.positionSize ?? null,
  leverage: t.leverage ?? null,
  exitDate: toIso(t.exitDate),
  entryDate: toIso(t.entryDate),
});

export function buildDiagnostics(trades) {
  // Same closed predicate as useDashboardStats/TradeJournal analytics.
  const closed = trades.filter(
    (t) => t.status === 'closed' || (parseFloat(t.exitPrice) > 0 && t.status !== 'partial' && t.status !== 'open')
  );

  // Rows carrying a non-finite / non-number value in a numeric field —
  // strings and NaN poison sums differently in different code paths.
  const typeIssues = [];
  for (const t of trades) {
    const bad = NUMERIC_FIELDS.filter((f) => t[f] !== undefined && t[f] !== null && !isFiniteNum(t[f]));
    if (bad.length) typeIssues.push({ ...snapshot(t), badFields: bad.map((f) => `${f}=${JSON.stringify(t[f])} (${typeof t[f] === 'number' ? 'NaN' : typeof t[f]})`) });
  }

  // Per-source aggregate over CLOSED rows.
  const bySource = {};
  for (const t of closed) {
    const key = t.source || '(ללא מקור)';
    if (!bySource[key]) bySource[key] = { count: 0, sumNetPnl: 0, noExchangePnl: 0, withExternalId: 0 };
    const b = bySource[key];
    b.count++;
    const v = Number(t.netPnl ?? t.pnl ?? 0);
    if (Number.isFinite(v)) b.sumNetPnl += v;
    if (num(t.pnlFromExchange) === null) b.noExchangePnl++;
    if (t.externalId) b.withExternalId++;
  }
  for (const b of Object.values(bySource)) b.sumNetPnl = Math.round(b.sumNetPnl * 100) / 100;

  // The most extreme rows by |netPnl| — where inflated values hide.
  const topAbsNetPnl = [...closed]
    .sort((a, b) => Math.abs(Number(b.netPnl ?? b.pnl ?? 0) || 0) - Math.abs(Number(a.netPnl ?? a.pnl ?? 0) || 0))
    .slice(0, 12)
    .map(snapshot);

  const directionAnomalies = closed.filter((t) => t.direction !== 'long' && t.direction !== 'short').map(snapshot);

  const resultCounts = { win: 0, loss: 0, breakeven: 0, other: 0 };
  for (const t of closed) resultCounts[t.result] !== undefined ? resultCounts[t.result]++ : resultCounts.other++;

  const sumSafe = closed.reduce((s, t) => {
    const v = Number(t.netPnl ?? t.pnl ?? 0);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);

  return {
    totals: {
      all: trades.length,
      closed: closed.length,
      open: trades.length - closed.length,
      sumNetPnlClosed: Math.round(sumSafe * 100) / 100,
      resultCounts,
    },
    bySource,
    topAbsNetPnl,
    directionAnomalies,
    typeIssues,
  };
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
    diag: buildDiagnostics(trades),
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
