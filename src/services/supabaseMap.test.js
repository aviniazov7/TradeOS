import { describe, it, expect } from 'vitest';
import { mapToRow, mapFromRow } from './supabaseMap';

// A realistic app trade: core fields + jsonb arrays + long-tail journaling
// fields that have no dedicated column (must survive via `meta`).
const appTrade = {
  id: 'firestore-doc-1',
  pair: 'BTCUSDT', direction: 'long', orderType: 'market',
  entryPrice: 50000, exitPrice: 51000, quantity: 0.1, leverage: 10,
  stopLoss: 49000, fees: 3.58, pnl: 100, netPnl: 96.42, pnlPercent: 2,
  riskAmount: 10, rrRatio: 1.5, result: 'win', positionSize: 5000, margin: 500,
  status: 'closed', session: 'newyork', strategy: 'Wyckoff', notes: 'clean setup',
  source: 'bybit', externalId: 'abc123', journalId: 'journal-1',
  entryDate: new Date('2026-07-25T23:07:00.000Z'),
  exitDate: new Date('2026-07-26T14:03:00.000Z'),
  tps: [51000, 52000], exits: [{ price: 51000, percent: 100 }], externalIds: ['a', 'b'],
  // long-tail — no columns for these → must land in meta
  mistakes: ['early exit'], mental: { focus: 3, confidence: 4 },
  entryChartUrl: 'https://tv.com/x', tags: ['scalp'],
};

describe('supabaseMap — trades', () => {
  it('maps core fields to their columns (+ Date → ISO)', () => {
    const row = mapToRow('trades', appTrade);
    expect(row.symbol).toBe('BTCUSDT');
    expect(row.side).toBe('long');
    expect(row.entry_price).toBe(50000);
    expect(row.net_pnl).toBe(96.42);
    expect(row.rr_ratio).toBe(1.5);
    expect(row.opened_at).toBe('2026-07-25T23:07:00.000Z');
    expect(row.tps).toEqual([51000, 52000]);
    // the mapper never sets id / user_id — the service layer does
    expect(row.id).toBeUndefined();
    expect(row.user_id).toBeUndefined();
  });

  it('routes long-tail fields into meta (and keeps core out of meta)', () => {
    const row = mapToRow('trades', appTrade);
    expect(row.meta).toMatchObject({
      mistakes: ['early exit'],
      mental: { focus: 3, confidence: 4 },
      entryChartUrl: 'https://tv.com/x',
      tags: ['scalp'],
    });
    expect(row.meta.pair).toBeUndefined();
    expect(row.meta.entryPrice).toBeUndefined();
  });

  it('round-trips app → row → app faithfully', () => {
    const dbRow = { id: 'pg-uuid-1', user_id: 'user-1', ...mapToRow('trades', appTrade) };
    const back = mapFromRow('trades', dbRow);
    // core fields restored to camelCase
    expect(back.pair).toBe('BTCUSDT');
    expect(back.direction).toBe('long');
    expect(back.netPnl).toBe(96.42);
    expect(back.entryDate).toBe('2026-07-25T23:07:00.000Z');
    expect(back.tps).toEqual([51000, 52000]);
    expect(back.externalIds).toEqual(['a', 'b']);
    // long-tail restored from meta
    expect(back.mistakes).toEqual(['early exit']);
    expect(back.mental).toEqual({ focus: 3, confidence: 4 });
    expect(back.tags).toEqual(['scalp']);
    // id becomes the Postgres id; internal columns don't leak as app fields
    expect(back.id).toBe('pg-uuid-1');
    expect(back.user_id).toBeUndefined();
    expect(back.meta).toBeUndefined();
  });
});

describe('supabaseMap — signals', () => {
  const appSignal = {
    id: 'sig-1', pair: 'ETHUSDT', direction: 'short', status: 'waiting',
    notes: 'waiting for retest', entryZone: '3100-3150', targetPrice: 2900, stopPrice: 3250,
    createdAt: new Date('2026-07-25T10:00:00.000Z'),
    timeframe: '4H', confidence: 'high', // long-tail → meta
  };

  it('maps fields to columns and long-tail to meta', () => {
    const row = mapToRow('signals', appSignal);
    expect(row.symbol).toBe('ETHUSDT');
    expect(row.side).toBe('short');
    expect(row.entry_zone).toBe('3100-3150');
    expect(row.target_price).toBe(2900);
    expect(row.created_at).toBe('2026-07-25T10:00:00.000Z');
    expect(row.meta).toMatchObject({ timeframe: '4H', confidence: 'high' });
    expect(row.meta.pair).toBeUndefined();
  });

  it('round-trips faithfully', () => {
    const dbRow = { id: 'pg-sig', user_id: 'u', ...mapToRow('signals', appSignal) };
    const back = mapFromRow('signals', dbRow);
    expect(back.pair).toBe('ETHUSDT');
    expect(back.direction).toBe('short');
    expect(back.targetPrice).toBe(2900);
    expect(back.timeframe).toBe('4H');
    expect(back.id).toBe('pg-sig');
    expect(back.meta).toBeUndefined();
  });
});

describe('supabaseMap — strategies', () => {
  const appStrategy = {
    id: 'str-1', name: 'Wyckoff', description: 'accumulation/distribution',
    rules: { entry: 'spring', exit: 'LPSY' }, isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('maps name/description/rules and routes isActive to meta', () => {
    const row = mapToRow('strategies', appStrategy);
    expect(row.name).toBe('Wyckoff');
    expect(row.description).toBe('accumulation/distribution');
    expect(row.rules).toEqual({ entry: 'spring', exit: 'LPSY' });
    expect(row.meta).toMatchObject({ isActive: true });
  });

  it('round-trips faithfully', () => {
    const dbRow = { id: 'pg-str', user_id: 'u', ...mapToRow('strategies', appStrategy) };
    const back = mapFromRow('strategies', dbRow);
    expect(back.name).toBe('Wyckoff');
    expect(back.rules).toEqual({ entry: 'spring', exit: 'LPSY' });
    expect(back.isActive).toBe(true);
    expect(back.id).toBe('pg-str');
  });
});

describe('supabaseMap — backtests', () => {
  const appBacktest = {
    id: 'bt-1', pair: 'GOLDUSDT', direction: 'short', strategy: 'Wyckoff', trigger: 'LPSY',
    timeframe: '4H', session: 'newyork', rResult: 2.5, result: 'win', notes: 'clean',
    entryChartUrl: 'https://tv/1', managementChartUrl: 'https://tv/2',
    date: new Date('2026-07-20T12:00:00.000Z'),
    maxR: 3, stopDistancePct: 1.2, // → meta
  };

  it('maps trade-like fields to columns (trigger → trigger_name)', () => {
    const row = mapToRow('backtests', appBacktest);
    expect(row.symbol).toBe('GOLDUSDT');
    expect(row.side).toBe('short');
    expect(row.trigger_name).toBe('LPSY');
    expect(row.r_result).toBe(2.5);
    expect(row.result).toBe('win');
    expect(row.date).toBe('2026-07-20T12:00:00.000Z');
    expect(row.meta).toMatchObject({ maxR: 3, stopDistancePct: 1.2 });
  });

  it('round-trips faithfully', () => {
    const dbRow = { id: 'pg-bt', user_id: 'u', ...mapToRow('backtests', appBacktest) };
    const back = mapFromRow('backtests', dbRow);
    expect(back.pair).toBe('GOLDUSDT');
    expect(back.trigger).toBe('LPSY');
    expect(back.rResult).toBe(2.5);
    expect(back.maxR).toBe(3);
    expect(back.id).toBe('pg-bt');
  });
});

describe('supabaseMap — dca', () => {
  const appDca = {
    id: 'dca-1', coin: 'BTC', frequency: 'weekly', amountPerEntry: 100, targetPrice: 80000,
    status: 'active', entries: [{ amount: 100, coins: 0.002 }], totalInvested: 100,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('maps coin → symbol and the rest into meta', () => {
    const row = mapToRow('dca', appDca);
    expect(row.symbol).toBe('BTC');
    expect(row.meta).toMatchObject({ frequency: 'weekly', amountPerEntry: 100, targetPrice: 80000 });
    expect(row.meta.entries).toEqual([{ amount: 100, coins: 0.002 }]);
  });

  it('round-trips faithfully', () => {
    const dbRow = { id: 'pg-dca', user_id: 'u', ...mapToRow('dca', appDca) };
    const back = mapFromRow('dca', dbRow);
    expect(back.coin).toBe('BTC');
    expect(back.frequency).toBe('weekly');
    expect(back.entries).toEqual([{ amount: 100, coins: 0.002 }]);
    expect(back.id).toBe('pg-dca');
  });
});

describe('supabaseMap — journal family (entries)', () => {
  const appNote = {
    id: 'n1', title: 'my note', text: 'buy the dip', pinned: true,
    createdAt: new Date('2026-07-10T08:00:00.000Z'),
  };

  it('injects kind, maps dates, routes the rest to meta', () => {
    const row = mapToRow('notes', appNote);
    expect(row.kind).toBe('note');
    expect(row.created_at).toBe('2026-07-10T08:00:00.000Z');
    expect(row.meta).toMatchObject({ title: 'my note', text: 'buy the dip', pinned: true });
  });

  it('different collections get different kinds', () => {
    expect(mapToRow('tradingPlans', {}).kind).toBe('plan');
    expect(mapToRow('processes', {}).kind).toBe('process');
    expect(mapToRow('morningJournals', {}).kind).toBe('morning');
    expect(mapToRow('eveningJournals', {}).kind).toBe('evening');
  });

  it('round-trips and drops the kind discriminator', () => {
    // simulate a journal_entries row with unused shared columns (null)
    const dbRow = { id: 'pg-n', user_id: 'u', content: null, emotion: null, trade_id: null, ...mapToRow('notes', appNote) };
    const back = mapFromRow('notes', dbRow);
    expect(back.title).toBe('my note');
    expect(back.text).toBe('buy the dip');
    expect(back.pinned).toBe(true);
    expect(back.id).toBe('pg-n');
    expect(back.kind).toBeUndefined();      // discriminator not leaked
    expect(back.content).toBeUndefined();   // unused null column not leaked
  });
});

describe('supabaseMap — journal family (containers)', () => {
  const appJournal = {
    id: 'j1', name: 'Bybit Main', exchange: 'bybit', initialBalance: 1000,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('maps container fields + injects is_backtest', () => {
    const jr = mapToRow('journals', appJournal);
    expect(jr.name).toBe('Bybit Main');
    expect(jr.initial_balance).toBe(1000);
    expect(jr.is_backtest).toBe(false);
    expect(mapToRow('backtestJournals', appJournal).is_backtest).toBe(true);
  });

  it('round-trips and drops is_backtest', () => {
    const dbRow = { id: 'pg-j', user_id: 'u', ...mapToRow('journals', appJournal) };
    const back = mapFromRow('journals', dbRow);
    expect(back.name).toBe('Bybit Main');
    expect(back.initialBalance).toBe(1000);
    expect(back.is_backtest).toBeUndefined();
    expect(back.id).toBe('pg-j');
  });
});

describe('supabaseMap — profiles', () => {
  const appProfile = {
    displayName: 'Avi', email: 'a@x.com', photoURL: 'https://p/1', role: 'admin',
    plan: 'premium', planExpires: new Date('2027-01-01T00:00:00.000Z'),
    onboardingCompleted: true, appVersion: '2.0.0',
    lastActive: new Date('2026-08-01T10:00:00.000Z'),
    settings: { defaultLeverage: 10, baseCurrency: 'USDT' },
    someExtra: 'x', // long-tail → meta
  };

  it('maps profile fields (planExpires → premium_until, settings → jsonb)', () => {
    const row = mapToRow('profiles', appProfile);
    expect(row.display_name).toBe('Avi');
    expect(row.photo_url).toBe('https://p/1');
    expect(row.premium_until).toBe('2027-01-01T00:00:00.000Z');
    expect(row.onboarding_completed).toBe(true);
    expect(row.settings).toEqual({ defaultLeverage: 10, baseCurrency: 'USDT' });
    expect(row.meta).toMatchObject({ someExtra: 'x' });
  });

  it('round-trips (id comes from the row, planExpires restored)', () => {
    const dbRow = { id: 'user-uid', ...mapToRow('profiles', appProfile) };
    const back = mapFromRow('profiles', dbRow);
    expect(back.id).toBe('user-uid');
    expect(back.displayName).toBe('Avi');
    expect(back.planExpires).toBe('2027-01-01T00:00:00.000Z');
    expect(back.settings).toEqual({ defaultLeverage: 10, baseCurrency: 'USDT' });
    expect(back.someExtra).toBe('x');
  });
});

describe('supabaseMap — pass-through', () => {
  it('unmapped collections pass through unchanged', () => {
    const item = { symbol: 'ETH', name: 'x' };
    expect(mapToRow('watchlist', item)).toEqual(item);
    expect(mapFromRow('watchlist', item)).toEqual(item);
  });
});
