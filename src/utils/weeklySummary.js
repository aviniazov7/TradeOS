import { isClosedTrade, safePnl, signedTradeR, winRateOf } from './calculations';
import { computeSetupStats, tradeSetups } from './setupStats';

// Sunday-first weeks — the same week the monthly calendar draws. "This week"
// is the local week containing `now`, not a rolling 7-day window.

const HEBREW_IN_MONTH = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
];

const NOTE_LIMIT = 160;
const NOTES_LIMIT = 6;

function toDate(raw) {
  if (!raw) return null;
  let d = raw;
  if (typeof d?.toDate === 'function') d = d.toDate();
  else if (!(d instanceof Date)) d = new Date(d);
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/** Local Sunday 00:00 of the week containing `date`. */
export function startOfTradeWeek(date) {
  const d = toDate(date);
  if (!d) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function isSameTradeWeek(a, b) {
  const sa = startOfTradeWeek(a);
  const sb = startOfTradeWeek(b);
  return !!sa && !!sb && sa.getTime() === sb.getTime();
}

/**
 * When the trade belongs on a weekly review. Closed trades count on the day
 * they were realized (exit, else entry). Open trades count on the entry day.
 */
export function tradeWeekDate(trade) {
  if (!trade) return null;
  if (isClosedTrade(trade)) return toDate(trade.exitDate) || toDate(trade.entryDate);
  return toDate(trade.entryDate);
}

/** True when the trade falls in the Sunday–Saturday week of `weekStart`. */
export function isInTradeWeek(trade, weekStart) {
  const when = tradeWeekDate(trade);
  const start = startOfTradeWeek(weekStart);
  if (!when || !start) return false;
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return when >= start && when < end;
}

/** "18–24 באוקטובר", or with the year when it isn't `now`'s year. */
export function formatWeekRange(weekStart, now = new Date()) {
  const start = startOfTradeWeek(weekStart);
  if (!start) return '';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const showYear = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== now.getFullYear();
  const year = showYear ? ` ${end.getFullYear()}` : '';
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${HEBREW_IN_MONTH[start.getMonth()]}${year}`;
  }
  return `${start.getDate()} ${HEBREW_IN_MONTH[start.getMonth()]} – ${end.getDate()} ${HEBREW_IN_MONTH[end.getMonth()]}${year}`;
}

/**
 * Weeks to offer in the picker: the current week, plus every week that has a
 * trade, newest first. Empty weeks between them are skipped.
 */
export function listTradeWeeks(trades, now = new Date()) {
  const cap = startOfTradeWeek(now);
  const map = new Map();
  const add = (date) => {
    const start = startOfTradeWeek(date);
    if (!start || (cap && start > cap)) return;
    map.set(start.getTime(), start);
  };
  add(now);
  for (const t of trades || []) add(tradeWeekDate(t));
  return [...map.values()].sort((a, b) => b.getTime() - a.getTime());
}

function extremeOf(closed) {
  if (!closed.length) return { best: null, worst: null };
  const ranked = [...closed].sort((a, b) => {
    const dp = safePnl(b) - safePnl(a);
    if (dp) return dp;
    return (signedTradeR(b) ?? -Infinity) - (signedTradeR(a) ?? -Infinity);
  });
  const shape = (t) => ({
    id: t.id || null,
    pair: t.pair || '',
    direction: t.direction || '',
    pnl: safePnl(t),
    netR: signedTradeR(t),
  });
  return { best: shape(ranked[0]), worst: shape(ranked[ranked.length - 1]) };
}

function adherenceOf(inWeek) {
  const rated = inWeek.filter((t) => Number.isFinite(Number(t?.checklistAdherence)));
  if (!rated.length) return null;
  const values = rated.map((t) => Number(t.checklistAdherence));
  const avg = values.reduce((s, n) => s + n, 0) / values.length;
  const notes = [];
  for (const t of rated) {
    if (notes.length >= NOTES_LIMIT) break;
    const rows = Array.isArray(t.checklist) ? t.checklist : [];
    const missed = rows
      .filter((r) => r && r.done === false && String(r.item || '').trim())
      .map((r) => String(r.item).trim());
    const note = String(t.notes || '').trim().slice(0, NOTE_LIMIT);
    if (!missed.length && !note) continue;
    notes.push({
      pair: t.pair || '',
      adherence: Number(t.checklistAdherence),
      missed,
      note,
    });
  }
  return {
    samples: rated.length,
    avg,
    followed: values.filter((n) => n >= 80).length,
    missed: values.filter((n) => n < 80).length,
    notes,
  };
}

/**
 * One week's journal review. P&L, win rate and net R are closed trades only
 * (same population as the journal header). avgNetR uses signed net R, the
 * header's "R ממוצע"; totalNetR is the sum of those same values.
 * Rule-adherence is included only when a trade actually stored a checklist
 * score — trades with no plan stay out of that section.
 */
export function summarizeWeek(trades, weekStart) {
  const start = startOfTradeWeek(weekStart);
  const inWeek = (trades || []).filter((t) => isInTradeWeek(t, start));
  const closed = inWeek.filter(isClosedTrade);
  const open = inWeek.length - closed.length;
  const wins = closed.filter((t) => t.result === 'win').length;
  const losses = closed.filter((t) => t.result === 'loss').length;
  const rs = closed.map(signedTradeR).filter((r) => r !== null);
  const totalNetR = rs.length ? rs.reduce((s, r) => s + r, 0) : null;
  const setups = computeSetupStats(closed);
  const { best, worst } = extremeOf(closed);
  const end = start ? new Date(start) : null;
  if (end) end.setDate(end.getDate() + 6);
  return {
    weekStart: start,
    weekEnd: end,
    closed: closed.length,
    open,
    wins,
    losses,
    winRate: closed.length ? winRateOf(wins, losses) : null,
    totalNetR,
    avgNetR: rs.length ? totalNetR / rs.length : null,
    pnl: closed.reduce((s, t) => s + safePnl(t), 0),
    best,
    worst,
    topSetup: setups[0]
      ? {
        name: setups[0].name,
        label: setups[0].label,
        count: setups[0].count,
        winRate: setups[0].winRate,
        avgNetR: setups[0].avgNetR,
      }
      : null,
    adherence: adherenceOf(inWeek),
    // Exposed so a caller can tell "no setups" from "no trades" without
    // re-reading tags. Not a user-count.
    untagged: closed.filter((t) => tradeSetups(t).length === 0).length,
  };
}
