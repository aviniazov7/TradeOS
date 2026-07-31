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

describe('supabaseMap — pass-through', () => {
  it('unmapped collections pass through unchanged', () => {
    const item = { symbol: 'ETH', name: 'x' };
    expect(mapToRow('watchlist', item)).toEqual(item);
    expect(mapFromRow('watchlist', item)).toEqual(item);
  });
});
