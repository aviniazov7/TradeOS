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
  computeTradeFields,
  safePnl,
  isClosedTrade,
  localDayKey,
  calculateWinRate,
  calculateProfitFactor,
  calculateMaxDrawdown,
  winRateOf,
  calculateSortinoRatio,
  initialStopLoss,
  isStopOnRiskSide,
  initialRiskUsd,
  tradeRMultiple,
  tradeRewardRisk,
  signedTradeR,
  tradeNetPercent,
  tradeAccountPercent,
  tradeShownPercent,
  positionUnits,
  calculateAvgRR,
  computeDrawdown,
  calculateMaxStreaks,
  calculateCurrentStreak,
  partialRealizedPnl,
  tradeDurationMs,
  calculateAvgDuration,
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
  it('XAUUSD short 0.1 lot from 4020 to 3991.8 is +$282', () => {
    // (4020 − 3991.8) × $100/oz-point × 0.1 lot. 28.2 is not binary-exact.
    const pnl = calculateFuturesPnL('short', 4020, 3991.8, 100, 0.1);
    expect(Math.round(pnl * 100) / 100).toBe(282);
  });
  it('the same gold move long is −$282', () => {
    const pnl = calculateFuturesPnL('long', 4020, 3991.8, 100, 0.1);
    expect(Math.round(pnl * 100) / 100).toBe(-282);
  });
  it('a crypto-journal XAUUSD lot is not a coin-quantity dollar P&L', () => {
    const fields = computeTradeFields({
      assetClass: 'crypto',
      pair: 'XAUUSD',
      direction: 'long',
      entryPrice: 2000,
      exitPrice: 2010,
      quantity: 0.1,
      fees: 0,
      status: 'closed',
      contract: { symbol: 'XAUUSD', pointValue: 100, contracts: 0.1, kind: 'cfd', currency: 'USD' },
    });
    // 10 points × $100 × 0.1 lot = $100. Coin math would have been $1.
    expect(fields.pnl).toBe(100);
    expect(safePnl({ netPnl: fields.netPnl, contract: { currency: 'USD' } })).toBe(100);
  });
  it('keeps a yen quote out of the dollar total', () => {
    const fields = computeTradeFields({
      assetClass: 'crypto',
      pair: 'USDJPY',
      direction: 'long',
      entryPrice: 150,
      exitPrice: 151,
      quantity: 1,
      fees: 0,
      status: 'closed',
      contract: { symbol: 'USDJPY', pointValue: 100000, contracts: 1, kind: 'cfd', currency: 'JPY' },
    });
    expect(fields.pnl).toBe(100000);
    expect(safePnl({ netPnl: fields.netPnl, contract: { currency: 'JPY' } })).toBe(0);
  });
  it('does not invent dollars for a free-text symbol with no lot spec', () => {
    const fields = computeTradeFields({
      assetClass: 'crypto',
      pair: 'EURUSD.R',
      direction: 'long',
      entryPrice: 1.08,
      exitPrice: 1.09,
      quantity: 1,
      fees: 0,
      status: 'closed',
    });
    expect(fields.netPnl).toBeNull();
    expect(fields.result).toBeNull();
  });
  it('XAGUSD and NAS100 use their lot point values', () => {
    // 0.1 point × $5,000 × 0.01 lot = $5
    expect(Math.round(calculateFuturesPnL('long', 30, 30.1, 5000, 0.01) * 100) / 100).toBe(5);
    // 10 points × $1 × 1 lot
    expect(calculateFuturesPnL('long', 20000, 20010, 1, 1)).toBe(10);
    expect(calculateFuturesPnL('short', 20000, 20010, 1, 0.5)).toBe(-5);
  });
  it('fractional lots flow through a stored CFD trade, including fees', () => {
    const fields = computeTradeFields({
      assetClass: 'futures_cme',
      direction: 'short',
      entryPrice: 4020,
      exitPrice: 3991.8,
      stopLoss: 4030,
      fees: 0.6,
      status: 'closed',
      contract: { symbol: 'XAUUSD', pointValue: 100, tickSize: 0.01, contracts: 0.1 },
    });
    expect(Math.round(fields.pnl * 100) / 100).toBe(282);
    expect(Math.round(fields.netPnl * 100) / 100).toBe(281.4);
    expect(fields.result).toBe('win');
    // Price R ignores fees: 28.2 / 10 = 2.82. Net R uses dollar risk of the
    // fractional lot (10 × $100 × 0.1 = $100) after the $0.60 commission.
    expect(fields.rrRatio).toBeCloseTo(2.82, 2);
    expect(fields.netPnl / (10 * 100 * 0.1)).toBeCloseTo(2.814, 2);
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

describe('winRateOf — the ONE win-rate definition', () => {
  it('wins / (wins + losses); breakevens never enter the denominator', () => {
    expect(winRateOf(2, 1)).toBeCloseTo(66.67, 1);
    expect(winRateOf(0, 0)).toBe(0);
    expect(winRateOf(3, 0)).toBe(100);
  });
});

describe('calculateSortinoRatio — standard downside deviation', () => {
  it('divides squared downside by ALL observations, not just the losers', () => {
    // mean 3.75; downside Σ = 25 + 100 = 125; /4 = 31.25
    expect(calculateSortinoRatio([10, -5, 20, -10])).toBeCloseTo(3.75 / Math.sqrt(31.25), 6);
  });
  it('no losers → Infinity when profitable', () => {
    expect(calculateSortinoRatio([1, 2, 3])).toBe(Infinity);
  });
});

describe('R with a moved stop — measured against the ORIGINAL stop', () => {
  // Long 100, original stop 90, 10 units ($100 risk), stop trailed to 100 (BE).
  const base = {
    direction: 'long', entryPrice: 100, originalStopLoss: 90, stopLoss: 100,
    positionSize: 1000, quantity: 10, status: 'closed', exitPrice: 120,
  };

  it('initialStopLoss prefers originalStopLoss and ignores a breakeven stop', () => {
    expect(initialStopLoss(base)).toBe(90);
    expect(initialStopLoss({ ...base, originalStopLoss: undefined })).toBe(0); // BE stop defines no risk
    expect(initialStopLoss({ ...base, originalStopLoss: undefined, stopLoss: 95 })).toBe(95);
    expect(initialStopLoss({ direction: 'short', entryPrice: 100, originalStopLoss: 110, stopLoss: 98 })).toBe(110);
  });

  it('isStopOnRiskSide', () => {
    expect(isStopOnRiskSide('long', 100, 90)).toBe(true);
    expect(isStopOnRiskSide('long', 100, 100)).toBe(false);
    expect(isStopOnRiskSide('short', 100, 90)).toBe(false);
    expect(isStopOnRiskSide('short', 100, 110)).toBe(true);
  });

  it('a stop at breakeven does not make the trade "no stop": R = net / initial risk $', () => {
    expect(initialRiskUsd(base)).toBe(100);
    expect(tradeRMultiple({ ...base, netPnl: 200 })).toBe(2);
  });

  it('R uses NET P&L — fees are inside the R, sign and magnitude together', () => {
    // Gross +$5 but $10 fees → net −$5 → −0.05R.
    expect(tradeRMultiple({ ...base, exitPrice: 100.5, netPnl: -5 })).toBeCloseTo(-0.05, 9);
  });

  it('falls back to the declared riskAmount when the stop cannot price the risk', () => {
    const legacy = { ...base, originalStopLoss: undefined, riskAmount: 50, netPnl: 100 };
    expect(tradeRMultiple(legacy)).toBe(2);
    expect(tradeRMultiple({ ...legacy, riskAmount: 0 })).toBeNull();
  });

  it('computeTradeFields stores rrRatio against the original stop', () => {
    // Before: risk |100 − 100| = 0 → rrRatio 0 ("no stop").
    expect(computeTradeFields(base).rrRatio).toBe(2);
  });

  it('calculateAvgRR recomputes from the original stop at read time', () => {
    const stale = { ...base, result: 'win', rrRatio: 0, stopLoss: 105 }; // stop trailed into profit
    expect(calculateAvgRR([stale])).toBe(2);
    // Legacy rows without prices keep their stored value.
    expect(calculateAvgRR([{ result: 'win', rrRatio: 1.5 }])).toBe(1.5);
  });

  it('calculateAvgRR and the table R use NET P&L, so fees shrink the R', () => {
    // Gross move 100 → 120 is 2R on a $100 risk, but $20 fees leave net +180 → 1.8R.
    const win = { ...base, result: 'win', pnl: 200, netPnl: 180, fees: 20, rrRatio: 2 };
    expect(signedTradeR(win)).toBeCloseTo(1.8, 9);
    expect(calculateAvgRR([win])).toBeCloseTo(1.8, 9);
    // Gross +10% on $1000 notional, $20 fees → net 180 / 1000 = 18%.
    expect(tradeNetPercent(win)).toBeCloseTo(18, 9);
  });

  it('tradeNetPercent falls back to scaling the stored percent when size is missing', () => {
    const t = { pnl: 10, netPnl: 8, pnlPercent: 10, fees: 2 };
    expect(tradeNetPercent(t)).toBeCloseTo(8, 9);
  });

  it('tradeAccountPercent is net P&L over the journal balance', () => {
    const gold = {
      direction: 'short', entryPrice: 4019.2, exitPrice: 3991.8, netPnl: 27.4,
      assetClass: 'futures_cme', positionSize: 4019.2,
      contract: { symbol: 'XAUUSD', pointValue: 100, contracts: 0.01 },
    };
    expect(tradeAccountPercent(gold, 369.57)).toBeCloseTo((27.4 / 369.57) * 100, 6);
    expect(tradeAccountPercent(gold, 0)).toBeNull();
    expect(tradeAccountPercent(gold, null)).toBeNull();
    expect(tradeAccountPercent(gold, -10)).toBeNull();
    // MEXC reports ~1e-8 after a full withdrawal. That must not be a denominator:
    // -11.2239 / 1e-8 * 100 is the -112,239,000,000% the journal was showing.
    expect(tradeAccountPercent({ netPnl: -11.2239 }, 1e-8)).toBeNull();
    expect((-11.2239 / 1e-8) * 100).toBeCloseTo(-112239000000, 0);
    expect(tradeAccountPercent(gold, 0.009)).toBeNull();
    expect(tradeAccountPercent(gold, 0.01)).toBeCloseTo((27.4 / 0.01) * 100, 4);
  });

  it('tradeShownPercent prefers the account and falls back to the position', () => {
    const win = { ...base, result: 'win', pnl: 200, netPnl: 180, fees: 20, rrRatio: 2 };
    expect(tradeShownPercent(win, 1000)).toEqual({ percent: 18, onAccount: true });
    expect(tradeShownPercent(win, 0).onAccount).toBe(false);
    expect(tradeShownPercent(win, 0).percent).toBeCloseTo(18, 9);
    expect(tradeShownPercent(win, 500, { net: 25, positionPercent: 40 })).toEqual({ percent: 5, onAccount: true });
    expect(tradeShownPercent(win, 0, { net: 25, positionPercent: 40 })).toEqual({ percent: 40, onAccount: false });
    expect(tradeShownPercent(win, 0, { net: 25, positionPercent: null })).toEqual({ percent: null, onAccount: false });
    expect(tradeShownPercent(win, 1e-8)).toEqual({ percent: null, onAccount: true });
    expect(tradeShownPercent(win, -4)).toEqual({ percent: null, onAccount: true });
    expect(tradeShownPercent(win, 0, { strictAccount: true })).toEqual({ percent: null, onAccount: true });
    expect(tradeShownPercent(win, 1e-8, { net: 25, positionPercent: 40 })).toEqual({ percent: null, onAccount: true });
  });

  it('CFD risk is |entry − stop| × lots × point value, not the saved riskAmount', () => {
    const gold = {
      direction: 'short', entryPrice: 4019.2, stopLoss: 4021.94, riskAmount: 0,
      assetClass: 'futures_cme', positionSize: 4019.2 * 100 * 0.01,
      contract: { symbol: 'XAUUSD', pointValue: 100, contracts: 0.01 },
    };
    expect(initialRiskUsd(gold)).toBeCloseTo(2.74, 2);
    expect(tradeRMultiple({ ...gold, netPnl: 27.4 })).toBeCloseTo(10, 2);
  });

  it('tradeRewardRisk uses the weighted exit of partial exits', () => {
    const t = { ...base, exitPrice: 130, exits: [{ price: 110, percent: 50 }, { price: 130, percent: 50 }] };
    expect(tradeRewardRisk(t)).toBe(2); // weighted exit 120
  });

  it('positionUnits: notional / entry, futures via the contract spec', () => {
    expect(positionUnits({ entryPrice: 100, positionSize: 1000 })).toBe(10);
    expect(positionUnits({ entryPrice: 5000, assetClass: 'futures_cme', contract: { pointValue: 50, contracts: 2 } })).toBe(100);
    expect(positionUnits({ quantity: 3 })).toBe(3);
  });
});

describe('computeDrawdown — no fake percentages without capital', () => {
  it('with no starting balance: dollar drawdown only, percent is null', () => {
    // +10 then −9 used to read as a 90% drawdown.
    const dd = computeDrawdown([10, -9], 0);
    expect(dd.maxDrawdownAbs).toBe(9);
    expect(dd.maxDrawdownPct).toBeNull();
  });
  it('with capital: percent against the real peak', () => {
    const dd = computeDrawdown([10, -9], 1000);
    expect(dd.maxDrawdownAbs).toBe(9);
    expect(dd.maxDrawdownPct).toBeCloseTo((9 / 1010) * 100, 9);
    expect(dd.curve).toEqual([1010, 1001]);
  });
  it('empty sequence', () => {
    expect(computeDrawdown([], 1000)).toEqual({ curve: [], maxDrawdownAbs: 0, maxDrawdownPct: 0 });
  });
});

describe('streaks — a breakeven neither extends nor breaks a run', () => {
  const seq = ['win', 'breakeven', 'win', 'loss', 'breakeven', 'loss', 'loss'].map((result) => ({ result }));
  it('max streaks skip breakevens', () => {
    expect(calculateMaxStreaks(seq)).toEqual({ maxWin: 2, maxLoss: 3 });
  });
  it('current streak uses the same rule', () => {
    expect(calculateCurrentStreak(seq)).toEqual({ type: 'loss', count: 3 });
  });
});

describe('partialRealizedPnl — realized legs of an open partial', () => {
  it('manual partial: the stored net P&L of the executed exits', () => {
    expect(partialRealizedPnl({ status: 'partial', exits: [{ price: 110, percent: 50 }], netPnl: 50 })).toBe(50);
  });
  it('ignores closed/open rows, partials without exits and exchange-sourced rows', () => {
    expect(partialRealizedPnl({ status: 'closed', netPnl: 50 })).toBe(0);
    expect(partialRealizedPnl({ status: 'partial', exits: [], netPnl: 50 })).toBe(0);
    expect(partialRealizedPnl({ status: 'partial', exits: [{ price: 1, percent: 50 }], netPnl: 50, pnlFromExchange: 80 })).toBe(0);
    expect(partialRealizedPnl({ status: 'partial', exits: [{ price: 1, percent: 50 }], netPnl: 50, externalId: 'x' })).toBe(0);
  });
  it('isClosedTrade still excludes partials (not redefined globally)', () => {
    expect(isClosedTrade({ status: 'partial', exitPrice: 110 })).toBe(false);
  });
});

describe('trade duration — zero-length imports do not halve the average', () => {
  const entry = new Date('2026-01-01T10:00:00Z');
  const exit = new Date('2026-01-01T10:53:00Z');
  it('ignores an exit that is not after the entry', () => {
    expect(tradeDurationMs({ entryDate: entry, exitDate: entry })).toBeNull();
    expect(tradeDurationMs({ entryDate: entry })).toBeNull();
  });
  it('averages only trades that were actually open', () => {
    const real = { entryDate: entry, exitDate: exit };
    const zero = { entryDate: entry, exitDate: entry };
    expect(calculateAvgDuration([zero, real])).toBe(53 * 60 * 1000);
    expect(calculateAvgDuration([zero])).toBe(0);
  });
});
