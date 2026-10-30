import { describe, expect, it } from 'vitest';
import {
  accountPeriodReturn,
  averageAccountReturn,
  buildAccountReturnBook,
  measureAccountReturn,
  portfolioReturnPercent,
  summaryAccountReturn,
} from './accountReturn';

const closed = (id, netPnl, exitDate, extra = {}) => ({
  id,
  status: 'closed',
  result: netPnl > 0 ? 'win' : netPnl < 0 ? 'loss' : 'breakeven',
  netPnl,
  pnl: netPnl,
  entryDate: exitDate,
  exitDate,
  ...extra,
});

describe('account return book', () => {
  it('uses the balance before each trade, not one balance for every row', () => {
    const trades = [
      closed('a', 100, '2026-01-01T12:00:00Z'),
      closed('b', -40, '2026-01-02T12:00:00Z'),
    ];
    const book = buildAccountReturnBook(trades, { openingBalance: 1000 });
    expect(book.mode).toBe('account');
    expect(book.byId.get('a')).toBe(1000);
    expect(book.byId.get('b')).toBe(1100);
    expect(book.basis).toBe(1000);
    // Header is measurable P&L over the start, not the mean of the row percents.
    expect(summaryAccountReturn(trades, book)).toBeCloseTo(6, 6);
    expect(averageAccountReturn(trades, book)).toBeCloseTo((10 + (-40 / 1100) * 100) / 2, 6);
    expect(summaryAccountReturn(trades, book)).not.toBeCloseTo(averageAccountReturn(trades, book), 2);
  });

  it('prefers a snapshot of the balance before the trade', () => {
    const trades = [closed('a', -11.2239, '2026-06-01T00:00:00Z', { balanceBefore: 250 })];
    const book = buildAccountReturnBook(trades, { openingBalance: 1e-8 });
    expect(book.byId.get('a')).toBe(250);
    expect(summaryAccountReturn(trades, book)).toBeCloseTo((-11.2239 / 250) * 100, 6);
  });

  it('reconstructs the start from a sane live wallet minus closed P&L', () => {
    const trades = [closed('a', -20, '2026-06-01T00:00:00Z')];
    const book = buildAccountReturnBook(trades, { openingBalance: 0, fallbackBalance: 500 });
    expect(book.basis).toBe(520);
    expect(book.byId.get('a')).toBe(520);
    expect(summaryAccountReturn(trades, book)).toBeCloseTo((-20 / 520) * 100, 6);
  });

  it('does not divide by a dust or empty wallet', () => {
    const trades = [closed('a', -11.2239, '2026-10-16T00:00:00Z')];
    const dust = buildAccountReturnBook(trades, { openingBalance: 0, fallbackBalance: 1e-8 });
    expect(dust.mode).toBe('unavailable');
    expect(dust.byId.get('a')).toBeNull();
    expect(dust.basis).toBeNull();
    expect(summaryAccountReturn(trades, dust)).toBeNull();
    expect(portfolioReturnPercent(trades, dust)).toBeNull();
    expect(averageAccountReturn(trades, dust)).toBeNull();

    const empty = buildAccountReturnBook(trades, { openingBalance: 0, fallbackBalance: 0 });
    expect(empty.mode).toBe('unavailable');
    expect(summaryAccountReturn(trades, empty)).toBeNull();

    const negative = buildAccountReturnBook(trades, { openingBalance: -50 });
    expect(negative.mode).toBe('unavailable');
    expect(summaryAccountReturn(trades, negative)).toBeNull();
  });

  it('leaves a trade taken after the account is wiped out of the return', () => {
    const trades = [
      closed('a', -1500, '2026-01-01T00:00:00Z'),
      closed('b', 50, '2026-01-02T00:00:00Z'),
    ];
    const book = buildAccountReturnBook(trades, { openingBalance: 1000 });
    expect(book.byId.get('a')).toBe(1000);
    expect(book.byId.get('b')).toBeNull();
    expect(summaryAccountReturn(trades, book)).toBeCloseTo(-150, 6);
    expect(averageAccountReturn(trades, book)).toBeCloseTo(-150, 6);
    // The wiped trade's +50 is not in the percent. Including it would be -145%.
    expect(summaryAccountReturn(trades, book)).not.toBeCloseTo(-145, 1);
  });

  it('measures a week against the balance the week opened at', () => {
    const now = new Date(2026, 9, 16, 15, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const prior = new Date(weekStart.getTime() - 86400000).toISOString();
    const inside = new Date(weekStart.getTime() + 60 * 1000).toISOString();
    const trades = [
      closed('old', -200, prior),
      closed('new', 10, inside),
    ];
    const week = measureAccountReturn(trades, { openingBalance: 1000, period: 'week', now });
    expect(week.capital).toBe(800);
    expect(week.percent).toBeCloseTo((10 / 800) * 100, 6);
    expect(accountPeriodReturn(trades, { openingBalance: 1000, period: 'all', now }))
      .toBeCloseTo(summaryAccountReturn(trades, buildAccountReturnBook(trades, { openingBalance: 1000 })), 6);
  });

  it('keeps a deposit recorded before the window in that window\'s base', () => {
    const now = new Date(2026, 9, 16, 15, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const trades = [
      closed('old', 100, new Date(weekStart.getTime() - 86400000).toISOString(), { balanceBefore: 5000 }),
      closed('new', 50, new Date(weekStart.getTime() + 60 * 1000).toISOString()),
    ];
    const week = measureAccountReturn(trades, { openingBalance: 1000, period: 'week', now });
    expect(week.capital).toBe(5100);
    expect(week.percent).toBeCloseTo((50 / 5100) * 100, 6);
  });

  it('keeps position mode when no balance was ever set', () => {
    const book = buildAccountReturnBook([closed('a', 10, '2026-01-01T00:00:00Z')], { openingBalance: 0 });
    expect(book.mode).toBe('position');
    expect(summaryAccountReturn([closed('a', 10, '2026-01-01T00:00:00Z')], book)).toBeNull();
  });
});
