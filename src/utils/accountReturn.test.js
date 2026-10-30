import { describe, expect, it } from 'vitest';
import {
  averageAccountReturn,
  buildAccountReturnBook,
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

  it('keeps position mode when no balance was ever set', () => {
    const book = buildAccountReturnBook([closed('a', 10, '2026-01-01T00:00:00Z')], { openingBalance: 0 });
    expect(book.mode).toBe('position');
    expect(summaryAccountReturn([closed('a', 10, '2026-01-01T00:00:00Z')], book)).toBeNull();
  });
});
