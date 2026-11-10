import { describe, expect, it } from 'vitest';
import { inspectApiTradePatch, prepareApiTrade } from './tradeValidation';

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
    expect(out.trade.custom).toBeUndefined();
    expect(inspectApiTradePatch({ pnl: 1 }).ok).toBe(false);
  });

  it('accepts custom answers that match the defined fields and rejects the rest', () => {
    const customFields = [
      { id: 'f1', name: 'סשן', type: 'select', options: ['לונדון', 'ניו יורק'] },
      { id: 'f2', name: 'ציון', type: 'number' },
    ];
    const rejected = prepareApiTrade({ ...base, custom: { f1: 'secret' } });
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/custom\.f1/);
    expect(prepareApiTrade({ ...base, custom: { f9: 'x' } }, { customFields }).ok).toBe(false);
    expect(prepareApiTrade({ ...base, custom: { f1: 'אסיה' } }, { customFields }).error).toMatch(/options/);
    const out = prepareApiTrade({ ...base, custom: { f1: 'לונדון', f2: '2', extra: true } }, { customFields });
    expect(out.ok).toBe(false);
    const ok = prepareApiTrade({ ...base, custom: { f1: 'לונדון', f2: '2' } }, { customFields });
    expect(ok.ok).toBe(true);
    expect(ok.trade.custom).toEqual({ f1: 'לונדון', f2: 2 });
    expect(prepareApiTrade({ ...base, custom: {} }, { customFields }).trade.custom).toBeNull();
    expect(inspectApiTradePatch({ custom: { f1: 'לונדון' } }).ok).toBe(true);
    const kept = prepareApiTrade(
      { ...base, custom: { f1: 'אסיה', f2: 2 } },
      { customFields, previousCustom: { f1: 'אסיה' }, customSent: true },
    );
    expect(kept.trade.custom).toEqual({ f1: 'אסיה', f2: 2 });
  });

  it('ignores pnlFromExchange from a public API client', () => {
    const out = prepareApiTrade({ ...base, exitPrice: 110, pnlFromExchange: -999 });
    expect(out.ok).toBe(true);
    expect(out.trade.pnlFromExchange).toBeUndefined();
    expect(prepareApiTrade({ ...base, pnlFromExchange: 'nope' }).ok).toBe(true);
  });
});
