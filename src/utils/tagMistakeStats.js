import { isClosedTrade, safePnl, winRateOf } from './calculations';
import { MISTAKE_LABELS, TAG_LABELS } from './constants';

// Tag and mistake breakdowns for the journal. Pure: no Firestore, no UI.
// Both fields already live on the trade (a list of short ids). A missing
// field, or anything that is not a list, counts as none — a string would
// otherwise be walked character by character.

function cleanIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function tagLabel(id) {
  return TAG_LABELS[id] || id || '';
}

export function mistakeLabel(id) {
  return MISTAKE_LABELS[id] || id || '';
}

function bucketStats(trades, readIds, labelOf) {
  const buckets = new Map();
  for (const t of trades || []) {
    if (!isClosedTrade(t)) continue;
    const ids = readIds(t);
    if (!ids.length) continue;
    const pnl = safePnl(t);
    for (const id of ids) {
      let row = buckets.get(id);
      if (!row) {
        row = { id, wins: 0, losses: 0, count: 0, pnl: 0 };
        buckets.set(id, row);
      }
      row.count += 1;
      if (t.result === 'win') row.wins += 1;
      else if (t.result === 'loss') row.losses += 1;
      // The whole profit stays on every bucket. Two tags do not split it.
      row.pnl += pnl;
    }
  }

  return [...buckets.values()].map((row) => ({
    id: row.id,
    label: labelOf(row.id),
    count: row.count,
    wins: row.wins,
    losses: row.losses,
    winRate: winRateOf(row.wins, row.losses),
    pnl: row.pnl,
  })).sort((a, b) => b.pnl - a.pnl || b.count - a.count || a.id.localeCompare(b.id));
}

/** Per-tag stats over closed trades. Open and partial trades are left out. */
export function computeTagStats(trades) {
  return bucketStats(trades, (t) => cleanIds(t?.tags), tagLabel);
}

/** Per-mistake stats over closed trades. A non-array `mistakes` is ignored. */
export function computeMistakeStats(trades) {
  return bucketStats(trades, (t) => cleanIds(t?.mistakes), mistakeLabel);
}

/** True when the trade's mistake list contains this id. A non-array is never a match. */
export function tradeHasMistake(trade, id) {
  const wanted = typeof id === 'string' ? id.trim() : '';
  if (!wanted) return false;
  return cleanIds(trade?.mistakes).includes(wanted);
}
