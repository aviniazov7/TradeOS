import { describe, expect, it } from 'vitest';
import { entryHasPlaintextSecret, markerWithoutSecrets, migratePlaintextExchangeKeys } from './exchangeCredentialMigration';

describe('plaintext exchange migration', () => {
  it('drops secret fields from a marker', () => {
    expect(entryHasPlaintextSecret({ apiKey: 'k', apiSecret: 's', connected: true })).toBe(true);
    expect(markerWithoutSecrets({
      apiKey: 'k', apiSecret: 's', passphrase: 'p', connected: true, connectedAt: 5, address: '0xabc',
    })).toEqual({ connected: true, connectedAt: 5, address: '0xabc' });
  });

  it('stores secrets in KV and rewrites Firestore without them', async () => {
    const writes = [];
    const stored = [];
    const result = await migratePlaintextExchangeKeys('u1', {
      getSetting: async () => ({
        bybit: { apiKey: 'k', apiSecret: 's', connected: true, connectedAt: 9 },
        hyperliquid: { connected: true, address: '0xabc' },
      }),
      setSetting: async (_uid, _id, data) => { writes.push(data); },
      storeCredentials: async (id, creds) => { stored.push({ id, creds }); return { readOnly: true }; },
    });
    expect(result.migrated).toBe(true);
    expect(stored).toEqual([{ id: 'bybit', creds: { apiKey: 'k', apiSecret: 's', passphrase: undefined } }]);
    expect(writes).toEqual([{
      bybit: { connected: true, connectedAt: 9, readOnlyVerified: true },
      hyperliquid: { connected: true, address: '0xabc' },
    }]);
    expect(JSON.stringify(writes)).not.toMatch(/apiKey|apiSecret/);
  });

  it('does not rewrite Firestore when the encrypted store fails', async () => {
    let wrote = false;
    const result = await migratePlaintextExchangeKeys('u1', {
      getSetting: async () => ({ mexc: { apiKey: 'k', apiSecret: 's', connected: true } }),
      setSetting: async () => { wrote = true; },
      storeCredentials: async () => { throw new Error('down'); },
    });
    expect(result.migrated).toBe(false);
    expect(wrote).toBe(false);
  });

  it('drops a trade-capable key instead of storing it', async () => {
    const writes = [];
    const result = await migratePlaintextExchangeKeys('u1', {
      getSetting: async () => ({
        okx: { apiKey: 'k', apiSecret: 's', passphrase: 'p', connected: true },
        bybit: { connected: true, readOnlyVerified: true },
      }),
      setSetting: async (_uid, _id, data) => { writes.push(data); },
      storeCredentials: async () => {
        const err = new Error('trade');
        err.code = 'key_not_readonly';
        throw err;
      },
    });
    expect(result).toMatchObject({ migrated: true, droppedTradeKeys: true });
    expect(writes[0].okx).toBeUndefined();
    expect(writes[0].bybit).toEqual({ connected: true, readOnlyVerified: true });
  });
});
