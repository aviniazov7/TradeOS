import { describe, expect, it } from 'vitest';
import { evaluateJournalRisk, jerusalemMinutes, jerusalemWeekStart } from './journalRiskRules';

const NOW = new Date('2026-01-16T00:30:00Z');
const TODAY = '2026-01-16T10:00:00Z';
const SAME_WEEK = '2026-01-12T10:00:00Z';
const WEEK_OPEN = '2026-01-10T22:30:00Z';
const WEEK_CLOSE = '2026-01-17T21:30:00Z';
const AFTER_WEEK = '2026-01-17T22:30:00Z';
const BEFORE_WEEK = '2026-01-10T12:00:00Z';

const rules = {
  weeklyLoss: { enabled: true, amount: 500 },
  dailyLossPercent: { enabled: true, percent: 3 },
  weeklyLossPercent: { enabled: true, percent: 5 },
  maxTradesPerDay: { enabled: true, count: 3 },
  tradingHours: { enabled: true, start: '09:00', end: '17:00' },
};

const closed = (over = {}) => ({
  status: 'closed',
  journalId: 'j1',
  exitDate: TODAY,
  entryDate: TODAY,
  netPnl: -100,
  ...over,
});

function evalRules(trades, next = rules, opts = {}) {
  return evaluateJournalRisk(trades, next, {
    now: NOW,
    journalId: 'j1',
    balance: 10_000,
    ...opts,
  });
}

describe('Israel week', () => {
  it('starts on Sunday and ends on Saturday, including across the new year', () => {
    expect(jerusalemWeekStart(NOW)).toBe('2026-01-11');
    expect(jerusalemWeekStart(new Date(WEEK_OPEN))).toBe('2026-01-11');
    expect(jerusalemWeekStart(new Date(WEEK_CLOSE))).toBe('2026-01-11');
    expect(jerusalemWeekStart(new Date(AFTER_WEEK))).toBe('2026-01-18');
    expect(jerusalemWeekStart(new Date('2026-01-01T12:00:00Z'))).toBe('2025-12-28');
    expect(jerusalemWeekStart(new Date('2025-12-27T21:30:00Z'))).toBe('2025-12-21');
    expect(jerusalemWeekStart(new Date('2026-01-03T21:30:00Z'))).toBe('2025-12-28');
    expect(jerusalemWeekStart(new Date('2026-01-03T22:30:00Z'))).toBe('2026-01-04');
  });

  it('keeps one week together across the spring clock change', () => {
    expect(jerusalemWeekStart(new Date('2026-03-27T12:00:00Z'))).toBe('2026-03-22');
    expect(jerusalemWeekStart(new Date('2026-03-26T23:30:00Z'))).toBe('2026-03-22');
    expect(jerusalemWeekStart(new Date('2026-03-28T20:59:00Z'))).toBe('2026-03-22');
    expect(jerusalemWeekStart(new Date('2026-03-28T21:00:00Z'))).toBe('2026-03-29');
  });

  it('reads Israel minutes, including midnight and summer time', () => {
    expect(jerusalemMinutes(new Date('2026-01-15T22:00:00Z'))).toBe(0);
    expect(jerusalemMinutes(new Date('2026-01-16T06:59:00Z'))).toBe(8 * 60 + 59);
    expect(jerusalemMinutes(new Date('2026-01-16T07:00:00Z'))).toBe(9 * 60);
    expect(jerusalemMinutes(new Date('2026-07-15T06:30:00Z'))).toBe(9 * 60 + 30);
    expect(jerusalemMinutes(new Date('not-a-date'))).toBeNull();
  });
});

describe('evaluateJournalRisk', () => {
  it('stays off when the rules are missing, disabled, or not a positive number', () => {
    const trades = [closed({ netPnl: -900 })];
    const off = evalRules(trades, null);
    expect(off.breached).toBe(false);
    expect(off.weeklyLoss.enabled).toBe(false);
    expect(off.dailyLossPercent.enabled).toBe(false);
    expect(off.maxTrades.enabled).toBe(false);
    expect(off.tradingHours.enabled).toBe(false);
    expect(evalRules(trades, {
      weeklyLoss: { enabled: false, amount: 10 },
      dailyLossPercent: { enabled: true, percent: 0 },
      weeklyLossPercent: { enabled: true, percent: -2 },
      maxTradesPerDay: { enabled: true, count: '0' },
      tradingHours: { enabled: true, start: '09:00', end: '09:00' },
    }).breached).toBe(false);
  });

  it('caps the Israel week in dollars, with equality and with wins offsetting losses', () => {
    expect(evalRules([closed({ exitDate: SAME_WEEK, netPnl: -499.99 })]).weeklyLoss.breached).toBe(false);
    const hit = evalRules([
      closed({ exitDate: SAME_WEEK, netPnl: -400 }),
      closed({ id: 'w', exitDate: TODAY, netPnl: -100 }),
    ]);
    expect(hit.weekStart).toBe('2026-01-11');
    expect(hit.weeklyLoss).toMatchObject({ enabled: true, net: -500, loss: 500, cap: 500, trades: 2, breached: true });
    expect(evalRules([
      closed({ exitDate: SAME_WEEK, netPnl: -500 }),
      closed({ exitDate: TODAY, netPnl: 100 }),
    ]).weeklyLoss.breached).toBe(false);
  });

  it('includes Sunday and Saturday in Israel, and drops the next Sunday', () => {
    const edges = [
      closed({ exitDate: WEEK_OPEN, netPnl: -200 }),
      closed({ exitDate: WEEK_CLOSE, netPnl: -300 }),
      closed({ exitDate: AFTER_WEEK, netPnl: -900 }),
      closed({ exitDate: BEFORE_WEEK, netPnl: -900 }),
    ];
    expect(evalRules(edges).weeklyLoss).toMatchObject({ net: -500, trades: 2, breached: true });
  });

  it('keeps a loss on the Friday of a clock-change week', () => {
    const now = new Date('2026-03-27T12:00:00Z');
    const state = evalRules([
      closed({ exitDate: '2026-03-26T23:30:00Z', netPnl: -250 }),
      closed({ exitDate: '2026-03-28T20:59:00Z', netPnl: -250 }),
      closed({ exitDate: '2026-03-28T21:00:00Z', netPnl: -900 }),
    ], rules, { now });
    expect(state.dayKey).toBe('2026-03-27');
    expect(state.weekStart).toBe('2026-03-22');
    expect(state.weeklyLoss).toMatchObject({ net: -500, trades: 2, breached: true });
    expect(state.dailyLossPercent.net).toBe(-250);
  });

  it('measures a daily and a weekly percent of the opening balance', () => {
    const under = evalRules([closed({ netPnl: -299.99 })]);
    expect(under.dailyLossPercent).toMatchObject({
      enabled: true, measurable: true, cap: 300, loss: 299.99, breached: false, balance: 10_000, percent: 3,
    });
    const hit = evalRules([closed({ netPnl: -300 })]);
    expect(hit.dailyLossPercent.breached).toBe(true);
    expect(hit.weeklyLossPercent).toMatchObject({ cap: 500, breached: false });
    const both = evalRules([
      closed({ exitDate: SAME_WEEK, netPnl: -200 }),
      closed({ netPnl: -300 }),
    ]);
    expect(both.dailyLossPercent.breached).toBe(true);
    expect(both.weeklyLossPercent).toMatchObject({ net: -500, cap: 500, breached: true });
  });

  it('does not call a percent cap breached when the balance is missing or not positive', () => {
    const trades = [closed({ netPnl: -900 })];
    for (const balance of [undefined, null, 0, -100, 'nope']) {
      const state = evalRules(trades, rules, { balance });
      expect(state.dailyLossPercent).toMatchObject({ enabled: true, measurable: false, cap: null, breached: false });
      expect(state.weeklyLossPercent.breached).toBe(false);
    }
    expect(evalRules([closed({ netPnl: -3.33 })], {
      dailyLossPercent: { enabled: true, percent: 1 },
    }, { balance: 333.33 }).dailyLossPercent).toMatchObject({ cap: 3.33, breached: true });
  });

  it('lets a dollar week cap and a percent week cap disagree', () => {
    const state = evalRules([closed({ exitDate: SAME_WEEK, netPnl: -400 })], {
      weeklyLoss: { enabled: true, amount: 1000 },
      weeklyLossPercent: { enabled: true, percent: 3 },
    });
    expect(state.weeklyLoss.breached).toBe(false);
    expect(state.weeklyLossPercent).toMatchObject({ cap: 300, breached: true });
    expect(state.breached).toBe(true);
  });

  it('counts closed trades booked today and breaches at the max, including equality', () => {
    const two = [closed({ id: 'a' }), closed({ id: 'b', netPnl: 40 })];
    expect(evalRules(two).maxTrades).toMatchObject({ count: 2, max: 3, breached: false });
    const three = [...two, closed({ id: 'c', exitDate: SAME_WEEK })];
    expect(evalRules(three).maxTrades).toMatchObject({ count: 2, breached: false });
    expect(evalRules([...two, closed({ id: 'd' })]).maxTrades).toMatchObject({ count: 3, breached: true });
  });

  it('flags an entry taken today outside the Israel window, and not the clock alone', () => {
    const now = new Date('2026-01-16T04:00:00Z');
    const quiet = evalRules([], rules, { now });
    expect(quiet.tradingHours).toMatchObject({
      enabled: true, start: '09:00', end: '17:00', nowInside: false, outsideCount: 0, breached: false,
    });
    const outside = evalRules([
      closed({ entryDate: '2026-01-16T06:59:00Z', exitDate: TODAY }),
      closed({ id: 'in', entryDate: '2026-01-16T07:00:00Z', exitDate: TODAY }),
      closed({ id: 'end', entryDate: '2026-01-16T15:00:00Z', exitDate: TODAY }),
    ], rules, { now });
    expect(outside.tradingHours).toMatchObject({ outsideCount: 2, breached: true });
    expect(jerusalemMinutes(new Date('2026-01-16T14:59:00Z'))).toBe(16 * 60 + 59);
    expect(evalRules([
      closed({ entryDate: '2026-01-16T14:59:00Z', exitDate: TODAY }),
    ], rules, { now }).tradingHours.outsideCount).toBe(0);
  });

  it('accepts a window that crosses midnight and ignores an entry from another day', () => {
    const hours = { enabled: true, start: '22:00', end: '02:00' };
    const state = evalRules([
      closed({ entryDate: '2026-01-15T22:30:00Z', exitDate: TODAY }),
      closed({ id: 'noon', entryDate: TODAY, exitDate: TODAY }),
      closed({ id: 'yesterday', entryDate: '2026-01-15T20:00:00Z', exitDate: TODAY }),
    ], { tradingHours: hours });
    expect(state.tradingHours).toMatchObject({ start: '22:00', end: '02:00', outsideCount: 1, breached: true });
    expect(evalRules([
      closed({ entryDate: '2026-01-15T22:30:00Z', exitDate: TODAY }),
    ], { tradingHours: hours }).tradingHours).toMatchObject({ outsideCount: 0, breached: false, nowInside: false });
  });

  it('uses the entry date when a closed import has no exit, and a timestamp object', () => {
    const stamped = {
      toDate: () => new Date(TODAY),
    };
    const state = evalRules([
      closed({ exitDate: null, entryDate: TODAY, netPnl: -500 }),
      closed({ id: 'ts', exitDate: stamped, entryDate: stamped, netPnl: -50 }),
    ]);
    expect(state.weeklyLoss).toMatchObject({ net: -550, trades: 2, breached: true });
    expect(state.maxTrades.count).toBe(2);
  });

  it('ignores open trades, partial exits, another journal, and a non-dollar loss', () => {
    const early = '2026-01-16T05:00:00Z';
    const state = evalRules([
      closed({ status: 'open', netPnl: -900, entryDate: early }),
      closed({ status: 'partial', netPnl: -900, entryDate: early, exits: [{ price: 1, percent: 50 }] }),
      closed({ journalId: 'j2', netPnl: -900, entryDate: early }),
      closed({ netPnl: -900, contract: { currency: 'CAD' }, entryDate: early }),
      closed({ id: 'usd', netPnl: -100 }),
    ]);
    expect(state.weeklyLoss).toMatchObject({ net: -100, loss: 100, trades: 2, breached: false });
    expect(state.dailyLossPercent).toMatchObject({ loss: 100, breached: false });
    expect(state.weeklyLossPercent.breached).toBe(false);
    expect(state.maxTrades).toMatchObject({ count: 2, breached: false });
    expect(state.tradingHours).toMatchObject({ outsideCount: 1, breached: true });
    expect(state.breached).toBe(true);
  });

  it('rejects a clock that is not a time of day', () => {
    const trades = [closed({ entryDate: '2026-01-16T05:00:00Z' })];
    expect(evalRules(trades, { tradingHours: { enabled: true, start: '25:00', end: '17:00' } }).tradingHours.enabled).toBe(false);
    expect(evalRules(trades, { tradingHours: { enabled: true, start: '09:60', end: '17:00' } }).tradingHours.enabled).toBe(false);
    expect(evalRules(trades, { tradingHours: { enabled: true, start: '9', end: '17:00' } }).tradingHours.breached).toBe(false);
    expect(evalRules(trades, { tradingHours: { enabled: true, start: ' 9:00 ', end: '17:00' } }).tradingHours.breached).toBe(true);
  });
});
