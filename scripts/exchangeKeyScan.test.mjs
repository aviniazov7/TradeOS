import { describe, it, expect } from 'vitest';
import { plaintextExchanges, summarize } from './exchangeKeyScan.mjs';

describe('plaintextExchanges', () => {
  it('finds exchanges that still hold a key and a secret', () => {
    expect(plaintextExchanges({
      bybit: { apiKey: 'k', apiSecret: 's' },
      mexc: { connected: true, connectedAt: 1 },
      binance: { apiKey: 'k', apiSecret: '' },
      okx: { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
    })).toEqual(['bybit', 'okx']);
  });

  it('ignores markers-only, empty and malformed documents', () => {
    expect(plaintextExchanges(null)).toEqual([]);
    expect(plaintextExchanges({})).toEqual([]);
    expect(plaintextExchanges({ hyperliquid: { address: '0xabc' }, x: 'str', y: null })).toEqual([]);
    expect(plaintextExchanges({ bybit: { apiKey: '  ', apiSecret: 's' } })).toEqual([]);
  });

  it('never exposes the values', () => {
    const out = JSON.stringify(plaintextExchanges({ bybit: { apiKey: 'SECRET-KEY', apiSecret: 'SECRET-VAL' } }));
    expect(out).not.toMatch(/SECRET/);
  });
});

describe('summarize', () => {
  it('counts users, docs, plaintext users and exchanges', () => {
    expect(summarize([null, [], ['bybit'], ['bybit', 'mexc'], null])).toEqual({
      users: 5,
      withExchangesDoc: 3,
      withPlaintextKeys: 2,
      byExchange: { bybit: 2, mexc: 1 },
    });
  });
});
