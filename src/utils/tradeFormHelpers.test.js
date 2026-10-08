import { describe, it, expect } from 'vitest';
import {
  aggregateFills,
  exitsClosedPercent,
  normalizeCommissions,
  hasCommissionPreset,
  estimateCommission,
  buildChecklistRows,
  checklistAdherence,
  loadLastTradeChoices,
  saveLastTradeChoices,
  canMoveStopToBreakeven,
} from './tradeFormHelpers';
import { computeTradeFields } from './calculations';

describe('aggregateFills', () => {
  it('returns the size-weighted average entry and total size', () => {
    const agg = aggregateFills([{ price: 100, quantity: 1 }, { price: 110, quantity: 3 }]);
    expect(agg.quantity).toBe(4);
    expect(agg.price).toBeCloseTo(107.5, 10);
    expect(agg.notional).toBeCloseTo(430, 10);
  });

  it('accepts strings and ignores invalid fills', () => {
    const agg = aggregateFills([
      { price: '50', quantity: '2' },
      { price: '', quantity: '5' },
      { price: '60', quantity: '0' },
      { price: '-1', quantity: '1' },
      null,
    ]);
    expect(agg.quantity).toBe(2);
    expect(agg.price).toBe(50);
  });

  it('is all zero with no valid fill', () => {
    expect(aggregateFills([])).toEqual({ price: 0, quantity: 0, notional: 0 });
    expect(aggregateFills(undefined)).toEqual({ price: 0, quantity: 0, notional: 0 });
  });

  it('a single fill is unchanged (legacy trades keep their numbers)', () => {
    expect(aggregateFills([{ price: 123.45, quantity: 0.5 }])).toEqual({ price: 123.45, quantity: 0.5, notional: 61.725 });
  });

  it('feeds computeTradeFields: partial exits work against the aggregate', () => {
    // Long 1 @ 100, add 1 @ 120 → 2 @ 110. 50% out at 130, 50% at 100.
    const agg = aggregateFills([{ price: 100, quantity: 1 }, { price: 120, quantity: 1 }]);
    const r = computeTradeFields({
      direction: 'long', entryPrice: agg.price, quantity: agg.quantity, leverage: 1, fees: 0,
      stopLoss: 90, exits: [{ price: 130, percent: 50 }, { price: 100, percent: 50 }],
    });
    // (130-110)*1 + (100-110)*1 = 10
    expect(r.pnl).toBeCloseTo(10, 10);
  });
});

describe('exitsClosedPercent', () => {
  it('sums percents for crypto/stocks', () => {
    expect(exitsClosedPercent([{ percent: '50' }, { percent: 25 }, { percent: '' }])).toBe(75);
  });
  it('uses contracts against the total for futures', () => {
    expect(exitsClosedPercent([{ contracts: 1 }, { contracts: '2' }], { isFutures: true, totalContracts: 3 })).toBe(100);
    expect(exitsClosedPercent([{ contracts: 1 }], { isFutures: true, totalContracts: 0 })).toBe(0);
  });
});

describe('commission presets', () => {
  it('normalizes to non-negative numbers', () => {
    expect(normalizeCommissions({ cryptoMakerPct: '0.02', cryptoTakerPct: -1, stockPerShare: 'x' })).toEqual({
      cryptoMakerPct: 0.02, cryptoTakerPct: 0, stockPerShare: 0, stockMinPerOrder: 0, futuresPerContractSide: 0,
    });
  });

  it('detects a preset per asset class', () => {
    const p = { cryptoTakerPct: 0.05, stockMinPerOrder: 1 };
    expect(hasCommissionPreset('crypto', p)).toBe(true);
    expect(hasCommissionPreset('stocks', p)).toBe(true);
    expect(hasCommissionPreset('futures_cme', p)).toBe(false);
    expect(hasCommissionPreset('crypto', null)).toBe(false);
  });

  it('returns null without a preset or size', () => {
    expect(estimateCommission({ assetClass: 'crypto', preset: {}, fills: [{ price: 100, quantity: 1 }] })).toBeNull();
    expect(estimateCommission({ assetClass: 'crypto', preset: { cryptoTakerPct: 0.05 }, fills: [] })).toBeNull();
  });

  describe('crypto (% of notional)', () => {
    const preset = { cryptoMakerPct: 0.02, cryptoTakerPct: 0.05 };
    it('market entry: taker in + taker out on the entry notional when still open', () => {
      // 1 BTC @ 50,000 → 50,000 × 0.05% × 2 = 50
      expect(estimateCommission({ assetClass: 'crypto', preset, orderType: 'market', fills: [{ price: 50000, quantity: 1 }] })).toBe(50);
    });
    it('limit entry uses maker on the way in', () => {
      // 50,000 × 0.02% + 50,000 × 0.05% = 10 + 25 = 35
      expect(estimateCommission({ assetClass: 'crypto', preset, orderType: 'limit', fills: [{ price: 50000, quantity: 1 }] })).toBe(35);
    });
    it('prices recorded exits at their exit price and the rest at entry', () => {
      // in: 100×2 = 200 × 0.05% = 0.1 ; out: 1@120 = 120 + 1@100 (remainder) = 100 → 220 × 0.05% = 0.11
      expect(estimateCommission({
        assetClass: 'crypto', preset, fills: [{ price: 100, quantity: 2 }], exits: [{ price: 120, quantity: 1 }],
      })).toBe(0.21);
    });
    it('sums every scale-in fill', () => {
      // 1@100 + 1@200 = 300 in, 300 out at avg 150 → 600 × 0.05% = 0.3
      expect(estimateCommission({
        assetClass: 'crypto', preset, fills: [{ price: 100, quantity: 1 }, { price: 200, quantity: 1 }],
      })).toBe(0.3);
    });
  });

  describe('stocks ($ per share, min per order)', () => {
    const preset = { stockPerShare: 0.005, stockMinPerOrder: 1 };
    it('applies the per-order minimum on small orders', () => {
      // 100 sh: 0.5 → min 1, twice (in + out) = 2
      expect(estimateCommission({ assetClass: 'stocks', preset, fills: [{ price: 10, quantity: 100 }] })).toBe(2);
    });
    it('uses per-share above the minimum', () => {
      // 1000 sh: 5 in + 5 out = 10
      expect(estimateCommission({ assetClass: 'stocks', preset, fills: [{ price: 10, quantity: 1000 }] })).toBe(10);
    });
    it('every fill and every exit is its own order', () => {
      // fills 1000 (5) + 100 (min 1); exits 600 (3) + remainder 500 (2.5) = 11.5
      expect(estimateCommission({
        assetClass: 'stocks', preset,
        fills: [{ price: 10, quantity: 1000 }, { price: 11, quantity: 100 }],
        exits: [{ price: 12, quantity: 600 }],
      })).toBe(11.5);
    });
    it('no remainder order once fully exited', () => {
      expect(estimateCommission({
        assetClass: 'stocks', preset, fills: [{ price: 10, quantity: 1000 }], exits: [{ price: 12, quantity: 1000 }],
      })).toBe(10);
    });
  });

  describe('futures ($ per contract per side)', () => {
    it('charges both sides on the total contracts', () => {
      // 3 contracts (2 + 1 add) × $2.25 × 2 = 13.5
      expect(estimateCommission({
        assetClass: 'futures_cme', preset: { futuresPerContractSide: 2.25 },
        fills: [{ price: 5000, quantity: 2 }, { price: 5010, quantity: 1 }],
        exits: [{ price: 5020, quantity: 3 }],
      })).toBe(13.5);
    });
  });
});

describe('plan checklist', () => {
  it('keeps plan order, restores ticks and keeps items the plan dropped', () => {
    const rows = buildChecklistRows(['HTF trend', 'POI', 'RR 1:2'], [
      { item: 'POI', done: true }, { item: 'Old item', done: true }, { item: 'RR 1:2', done: false },
    ]);
    expect(rows).toEqual([
      { item: 'HTF trend', done: false },
      { item: 'POI', done: true },
      { item: 'RR 1:2', done: false },
      { item: 'Old item', done: true },
    ]);
  });

  it('dedupes and drops blank items', () => {
    expect(buildChecklistRows(['a', ' a ', '', null], null)).toEqual([{ item: 'a', done: false }]);
  });

  it('adherence is the ticked share, null when empty', () => {
    expect(checklistAdherence([{ item: 'a', done: true }, { item: 'b', done: false }, { item: 'c', done: true }])).toBe(67);
    expect(checklistAdherence([])).toBeNull();
  });
});

describe('remembered choices', () => {
  const memStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  };

  it('round-trips per journal', () => {
    const s = memStorage();
    saveLastTradeChoices('j1', { strategy: 'SMC', timeframe: '1H', trigger: 'BOS' }, s);
    saveLastTradeChoices('j2', { strategy: 'Wyckoff', timeframe: '1D', trigger: '' }, s);
    expect(loadLastTradeChoices('j1', s)).toEqual({ strategy: 'SMC', timeframe: '1H', trigger: 'BOS' });
    expect(loadLastTradeChoices('j2', s)).toEqual({ strategy: 'Wyckoff', timeframe: '1D', trigger: '' });
    expect(loadLastTradeChoices('j3', s)).toBeNull();
  });

  it('survives broken or missing storage', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadLastTradeChoices('j1', throwing)).toBeNull();
    expect(() => saveLastTradeChoices('j1', {}, throwing)).not.toThrow();
    const bad = { getItem: () => '{not json', setItem: () => {} };
    expect(loadLastTradeChoices('j1', bad)).toBeNull();
  });
});

describe('canMoveStopToBreakeven', () => {
  it('true for a trade with a risk-side stop', () => {
    expect(canMoveStopToBreakeven({ direction: 'long', entryPrice: 100, stopLoss: 95 })).toBe(true);
    expect(canMoveStopToBreakeven({ direction: 'short', entryPrice: 100, stopLoss: 105 })).toBe(true);
  });
  it('false once the stop is at entry', () => {
    expect(canMoveStopToBreakeven({ direction: 'long', entryPrice: 100, stopLoss: 100, originalStopLoss: 95 })).toBe(false);
  });
  it('true for a trailed stop that still has an original risk stop', () => {
    expect(canMoveStopToBreakeven({ direction: 'long', entryPrice: 100, stopLoss: 102, originalStopLoss: 95 })).toBe(true);
  });
  it('false without any defined risk', () => {
    expect(canMoveStopToBreakeven({ direction: 'long', entryPrice: 100, stopLoss: 0 })).toBe(false);
    expect(canMoveStopToBreakeven({ direction: 'long', entryPrice: 0, stopLoss: 95 })).toBe(false);
  });
});
