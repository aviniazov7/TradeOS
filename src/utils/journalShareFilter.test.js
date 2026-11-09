import { describe, expect, it } from 'vitest';
import { filterJournalShare, normalizeShareFields } from './journalShareFilter';

const SECRET_NOTE = 'SECRET-NOTE';
const SECRET_REASON = 'SECRET-REASON';
const SECRET_FEAR = 'SECRET-FEAR';
const SECRET_MISTAKE = 'SECRET-MISTAKE';
const SECRET_LINK = 'https://www.tradingview.com/chart/SECRET-LINK';
const SECRET_ADDRESS = '0xSECRETADDRESS';
const LIVE_BALANCE = 99999;

function journal() {
  return {
    id: 'j1',
    name: 'יומן בדיקה',
    exchange: 'bybit',
    initialBalance: 10000,
    liveBalance: LIVE_BALANCE,
    exchangeAddress: SECRET_ADDRESS,
    propFirm: { accountSize: 50000, apiKey: 'tos_secret', address: SECRET_ADDRESS },
  };
}

function trade(over = {}) {
  return {
    id: 't1',
    journalId: 'j1',
    pair: 'BTCUSDT',
    direction: 'long',
    status: 'closed',
    entryPrice: 100,
    exitPrice: 90,
    quantity: 1,
    leverage: 5,
    fees: 1,
    netPnl: -50,
    pnl: -49,
    result: 'loss',
    notes: SECRET_NOTE,
    entryReason: SECRET_REASON,
    emotionBefore: SECRET_FEAR,
    emotionAfter: 'relieved',
    mistakes: SECRET_MISTAKE,
    focusRating: 2,
    tradingViewUrls: [SECRET_LINK],
    address: SECRET_ADDRESS,
    apiKey: 'tos_on_trade',
    liveBalance: LIVE_BALANCE,
    exits: [{ price: 90, percent: 100, note: SECRET_NOTE }],
    ...over,
  };
}

function keysOf(value, into = new Set()) {
  if (!value || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    value.forEach((item) => keysOf(item, into));
    return into;
  }
  Object.entries(value).forEach(([key, child]) => {
    into.add(key);
    keysOf(child, into);
  });
  return into;
}

describe('normalizeShareFields', () => {
  it('starts with every switch off', () => {
    expect(normalizeShareFields()).toEqual({
      trades: false,
      notes: false,
      emotions: false,
      balances: false,
      tradingView: false,
    });
    expect(normalizeShareFields({ trades: 'true', notes: 1 }).trades).toBe(false);
    expect(normalizeShareFields({ trades: true }).trades).toBe(true);
  });
});

describe('filterJournalShare', () => {
  it('returns an empty screen when every switch is off', () => {
    const view = filterJournalShare(journal(), [trade()], {});
    expect(view).toEqual({ journalId: 'j1' });
    const json = JSON.stringify(view);
    expect(json).not.toContain(SECRET_NOTE);
    expect(json).not.toContain(SECRET_FEAR);
    expect(json).not.toContain(SECRET_LINK);
    expect(json).not.toContain(String(LIVE_BALANCE));
    expect(json).not.toContain(SECRET_ADDRESS);
    expect(keysOf(view).has('trades')).toBe(false);
    expect(keysOf(view).has('balances')).toBe(false);
  });

  it('does not return notes, emotions or links unless trades are on', () => {
    const fields = { notes: true, emotions: true, tradingView: true };
    const view = filterJournalShare(journal(), [trade()], fields);
    expect(view.trades).toBeUndefined();
    const json = JSON.stringify(view);
    expect(json).not.toContain(SECRET_NOTE);
    expect(json).not.toContain(SECRET_REASON);
    expect(json).not.toContain(SECRET_FEAR);
    expect(json).not.toContain(SECRET_MISTAKE);
    expect(json).not.toContain(SECRET_LINK);
    for (const key of ['notes', 'entryReason', 'emotionBefore', 'mistakes', 'tradingViewUrls']) {
      expect(keysOf(view).has(key)).toBe(false);
    }
  });

  it('returns balances and the prop size without trades, and nothing live', () => {
    const view = filterJournalShare(journal(), [trade()], { balances: true });
    expect(view.balances).toEqual({ initialBalance: 10000, propAccountSize: 50000 });
    expect(view.trades).toBeUndefined();
    const json = JSON.stringify(view);
    expect(json).not.toContain(String(LIVE_BALANCE));
    expect(json).not.toContain(SECRET_ADDRESS);
    expect(json).not.toContain('tos_secret');
    expect(json).not.toContain(SECRET_NOTE);
    expect(keysOf(view).has('liveBalance')).toBe(false);
    expect(keysOf(view).has('exchangeAddress')).toBe(false);
    expect(keysOf(view).has('apiKey')).toBe(false);
  });

  it('drops another journal and keeps an unselected field out of the JSON', () => {
    const foreign = trade({
      id: 'other',
      journalId: 'j2',
      pair: 'ETHUSDT',
      netPnl: -1000,
      notes: 'FOREIGN-NOTE',
    });
    const view = filterJournalShare(journal(), [trade(), foreign], { trades: true });
    expect(view.trades.map((row) => row.id)).toEqual(['t1']);
    expect(view.stats.net).toBe(-50);
    const keys = keysOf(view);
    for (const key of ['notes', 'entryReason', 'emotionBefore', 'emotionAfter', 'mistakes', 'focusRating', 'tradingViewUrls', 'address', 'apiKey', 'liveBalance']) {
      expect(keys.has(key)).toBe(false);
    }
    const json = JSON.stringify(view);
    expect(json).not.toContain(SECRET_NOTE);
    expect(json).not.toContain(SECRET_FEAR);
    expect(json).not.toContain(SECRET_LINK);
    expect(json).not.toContain('FOREIGN-NOTE');
    expect(json).not.toContain('ETHUSDT');
    expect(json).toContain('BTCUSDT');
  });

  it('adds notes, emotions and links only on top of trades', () => {
    const view = filterJournalShare(journal(), [trade()], {
      trades: true,
      notes: true,
      emotions: true,
      tradingView: true,
    });
    expect(view.trades[0]).toMatchObject({
      notes: SECRET_NOTE,
      entryReason: SECRET_REASON,
      emotionBefore: SECRET_FEAR,
      mistakes: SECRET_MISTAKE,
      focusRating: 2,
      tradingViewUrls: [SECRET_LINK],
    });
    expect(view.trades[0].exits).toEqual([{ price: 90, percent: 100 }]);
    expect(view.trades[0].exits[0].note).toBeUndefined();
  });

  it('computes statistics from the visible trades only', () => {
    const second = trade({ id: 't2', pair: 'SOLUSDT', netPnl: 80, result: 'win', notes: 'hidden' });
    const foreign = trade({ id: 't3', journalId: 'j2', netPnl: -500, result: 'loss' });
    const view = filterJournalShare(journal(), [trade(), second, foreign], { trades: true, notes: true });
    expect(view.stats).toMatchObject({ closed: 2, net: 30, wins: 1, losses: 1 });
    expect(JSON.stringify(view.stats)).not.toContain('hidden');
    expect(JSON.stringify(view.stats)).not.toContain(SECRET_NOTE);
  });

  it('shares nothing when the journal id is missing', () => {
    const view = filterJournalShare({ initialBalance: 10000 }, [trade()], {
      trades: true,
      balances: true,
    });
    expect(view).toEqual({ journalId: '' });
  });
});
