// Compact per-trade rows for TradeAI chat. The coach snapshot is aggregates
// only (best/worst 3, no dates), so a question like "my last 5 trades" had
// nothing to answer from. This stays inside the chat token budget: short
// keys, newest closed trades of ONE journal, with a symbol/date query that
// pulls older matches ahead of the window so the packer keeps them.

import {
  isClosedTrade,
  safePnl,
  signedTradeR,
  calculateWeightedExitPrice,
  localDayKey,
} from './calculations';
import { tradeExitDate, tradeEntryDate } from './tradeDates';
import { tickerCoinKey } from './tickerMarks';
import { buildCoachStats } from './coachStats';

// Newest closed trades sent on every turn. A symbol/date question may pull
// older matches in front, up to the cap.
export const RECENT_TRADES_LIMIT = 40;
export const RECENT_TRADES_CAP = 50;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function roundPrice(n) {
  const v = num(n);
  if (v == null || v <= 0) return null;
  const digits = v >= 100 ? 2 : v >= 1 ? 4 : 8;
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

function round2(n) {
  const v = num(n);
  if (v == null) return null;
  return Math.round(v * 100) / 100;
}

function closedInstant(t) {
  return tradeExitDate(t) || tradeEntryDate(t);
}

function closedMs(t) {
  return closedInstant(t)?.getTime() || 0;
}

function entryOf(t) {
  const direct = num(t?.entryPrice);
  if (direct > 0) return direct;
  const fills = Array.isArray(t?.entries) ? t.entries : [];
  let weighted = 0;
  let qty = 0;
  for (const fill of fills) {
    const price = num(fill?.price);
    const size = num(fill?.quantity ?? fill?.qty ?? fill?.amount ?? fill?.percent);
    if (price > 0 && size > 0) {
      weighted += price * size;
      qty += size;
    }
  }
  return qty > 0 ? weighted / qty : null;
}

function exitOf(t) {
  const exits = (Array.isArray(t?.exits) ? t.exits : [])
    .map((e) => ({ price: num(e?.price) || 0, percent: num(e?.percent) || 0 }))
    .filter((e) => e.price > 0 && e.percent > 0);
  if (exits.length) {
    const weighted = calculateWeightedExitPrice(exits);
    if (weighted > 0) return weighted;
  }
  const direct = num(t?.exitPrice);
  return direct > 0 ? direct : null;
}

function sideOf(direction) {
  const raw = String(direction || '').trim();
  const key = raw.toLowerCase();
  if (key === 'long' || raw === 'לונג') return 'L';
  if (key === 'short' || raw === 'שורט') return 'S';
  return null;
}

function symOf(t) {
  return tickerCoinKey(t?.pair || t?.symbol || '') || null;
}

export function compactClosedTrade(t) {
  const when = closedInstant(t);
  const row = {};
  const day = when ? localDayKey(when) : '';
  if (day) row.d = day;
  const sym = symOf(t);
  if (sym) row.sym = sym;
  const side = sideOf(t?.direction);
  if (side) row.side = side;
  const entry = roundPrice(entryOf(t));
  if (entry != null) row.entry = entry;
  const exit = roundPrice(exitOf(t));
  if (exit != null) row.exit = exit;
  row.pnl = round2(safePnl(t)) ?? 0;
  const r = round2(signedTradeR(t));
  if (r != null) row.r = r;
  return row;
}

function datesInQuestion(question) {
  const out = new Set();
  const text = String(question || '');
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    out.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g)) {
    out.add(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  return out;
}

function symbolsInQuestion(question, trades) {
  const upper = String(question || '').toUpperCase();
  const found = new Set();
  const keys = new Set();
  for (const t of trades) {
    const sym = symOf(t);
    if (sym && sym.length >= 2) keys.add(sym);
  }
  for (const sym of keys) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z0-9]|$)`);
    if (re.test(upper)) found.add(sym);
  }
  return found;
}

function newestFirst(trades) {
  return [...trades].sort((a, b) => closedMs(b) - closedMs(a));
}

/**
 * Closed trades of this list (already the signed-in user's book), newest
 * first. A question that names a symbol and/or a date pulls those rows to
 * the front so a later token trim cannot drop the ones that were asked for.
 */
export function selectRecentClosed(trades, question = '', {
  limit = RECENT_TRADES_LIMIT,
  cap = RECENT_TRADES_CAP,
} = {}) {
  const closed = newestFirst((trades || []).filter(isClosedTrade));
  const syms = symbolsInQuestion(question, closed);
  const dates = datesInQuestion(question);
  let matched = [];
  let recentQuery = null;
  if (syms.size || dates.size) {
    const dayOf = (t) => {
      const when = closedInstant(t);
      return when ? localDayKey(when) : '';
    };
    const symHit = (t) => syms.has(symOf(t));
    const dateHit = (t) => dates.has(dayOf(t));
    if (syms.size && dates.size) {
      matched = closed.filter((t) => symHit(t) && dateHit(t));
      recentQuery = matched.length ? 'symbol+date' : null;
      if (!matched.length) {
        matched = closed.filter((t) => symHit(t) || dateHit(t));
        recentQuery = matched.length ? 'symbol-or-date' : null;
      }
    } else if (syms.size) {
      matched = closed.filter(symHit);
      recentQuery = matched.length ? 'symbol' : null;
    } else {
      matched = closed.filter(dateHit);
      recentQuery = matched.length ? 'date' : null;
    }
  }

  let picked;
  if (matched.length) {
    const seen = new Set(matched);
    const rest = closed.filter((t) => !seen.has(t));
    picked = [...matched, ...rest].slice(0, cap);
  } else {
    picked = closed.slice(0, limit);
  }

  return {
    closedTotal: closed.length,
    rows: picked.map(compactClosedTrade),
    recentQuery,
  };
}

/**
 * Coach aggregates plus the recent-trade rows, scoped to one journal when
 * `journalId` is set. `trades` must already belong to the signed-in user.
 */
export function buildChatJournalContext(trades, question = '', { journalId = null, journalName = '' } = {}) {
  const scoped = journalId
    ? (trades || []).filter((t) => t.journalId === journalId)
    : (trades || []);
  const stats = buildCoachStats(scoped, { premium: true });
  const book = selectRecentClosed(scoped, question);
  if (!book.closedTotal) return stats;
  const out = {
    ...stats,
    closedTotal: book.closedTotal,
    sideKey: 'L=לונג,S=שורט',
    recentTrades: book.rows,
  };
  const name = String(journalName || '').trim();
  if (name) out.journal = name.slice(0, 40);
  if (book.recentQuery) out.recentQuery = book.recentQuery;
  return out;
}

const ROW_QUESTION = /טבל|עסקא|טרייד|\btrades?\b|\btable\b/i;

/**
 * Appended only to the outbound copy of a trade-list question. The production
 * worker still carries the old chat prompt until this branch merges, so the
 * instruction has to ride in the user turn to reach the model on a preview.
 * It is not stored in the conversation.
 */
export function chatRowHint(question) {
  if (!ROW_QUESTION.test(String(question || ''))) return '';
  return '\n\n[recentTrades holds the closed rows (d, sym, side L=לונג S=שורט, entry, exit, pnl, r), newest first. Answer a table request with a GitHub-flavored Markdown table. Do not invent rows, and do not say the dates are missing.]';
}

const SIDE_HE = { L: 'לונג', S: 'שורט' };

/** The GFM table the chat is asked to answer with. `take` is the row count. */
export function recentTradesMarkdown(rows, take = 5) {
  const slice = (rows || []).slice(0, take);
  const header = '| תאריך | מטבע | כיוון | כניסה | יציאה | רווח/הפסד | R |';
  const sep = '| --- | --- | --- | ---: | ---: | ---: | ---: |';
  const body = slice.map((r) => {
    const pnl = typeof r.pnl === 'number' ? (r.pnl > 0 ? `+${r.pnl}` : String(r.pnl)) : '';
    const side = SIDE_HE[r.side] || r.side || '';
    return `| ${r.d || ''} | ${r.sym || ''} | ${side} | ${r.entry ?? ''} | ${r.exit ?? ''} | ${pnl} | ${r.r ?? ''} |`;
  });
  return [header, sep, ...body].join('\n');
}
