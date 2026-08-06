import { describe, it, expect } from 'vitest';
import {
  calculatePnL,
  calculateFuturesPnL,
  calculateFuturesPartialPnL,
  calculateFuturesContractsPnL,
  calculateFuturesNotional,
  calculatePnLPercent,
  calculateRR,
  calculateWeightedExitPrice,
  calculatePartialPnL,
  calculateNetPnL,
  getTradeResult,
  isClosedTrade,
  localDayKey,
  calculateWinRate,
  calculateProfitFactor,
  calculateMaxDrawdown,
  computeTradeFields,
} from './calculations';
import { planExpiresMs } from './premium';

// The financial core of the app — every stat card, calendar cell and
// leaderboard score flows through these. Pure functions, so they get real
// unit coverage (the UI is exercised manually / in staging).

describe('calculatePnL', () => {
  it('long: profit when exit above entry', () => {
    expect(calculatePnL('long', 100, 110, 2)).toBe(20);
  });
  it('short: profit when exit below entry', () => {
    expect(calculatePnL('short', 100, 90, 2)).toBe(20);
  });
  it('short: loss when exit above entry', () => {
    expect(calculatePnL('short', 100, 110, 1)).toBe(-10);
  });
  it('returns 0 on missing inputs', () => {
    expect(calculatePnL('long', 0, 110, 1)).toBe(0);
    expect(calculatePnL('long', 100, 0, 1)).toBe(0);
    expect(calculatePnL('long', 100, 110, 0)).toBe(0);
  });
});

describe('futures P&L', () => {
  it('ES example from the docs: 5000→5010 × $50 × 2 contracts = $1,000', () => {
    expect(calculateFuturesPnL('long', 5000, 5010, 50, 2)).toBe(1000);
  });
  it('short direction flips the sign', () => {
    expect(calculateFuturesPnL('short', 5000, 5010, 50, 1)).toBe(-500);
  });
  it('partial exits by percent match the equivalent single exits', () => {
    const exits = [{ price: 5010, percent: 50 }, { price: 5020, percent: 50 }];
    // 1 contract each: 10×50 + 20×50 = 1500
    expect(calculateFuturesPartialPnL('long', 5000, exits, 50, 2)).toBe(1500);
  });
  it('per-contract exits sum exactly', () => {
    const exits = [{ price: 5010, contracts: 1 }, { price: 5020, contracts: 2 }];
    expect(calculateFuturesContractsPnL('long', 5000, exits, 50)).toBe(500 + 2000);
  });
  it('notional = price × pointValue × contracts', () => {
    expect(calculateFuturesNotional(5000, 50, 2)).toBe(500000);
  });
});

describe('calculatePnLPercent (ROE)', () => {
  it('unleveraged percent return', () => {
    expect(calculatePnLPercent(10, 100, 1)).toBe(10);
  });
  it('leverage multiplies the return (return on margin)', () => {
    expect(calculatePnLPercent(10, 100, 1, 10)).toBe(100);
  });
  it('non-numeric leverage falls back to 1', () => {
    expect(calculatePnLPercent(10, 100, 1, 'abc')).toBe(10);
  });
  it('0 on missing entry/quantity', () => {
    expect(calculatePnLPercent(10, 0, 1)).toBe(0);
  });
});

describe('calculateRR', () => {
  it('reward/risk from entry, exit and stop', () => {
    // risk 5 (100→95), reward 10 (100→110) → 2R
    expect(calculateRR(100, 110, 95)).toBe(2);
  });
  it('0 when stop equals entry (zero risk)', () => {
    expect(calculateRR(100, 110, 100)).toBe(0);
  });
});

describe('partial exits (crypto)', () => {
  it('weighted exit price by percent', () => {
    const exits = [{ price: 100, percent: 50 }, { price: 200, percent: 50 }];
    expect(calculateWeightedExitPrice(exits)).toBe(150);
  });
  it('partial P&L equals the sum of the sliced positions', () => {
    const exits = [{ price: 110, percent: 50 }, { price: 120, percent: 50 }];
    // qty 2: (10×1) + (20×1) = 30
    expect(calculatePartialPnL('long', 100, exits, 2)).toBe(30);
  });
  it('0 total percent → 0 (no divide-by-zero)', () => {
    expect(calculateWeightedExitPrice([{ price: 100, percent: 0 }])).toBe(0);
  });
});

describe('calculateNetPnL / getTradeResult', () => {
  it('net = gross − fees, and missing fees count as 0', () => {
    expect(calculateNetPnL(100, 7)).toBe(93);
    expect(calculateNetPnL(100, undefined)).toBe(100);
  });
  it('win / loss / breakeven classification', () => {
    expect(getTradeResult(5)).toBe('win');
    expect(getTradeResult(-5)).toBe('loss');
    expect(getTradeResult(0)).toBe('breakeven');
  });
});

describe('isClosedTrade — the ONE closed predicate', () => {
  it('explicit closed status wins even without exit price (broker CSV import)', () => {
    expect(isClosedTrade({ status: 'closed' })).toBe(true);
  });
  it('explicit open/partial status wins even WITH an exit price', () => {
    expect(isClosedTrade({ status: 'open', exitPrice: 110 })).toBe(false);
    expect(isClosedTrade({ status: 'partial', exitPrice: 110 })).toBe(false);
  });
  it('no status: exit price or exchange P&L decide', () => {
    expect(isClosedTrade({ exitPrice: '110' })).toBe(true);
    expect(isClosedTrade({ pnlFromExchange: -3.2 })).toBe(true);
    expect(isClosedTrade({})).toBe(false);
  });
  it('null-safe', () => {
    expect(isClosedTrade(null)).toBe(false);
  });
});

describe('localDayKey — local-midnight day bucketing', () => {
  it('formats a Date by LOCAL calendar day', () => {
    expect(localDayKey(new Date(2026, 7, 4, 0, 30))).toBe('2026-08-04');
  });
  it('accepts ISO strings and pads month/day', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('invalid input → empty string', () => {
    expect(localDayKey('not-a-date')).toBe('');
  });
});

describe('calculateWinRate — decided trades only', () => {
  it('breakevens/undecided rows do not dilute the denominator', () => {
    const trades = [
      { result: 'win' }, { result: 'win' }, { result: 'loss' },
      { result: 'breakeven' }, { result: undefined },
    ];
    // 2 wins / 3 decided ≈ 66.67 — NOT 2/5=40
    expect(calculateWinRate(trades)).toBeCloseTo(66.67, 1);
  });
  it('0 when nothing is decided', () => {
    expect(calculateWinRate([{ result: 'breakeven' }])).toBe(0);
    expect(calculateWinRate([])).toBe(0);
  });
});

describe('calculateProfitFactor', () => {
  it('gross profit / gross loss, prefers netPnl over pnl', () => {
    const trades = [
      { netPnl: 100 }, { netPnl: -50 },
      { pnl: 50 }, // no netPnl → falls back to pnl
    ];
    expect(calculateProfitFactor(trades)).toBe(3);
  });
  it('no losses → Infinity; no trades → 0', () => {
    expect(calculateProfitFactor([{ netPnl: 10 }])).toBe(Infinity);
    expect(calculateProfitFactor([])).toBe(0);
  });
});

describe('calculateMaxDrawdown', () => {
  it('largest peak-to-trough drop in percent', () => {
    // peak 1000 → trough 800 = 20%
    expect(calculateMaxDrawdown([1000, 900, 800, 950], 1000)).toBe(20);
  });
  it('captures a first-trade loss via initialBalance as the starting peak', () => {
    expect(calculateMaxDrawdown([900], 1000)).toBeCloseTo(10, 5);
  });
  it('empty curve → 0, and never divides by a non-positive peak', () => {
    expect(calculateMaxDrawdown([], 1000)).toBe(0);
    expect(calculateMaxDrawdown([-100, -200], 0)).toBe(0);
  });
});

describe('planExpiresMs — premium expiry normalization', () => {
  it('Firestore Timestamp (toDate), {seconds} and serialized {_seconds}', () => {
    const ms = Date.UTC(2026, 0, 1);
    expect(planExpiresMs({ toDate: () => new Date(ms) })).toBe(ms);
    expect(planExpiresMs({ seconds: ms / 1000 })).toBe(ms);
    expect(planExpiresMs({ _seconds: ms / 1000 })).toBe(ms);
  });
  it('ISO string parses; junk and empty return null', () => {
    expect(planExpiresMs('2026-01-01T00:00:00.000Z')).toBe(Date.UTC(2026, 0, 1));
    expect(planExpiresMs('junk')).toBe(null);
    expect(planExpiresMs(null)).toBe(null);
  });
});

describe('computeTradeFields — the canonical trade P&L (journal + auto-close)', () => {
  it('simple long close: gross pnl, net after fees, result classified off NET', () => {
    const r = computeTradeFields({ direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 2, fees: 5, status: 'closed' });
    expect(r.pnl).toBe(20);      // (110-100) * 2
    expect(r.netPnl).toBe(15);   // 20 - 5 fees
    expect(r.result).toBe('win');
  });
  it('fees flip a thin gross win into a net loss', () => {
    const r = computeTradeFields({ direction: 'long', entryPrice: 100, exitPrice: 101, quantity: 1, fees: 3, status: 'closed' });
    expect(r.pnl).toBe(1);
    expect(r.netPnl).toBe(-2);
    expect(r.result).toBe('loss');
  });
  it('partial exits: P&L summed across exits, not the full size at one price', () => {
    const r = computeTradeFields({
      direction: 'long', entryPrice: 100, quantity: 2, fees: 0, status: 'closed',
      exits: [{ price: 110, percent: 50 }, { price: 90, percent: 50 }],
    });
    expect(r.pnl).toBe(0);       // 1u @ +10  +  1u @ -10
    expect(r.result).toBe('breakeven');
  });
  it('short: profit when price falls', () => {
    const r = computeTradeFields({ direction: 'short', entryPrice: 100, exitPrice: 90, quantity: 1, status: 'closed' });
    expect(r.pnl).toBe(10);
    expect(r.result).toBe('win');
  });
  it('exchange-imported trade keeps the settled pnlFromExchange (even negative)', () => {
    const r = computeTradeFields({ direction: 'long', entryPrice: 100, exitPrice: 105, quantity: 1, pnlFromExchange: -3.2, fees: 0, status: 'closed' });
    expect(r.pnl).toBe(-3.2);
    expect(r.netPnl).toBe(-3.2);
    expect(r.result).toBe('loss');
  });
});
