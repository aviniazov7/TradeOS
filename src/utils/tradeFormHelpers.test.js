import { describe, it, expect } from 'vitest';
import {
  isSelectableTradeTime,
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
  riskBudgetCheck,
  riskToStop,
  stopDistancePct,
  rMultiple,
  plannedRewardRisk,
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

describe('ticket summary', () => {
  it('riskBudgetCheck: % of balance, flagged past a percent limit', () => {
    const settings = { riskType: 'percent', riskValue: 1, currentBalance: 10000 };
    expect(riskBudgetCheck(50, settings)).toMatchObject({ severity: 'info', exceeds: false, limitLabel: '1%', message: 'סיכון 0.5% מהתיק' });
    expect(riskBudgetCheck(150, settings)).toMatchObject({ severity: 'warning', exceeds: true });
    expect(riskBudgetCheck(250, settings).severity).toBe('critical');
    expect(riskBudgetCheck(250, settings).percent).toBeCloseTo(2.5, 10);
  });
  it('riskBudgetCheck: fixed-$ limit without a balance, null when nothing to say', () => {
    expect(riskBudgetCheck(120, { riskType: 'fixed', riskValue: 100 })).toMatchObject({ severity: 'warning', percent: null, limitLabel: '$100' });
    expect(riskBudgetCheck(201, { riskType: 'fixed', riskValue: 100 }).severity).toBe('critical');
    expect(riskBudgetCheck(80, { riskType: 'fixed', riskValue: 100 })).toBeNull();
    expect(riskBudgetCheck(0, { riskType: 'percent', riskValue: 1, currentBalance: 1000 })).toBeNull();
    expect(riskBudgetCheck('', undefined)).toBeNull();
  });
  it('riskToStop and stopDistancePct', () => {
    expect(riskToStop({ entry: 100, stop: 95, units: 4 })).toBe(20);
    // ES: 10 points × $50 × 2 contracts
    expect(riskToStop({ entry: 5000, stop: 4990, units: 2, pointValue: 50 })).toBe(1000);
    expect(riskToStop({ entry: 100, stop: 0, units: 4 })).toBe(0);
    expect(stopDistancePct(100, 95)).toBeCloseTo(5, 10);
    expect(stopDistancePct(100, '')).toBeNull();
  });
  it('rMultiple is signed by direction', () => {
    expect(rMultiple('long', 100, 95, 110)).toBeCloseTo(2, 10);
    expect(rMultiple('long', 100, 95, 95)).toBeCloseTo(-1, 10);
    expect(rMultiple('short', 100, 105, 90)).toBeCloseTo(2, 10);
    expect(rMultiple('long', 100, 100, 110)).toBeNull();
    // The owner's INJ example: long 7.715, stop 7.652, out at 7.65 → just past −1R
    expect(rMultiple('long', 7.715, 7.652, 7.65)).toBeCloseTo(-1.0317, 3);
  });
  it('plannedRewardRisk: TP1 and the blended target', () => {
    const base = { direction: 'long', entry: 100, stop: 95 };
    // Equal blend of 110 and 120 → 115 → 3R
    expect(plannedRewardRisk({ ...base, targets: [{ price: 110 }, { price: 120 }] })).toEqual({ tp1: 2, blended: 3 });
    // 25% at 110, the other 75% at 120 → 117.5 → 3.5R
    const r = plannedRewardRisk({ ...base, targets: [{ price: 110, weight: 25 }, { price: 120 }] });
    expect(r.blended).toBeCloseTo(3.5, 10);
    expect(plannedRewardRisk({ ...base, targets: [] })).toEqual({ tp1: null, blended: null });
    expect(plannedRewardRisk({ ...base, stop: 0, targets: [{ price: 110 }] })).toEqual({ tp1: null, blended: null });
  });
});

describe('isSelectableTradeTime', () => {
  const now = new Date(2026, 9, 9, 14, 30);
  it('blocks a later hour today', () => {
    expect(isSelectableTradeTime(new Date(2026, 9, 9, 15, 0), { now })).toBe(false);
  });
  it('allows earlier hours today and past days', () => {
    expect(isSelectableTradeTime(new Date(2026, 9, 9, 14, 15), { now })).toBe(true);
    expect(isSelectableTradeTime(new Date(2026, 9, 8, 23, 45), { now })).toBe(true);
  });
  it('blocks an exit before the entry', () => {
    const min = new Date(2026, 9, 9, 10, 0);
    expect(isSelectableTradeTime(new Date(2026, 9, 9, 9, 45), { now, min })).toBe(false);
    expect(isSelectableTradeTime(new Date(2026, 9, 9, 10, 0), { now, min })).toBe(true);
  });
  it('rejects invalid input', () => {
    expect(isSelectableTradeTime(null, { now })).toBe(false);
    expect(isSelectableTradeTime(new Date('x'), { now })).toBe(false);
  });
});
