import { describe, expect, it } from 'vitest';
import { dailyLossAlertPatch, dailyLossAlertState, jerusalemDayKey } from './dailyLossAlert';

const NOW = new Date('2026-01-16T00:30:00Z');
const TODAY = '2026-01-16T00:30:00Z';
const YESTERDAY = '2026-01-15T21:30:00Z';
const ON = { enabled: true, amount: 300 };

const closed = (over = {}) => ({
  status: 'closed',
  journalId: 'j1',
  exitDate: TODAY,
  netPnl: -300,
  ...over,
});

function state(trades, alert = ON, opts = {}) {
  return dailyLossAlertState(trades, alert, { now: NOW, journalId: 'j1', ...opts });
}

describe('jerusalemDayKey', () => {
  it('rolls the day at Israel midnight, not UTC', () => {
    expect(jerusalemDayKey(new Date('2026-01-15T21:30:00Z'))).toBe('2026-01-15');
    expect(jerusalemDayKey(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-16');
  });
});

describe('dailyLossAlertState', () => {
  it('stays off when the setting is missing, disabled, or has no amount', () => {
    const trades = [closed()];
    expect(dailyLossAlertState(trades, undefined, { now: NOW, journalId: 'j1' }).show).toBe(false);
    expect(state(trades, null).show).toBe(false);
    expect(state(trades, { enabled: false, amount: 300 }).show).toBe(false);
    expect(state(trades, { enabled: true, amount: null }).show).toBe(false);
    expect(state(trades, { enabled: true, amount: 0 }).show).toBe(false);
  });

  it('shows when the net loss reaches the cap, including equality', () => {
    expect(state([closed({ netPnl: -299.99 })]).show).toBe(false);
    expect(state([closed({ netPnl: -300 })]).show).toBe(true);
    expect(state([closed({ netPnl: -450 })]).show).toBe(true);
    expect(state([closed({ netPnl: -450 })]).loss).toBe(450);
  });

  it('lets a win today offset a loss', () => {
    const trades = [closed({ netPnl: -500 }), closed({ id: 'w', netPnl: 200 })];
    expect(state(trades).net).toBe(-300);
    expect(state(trades).show).toBe(true);
    expect(state([closed({ netPnl: -500 }), closed({ netPnl: 250 })]).show).toBe(false);
  });

  it('ignores yesterday, open trades, and partial exits', () => {
    expect(state([closed({ exitDate: YESTERDAY, netPnl: -900 })]).show).toBe(false);
    expect(state([closed({ status: 'open', netPnl: -900 })]).show).toBe(false);
    expect(state([closed({
      status: 'partial',
      netPnl: -900,
      exits: [{ price: 1, percent: 50 }],
    })]).show).toBe(false);
  });

  it('uses the entry date when a closed import has no exit date', () => {
    expect(state([closed({ exitDate: null, entryDate: TODAY, netPnl: -300 })]).show).toBe(true);
    expect(state([closed({ exitDate: null, entryDate: YESTERDAY, netPnl: -300 })]).show).toBe(false);
  });

  it('does not count another journal or a non-dollar contract', () => {
    expect(state([closed({ journalId: 'j2', netPnl: -900 })]).show).toBe(false);
    expect(state([closed({ netPnl: -900, contract: { currency: 'CAD' } })]).net).toBe(0);
    expect(state([
      closed({ netPnl: -100 }),
      closed({ id: 'cad', netPnl: -900, contract: { currency: 'CAD' } }),
    ]).loss).toBe(100);
  });

  it('falls back to pnl and ignores a value that is not a number', () => {
    expect(state([closed({ netPnl: undefined, pnl: -300 })]).show).toBe(true);
    expect(state([closed({ netPnl: 'nope', pnl: -900 })]).net).toBe(0);
  });
});

describe('dailyLossAlertPatch', () => {
  it('does not write a journal that never turned the alert on', () => {
    expect(dailyLossAlertPatch(undefined, { enabled: false, amount: '' })).toBeUndefined();
    expect(dailyLossAlertPatch(null, { enabled: true, amount: '' })).toBeUndefined();
    expect(dailyLossAlertPatch(undefined, { enabled: true, amount: 0 })).toBeUndefined();
  });

  it('writes a fixed dollar cap only after the user enables a positive amount', () => {
    expect(dailyLossAlertPatch(undefined, { enabled: true, amount: '300' })).toEqual({
      enabled: true,
      amount: 300,
    });
  });

  it('can turn an existing alert off without dropping the field', () => {
    expect(dailyLossAlertPatch(
      { enabled: true, amount: 300 },
      { enabled: false, amount: '300' },
    )).toEqual({ enabled: false, amount: 300 });
  });

  it('never writes while demo mode is on', () => {
    expect(dailyLossAlertPatch(undefined, { enabled: true, amount: '300' }, { demo: true })).toBeUndefined();
    expect(dailyLossAlertPatch(
      { enabled: true, amount: 300 },
      { enabled: false, amount: '' },
      { demo: true },
    )).toBeUndefined();
  });
});
