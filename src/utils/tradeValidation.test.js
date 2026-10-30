import { describe, expect, it } from 'vitest';
import { prepareApiTrade } from './tradeValidation';

const base = {
  journalId: 'journal-1',
  pair: 'BTCUSDT',
  direction: 'long',
  entryPrice: 100,
  quantity: 1,
  stopLoss: 90,
};

describe('prepareApiTrade', () => {
  it('accepts a crypto trade and defaults the fields the rules require', () => {
    const out = prepareApiTrade(base);
    expect(out.ok).toBe(true);
    expect(out.trade).toMatchObject({
      journalId: 'journal-1',
      fees: 0,
      leverage: 1,
      status: 'open',
      assetClass: 'crypto',
      source: 'manual',
      originalStopLoss: 90,
      exitPrice: 0,
    });
  });

  it('rejects the shapes firestore.rules would reject', () => {
    expect(prepareApiTrade({ ...base, journalId: '' }).error).toMatch(/journalId/);
    expect(prepareApiTrade({ ...base, entryPrice: 0 }).error).toMatch(/entryPrice/);
    expect(prepareApiTrade({ ...base, quantity: -1 }).error).toMatch(/quantity/);
    expect(prepareApiTrade({ ...base, stopLoss: -1 }).error).toMatch(/stopLoss/);
    expect(prepareApiTrade({ ...base, fees: -1 }).error).toMatch(/fees/);
    expect(prepareApiTrade({ ...base, direction: 'up' }).error).toMatch(/direction/);
    expect(prepareApiTrade({ ...base, pair: '' }).error).toMatch(/pair/);
    expect(prepareApiTrade({ ...base, pair: 'X'.repeat(31) }).error).toMatch(/pair/);
    expect(prepareApiTrade({ ...base, leverage: 201 }).error).toMatch(/leverage/);
    expect(prepareApiTrade({ ...base, leverage: 0 }).error).toMatch(/leverage/);
    expect(prepareApiTrade({ ...base, status: 'cancelled' }).error).toMatch(/status/);
    expect(prepareApiTrade({
      ...base,
      assetClass: 'futures_cme',
      contract: { contracts: 1, pointValue: 0, tickSize: 0.25 },
    }).error).toMatch(/contract/);
    expect(prepareApiTrade({
      ...base,
      tradingViewUrls: ['http://tradingview.com/chart'],
    }).error).toMatch(/tradingview/i);
  });

  it('coerces numeric strings and closes a trade that has an exit', () => {
    const out = prepareApiTrade({ ...base, entryPrice: '100', quantity: '2', exitPrice: 110, fees: '0.5' });
    expect(out.ok).toBe(true);
    expect(out.trade.entryPrice).toBe(100);
    expect(out.trade.quantity).toBe(2);
    expect(out.trade.fees).toBe(0.5);
    expect(out.trade.status).toBe('closed');
  });

  it('drops unknown fields so callers cannot set derived pnl', () => {
    const out = prepareApiTrade({ ...base, pnl: 9999, netPnl: 9999, role: 'admin' });
    expect(out.ok).toBe(true);
    expect(out.trade.pnl).toBeUndefined();
    expect(out.trade.role).toBeUndefined();
  });

  it('ignores pnlFromExchange from a public API client', () => {
    const out = prepareApiTrade({ ...base, exitPrice: 110, pnlFromExchange: -999 });
    expect(out.ok).toBe(true);
    expect(out.trade.pnlFromExchange).toBeUndefined();
    expect(prepareApiTrade({ ...base, pnlFromExchange: 'nope' }).ok).toBe(true);
  });
});
