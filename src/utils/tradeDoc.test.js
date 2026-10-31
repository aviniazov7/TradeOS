import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateFuturesNotional, computeTradeFields, initialRiskUsd } from './calculations';
import { buildStoredTrade, withDerivedRiskAmount } from './tradeDoc';

const NOW = new Date('2026-04-02T15:00:00.000Z');

describe('buildStoredTrade', () => {
  it('stores the same derived fields the journal computes on save', () => {
    const input = {
      pair: 'BTCUSDT',
      direction: 'long',
      status: 'closed',
      entryPrice: 100,
      exitPrice: 110,
      quantity: 2,
      stopLoss: 90,
      fees: 1,
      leverage: 10,
      riskAmount: 0,
      entryDate: '2026-04-01T10:00:00.000Z',
    };
    const stored = buildStoredTrade(input, { journalId: 'j1', now: NOW });
    const fields = computeTradeFields(input);
    expect(stored).toMatchObject({
      ...fields,
      journalId: 'j1',
      assetClass: 'crypto',
      positionSize: 200,
      margin: 20,
    });
    expect(stored.entryDate).toEqual(new Date(input.entryDate));
    expect(stored.createdAt).toEqual(stored.entryDate);
    expect(stored.updatedAt).toEqual(NOW);
    expect(stored.pnl).toBe(20);
    expect(stored.netPnl).toBe(19);
    expect(stored.result).toBe('win');
  });

  it('stores a crypto-journal gold CFD at the lot point value', () => {
    const stored = buildStoredTrade({
      assetClass: 'crypto',
      pair: 'XAUUSD',
      direction: 'long',
      status: 'closed',
      entryPrice: 2000,
      exitPrice: 2010,
      quantity: 0.1,
      fees: 0,
      leverage: 1,
      contract: { symbol: 'XAUUSD', pointValue: 100, tickSize: 0.01, contracts: 0.1, kind: 'cfd', currency: 'USD' },
    }, { journalId: 'j1', now: NOW });
    expect(stored.pnl).toBe(100);
    expect(stored.netPnl).toBe(100);
    expect(stored.positionSize).toBe(20000);
    expect(stored.result).toBe('win');
  });

  it('binds the hook journal and ignores a journal id on the payload', () => {
    const stored = buildStoredTrade(
      { pair: 'ETHUSDT', direction: 'short', entryPrice: 10, exitPrice: 0, quantity: 1, leverage: 1, journalId: 'other' },
      { journalId: null, now: NOW },
    );
    expect(stored.journalId).toBeNull();
    expect(stored.assetClass).toBe('crypto');
  });

  it('prices futures notional from the contract, not price × quantity / leverage', () => {
    const contract = { symbol: 'ES', pointValue: 50, tickSize: 0.25, contracts: 2 };
    const input = {
      assetClass: 'futures_cme',
      contract,
      direction: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      quantity: 2,
      stopLoss: 4990,
      fees: 0,
      status: 'closed',
    };
    const stored = buildStoredTrade(input, { journalId: 'fut', now: NOW });
    const notional = calculateFuturesNotional(5000, 50, 2);
    expect(stored.positionSize).toBe(notional);
    expect(stored.margin).toBe(notional);
    expect(stored.pnl).toBe(1000);
  });

  it('is what useTrades persists, with Firestore timestamps wrapped by the hook', () => {
    const src = readFileSync(new URL('../hooks/useTrades.js', import.meta.url), 'utf8');
    expect(src).toContain('buildStoredTrade(');
    expect(src).toContain('dateToTimestamp(stored.createdAt)');
    expect(src).toContain('updatedAt: timestamp()');
  });
});

describe('withDerivedRiskAmount', () => {
  it('fills a zero riskAmount from entry, stop and size', () => {
    const stored = buildStoredTrade({
      pair: 'BTCUSDT', direction: 'long', status: 'open',
      entryPrice: 100, exitPrice: 0, quantity: 2, stopLoss: 90, leverage: 5, fees: 0, riskAmount: 0,
    }, { journalId: 'j1', now: NOW });
    expect(initialRiskUsd(stored)).toBe(20);
    expect(stored.riskAmount).toBe(0);
    expect(withDerivedRiskAmount(stored).riskAmount).toBe(20);
  });

  it('keeps a declared risk', () => {
    const stored = { entryPrice: 100, stopLoss: 90, positionSize: 100, quantity: 1, direction: 'long', riskAmount: 7 };
    expect(withDerivedRiskAmount(stored).riskAmount).toBe(7);
  });
});
