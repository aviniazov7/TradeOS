import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECENT_TRADES_CAP,
  RECENT_TRADES_LIMIT,
  buildChatJournalContext,
  chatRowHint,
  selectRecentClosed,
} from './recentTradesContext';

// Same pessimistic estimate the worker uses before it trims a chat payload.
function estimateCoachTokens(str) {
  let ascii = 0;
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) < 128) ascii += 1;
  return Math.ceil(ascii / 3) + (str.length - ascii);
}

function trade(overrides = {}) {
  const entry = overrides.entryPrice ?? 100;
  return {
    status: 'closed',
    journalId: 'j1',
    pair: 'BTCUSDT',
    direction: 'long',
    entryPrice: entry,
    exitPrice: entry + 10,
    stopLoss: entry - 10,
    quantity: 1,
    netPnl: 8,
    rrRatio: 1,
    strategy: 'Spring',
    session: 'London',
    exitDate: new Date(2026, 9, 15, 12, 0, 0),
    ...overrides,
  };
}

describe('selectRecentClosed', () => {
  it('keeps closed trades only, newest first, with date symbol side prices pnl and R', () => {
    const rows = selectRecentClosed([
      trade({ pair: 'ETHUSDT', direction: 'short', exitDate: new Date(2026, 9, 10), netPnl: -4, entryPrice: 200, exitPrice: 190, stopLoss: 220 }),
      { ...trade({ pair: 'SOLUSDT' }), status: 'open', exitPrice: 0, exitDate: new Date(2026, 9, 20) },
      trade({ pair: 'BTCUSDT', exitDate: new Date(2026, 9, 16), netPnl: 12, entryPrice: 65000, exitPrice: 66000, stopLoss: 64000 }),
    ]).rows;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      d: '2026-10-16',
      sym: 'BTC',
      side: 'Long',
      entry: 65000,
      exit: 66000,
      pnl: 12,
    });
    expect(rows[0].R).toEqual(expect.any(Number));
    expect(rows[0].r).toBeUndefined();
    expect(rows[1]).toMatchObject({ d: '2026-10-10', sym: 'ETH', side: 'Short', pnl: -4 });
  });

  it('prices a partial close from the weighted exits', () => {
    const book = selectRecentClosed([trade({
      exitPrice: 0,
      exits: [{ price: 110, percent: 50 }, { price: 130, percent: 50 }],
    })]);
    expect(book.rows[0].exit).toBe(120);
  });

  it('caps the default window and still reports the full closed count', () => {
    const trades = Array.from({ length: 80 }, (_, i) => trade({
      pair: i % 2 ? 'ETHUSDT' : 'BTCUSDT',
      exitDate: new Date(2026, 0, 1 + (i % 27), i % 24),
      netPnl: i - 40,
    }));
    const book = selectRecentClosed(trades);
    expect(book.closedTotal).toBe(80);
    expect(book.rows).toHaveLength(RECENT_TRADES_LIMIT);
    expect(book.recentQuery).toBeNull();
    const days = book.rows.map((r) => r.d);
    expect([...days].sort().reverse()[0]).toBe(days[0]);
  });

  it('pulls an older symbol match ahead of the newest window', () => {
    const trades = Array.from({ length: 45 }, (_, i) => trade({
      pair: 'BTCUSDT',
      exitDate: new Date(2026, 8, 1, 0, i),
    }));
    trades.push(trade({
      pair: 'SOLUSDT',
      direction: 'short',
      exitDate: new Date(2024, 0, 2),
      netPnl: -3,
      entryPrice: 20,
      exitPrice: 18,
    }));
    const book = selectRecentClosed(trades, 'תן לי את עסקאות SOL');
    expect(book.recentQuery).toBe('symbol');
    expect(book.rows[0]).toMatchObject({ sym: 'SOL', side: 'Short', d: '2024-01-02', pnl: -3 });
    expect(book.rows.filter((r) => r.sym === 'SOL')).toHaveLength(1);
    expect(book.rows.length).toBeLessThanOrEqual(RECENT_TRADES_CAP);
    expect(book.closedTotal).toBe(46);
  });

  it('matches a date written day-first and does not treat a plain last-trades question as a filter', () => {
    const trades = [
      trade({ pair: 'ETHUSDT', exitDate: new Date(2026, 0, 3) }),
      trade({ pair: 'BTCUSDT', exitDate: new Date(2026, 9, 16) }),
    ];
    const byDate = selectRecentClosed(trades, 'מה עשיתי ב-03/01/2026');
    expect(byDate.recentQuery).toBe('date');
    expect(byDate.rows[0].sym).toBe('ETH');
    const last = selectRecentClosed(trades, 'תן לי טבלה של 5 העסקאות האחרונות שלי');
    expect(last.recentQuery).toBeNull();
    expect(last.rows[0].sym).toBe('BTC');
  });

  it('scopes rows and the aggregate count to the selected journal', () => {
    const ctx = buildChatJournalContext([
      trade({ journalId: 'mine', pair: 'BTCUSDT', exitDate: new Date(2026, 9, 16) }),
      trade({ journalId: 'other', pair: 'SOLUSDT', exitDate: new Date(2026, 9, 17), netPnl: 99 }),
    ], 'תן לי טבלה של 5 העסקאות האחרונות שלי', { journalId: 'mine', journalName: 'יומן ראשי' });
    expect(ctx.closedTotal).toBe(1);
    expect(ctx.summary.total).toBe(1);
    expect(ctx.recentTrades).toHaveLength(1);
    expect(ctx.recentTrades[0].sym).toBe('BTC');
    expect(ctx.journal).toBe('יומן ראשי');
    expect(ctx.sideKey).toBe('Long|Short');
    expect(JSON.stringify(ctx)).not.toContain('SOL');
  });

  it('stays inside the chat context budget for a 113-trade book', () => {
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'NEARUSDT'];
    const trades = Array.from({ length: 113 }, (_, i) => trade({
      pair: pairs[i % pairs.length],
      direction: i % 3 === 0 ? 'short' : 'long',
      exitDate: new Date(2025, 0, 1 + (i % 360)),
      entryPrice: 10 + (i % 50),
      exitPrice: 11 + (i % 50),
      stopLoss: 9 + (i % 50),
      netPnl: (i % 7) - 3,
      strategy: i % 2 ? 'Spring' : 'UTAD',
      session: i % 2 ? 'London' : 'New York',
    }));
    const ctx = buildChatJournalContext(trades, 'תן לי טבלה של 5 העסקאות האחרונות שלי', {
      journalId: 'j1',
      journalName: 'Main',
    });
    expect(ctx.closedTotal).toBe(113);
    expect(ctx.recentTrades).toHaveLength(RECENT_TRADES_LIMIT);
    const tokens = estimateCoachTokens(JSON.stringify(ctx));
    expect(tokens).toBeLessThanOrEqual(2200);
    expect(tokens).toBeGreaterThan(900);
  });
});

describe('chatRowHint', () => {
  it('rides along only when the question asks for trades or a table', () => {
    const hint = chatRowHint('תן לי טבלה של 5 העסקאות האחרונות שלי');
    expect(hint).toContain('recentTrades');
    expect(hint).toContain('"Long" or "Short"');
    expect(hint).toContain('column header is R');
    expect(hint).toContain('sign before the digits');
    expect(hint).toContain('-$1,234.56');
    expect(hint).toContain('-1.06R');
    expect(hint).not.toContain('L=לונג');
    expect(chatRowHint('show my last trades')).toContain('Markdown');
    expect(chatRowHint('מה זה Spring?')).toBe('');
  });
});

describe('chat worker prompt', () => {
  it('tells the model to use recentTrades and to answer with a markdown table', () => {
    const src = readFileSync(new URL('../../worker/index.js', import.meta.url), 'utf8');
    expect(src).toMatch(/const CHAT_CONTEXT_BUDGET = 2200;/);
    expect(src).toContain('recentTrades');
    expect(src).toContain('טבלת Markdown');
    expect(src).toContain('Long או Short');
    expect(src).toContain('לא r');
    expect(src).toContain('לפני הספרות');
    expect(src).toContain('-$1,234.56');
    expect(src).toContain('-1.06R');
    expect(src).not.toContain('L=לונג');
    expect(src).not.toMatch(/const CHAT_CONTEXT_BUDGET = 900;/);
  });
});
