import { describe, it, expect } from 'vitest';
import { mergeClosedPositions, positionKey, MERGE_WINDOW_MS } from './tradeMerge';

// Bybit returns one row per CLOSING ORDER. Getting this wrong either splits one
// position into several journal trades or fuses two unrelated positions into
// one — both corrupt the journal, and both have happened.

const row = (over = {}) => ({
  pair: 'BTCUSDT', direction: 'long',
  entryPrice: 60000, exitPrice: 62000, quantity: 1,
  pnlFromExchange: 2000, fees: 10, stopLoss: 59000,
  entryDate: '2026-08-01T10:00:00.000Z',
  exitDate: '2026-08-02T10:00:00.000Z',
  externalId: 'close-1',
  ...over,
});

describe('positionKey', () => {
  it('prefers the matched opening order over the entry price', () => {
    // Entry price alone fused two different positions that filled at the same
    // limit price into one trade with a fabricated TP breakdown.
    const a = row({ _openOrderId: 'open-A' });
    const b = row({ _openOrderId: 'open-B' });
    expect(positionKey(a)).not.toBe(positionKey(b));
  });
  it('falls back to pair+direction+entry when no opening order matched', () => {
    expect(positionKey(row())).toBe(positionKey(row({ externalId: 'other' })));
    expect(positionKey(row())).not.toBe(positionKey(row({ direction: 'short' })));
  });
});

describe('mergeClosedPositions — a single close', () => {
  it('passes through and gains an externalIds array', () => {
    const [t] = mergeClosedPositions([row()]);
    expect(t.quantity).toBe(1);
    expect(t.exitPrice).toBe(62000);
    expect(t.externalIds).toEqual(['close-1']);
    expect(t.exits).toBeUndefined();
  });
});

describe('mergeClosedPositions — a position closed across take-profits', () => {
  const cluster = [
    row({ _openOrderId: 'o1', exitPrice: 62000, quantity: 1, pnlFromExchange: 2000, fees: 5, exitDate: '2026-08-02T10:00:00.000Z', externalId: 'tp1' }),
    row({ _openOrderId: 'o1', exitPrice: 64000, quantity: 1, pnlFromExchange: 4000, fees: 5, exitDate: '2026-08-03T10:00:00.000Z', externalId: 'tp2' }),
  ];

  it('becomes ONE trade carrying every close id', () => {
    const out = mergeClosedPositions(cluster);
    expect(out).toHaveLength(1);
    expect(out[0].externalIds).toEqual(['tp1', 'tp2']);
  });

  it('sums quantity, P&L and fees, and weights the exit price', () => {
    const [t] = mergeClosedPositions(cluster);
    expect(t.quantity).toBe(2);
    expect(t.pnlFromExchange).toBe(6000);
    expect(t.fees).toBe(10);
    expect(t.exitPrice).toBe(63000); // (62000 + 64000) / 2
  });

  it('records the TP breakdown as exits summing to EXACTLY 100', () => {
    const [t] = mergeClosedPositions(cluster);
    expect(t.exits).toEqual([
      { price: 62000, percent: 50 },
      { price: 64000, percent: 50 },
    ]);
  });

  it('pins the last slice so rounded thirds still total 100', () => {
    // 33.33 x 3 = 99.99 demoted the trade from 'closed' to 'partial' on its
    // next edit-save, which made it disappear from analytics.
    const thirds = [1, 2, 3].map((i) => row({
      _openOrderId: 'o2', quantity: 1, exitPrice: 60000 + i,
      exitDate: `2026-08-0${i + 1}T10:00:00.000Z`, externalId: `t${i}`,
    }));
    const [t] = mergeClosedPositions(thirds);
    const total = t.exits.reduce((s, e) => s + e.percent, 0);
    expect(total).toBe(100);
    expect(t.exits[0].percent).toBeCloseTo(33.33);
  });

  it('spans the whole position: earliest entry, latest exit', () => {
    const [t] = mergeClosedPositions([
      { ...cluster[1], entryDate: '2026-08-01T12:00:00.000Z' },
      { ...cluster[0], entryDate: '2026-08-01T09:00:00.000Z' },
    ]);
    expect(t.entryDate).toBe('2026-08-01T09:00:00.000Z');
    expect(t.exitDate).toBe('2026-08-03T10:00:00.000Z');
  });

  it('recomputes risk and R for the FULL size, not one slice', () => {
    const [t] = mergeClosedPositions(cluster);
    // stop 59000, entry 60000 → 1000 per unit x 2 units
    expect(t.riskAmount).toBe(2000);
    // |63000 - 60000| / 1000, unsigned
    expect(t.rrRatio).toBe(3);
  });

  it('takes the first real stop when some rows carry none', () => {
    const [t] = mergeClosedPositions([
      { ...cluster[0], stopLoss: 0 },
      { ...cluster[1], stopLoss: 58000 },
    ]);
    expect(t.stopLoss).toBe(58000);
  });
});

describe('mergeClosedPositions — separation', () => {
  it('does NOT merge closes further apart than the window', () => {
    const far = [
      row({ _openOrderId: 'o3', exitDate: '2026-06-01T10:00:00.000Z', externalId: 'a' }),
      row({ _openOrderId: 'o3', exitDate: '2026-08-01T10:00:00.000Z', externalId: 'b' }),
    ];
    const out = mergeClosedPositions(far);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.externalIds.flat())).toEqual([['b'], ['a']]);
  });

  it('keeps long and short on the same pair apart', () => {
    const out = mergeClosedPositions([
      row({ direction: 'long', externalId: 'L' }),
      row({ direction: 'short', externalId: 'S' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('the window is a week', () => {
    expect(MERGE_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('mergeClosedPositions — output shape', () => {
  it('returns newest close first and strips the internal grouping key', () => {
    const out = mergeClosedPositions([
      row({ _openOrderId: 'x', exitDate: '2026-08-01T10:00:00.000Z', externalId: 'old' }),
      row({ _openOrderId: 'y', exitDate: '2026-08-05T10:00:00.000Z', externalId: 'new' }),
    ]);
    expect(out.map((t) => t.externalId)).toEqual(['new', 'old']);
    expect(out.every((t) => !('_openOrderId' in t))).toBe(true);
  });

  it('handles an empty or missing list', () => {
    expect(mergeClosedPositions([])).toEqual([]);
    expect(mergeClosedPositions(null)).toEqual([]);
  });
});
