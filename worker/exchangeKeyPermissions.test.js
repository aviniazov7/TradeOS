import { describe, expect, it } from 'vitest';
import {
  classifyBinanceRestrictions,
  classifyBitgetAuthorities,
  classifyBitgetV3,
  classifyBybitKey,
  classifyMexcKeyInfo,
  classifyOkxPerm,
  verifyExchangeKeyReadOnly,
} from './exchangeKeyPermissions';

const creds = { apiKey: 'k', apiSecret: 's', passphrase: 'p' };

function fetchJson(payload) {
  return async () => ({ json: async () => payload, ok: true });
}

describe('exchange key permission classifiers', () => {
  it('accepts a Bybit read-only key and rejects write or withdraw', () => {
    expect(classifyBybitKey({ readOnly: 1, permissions: { Wallet: [], ContractTrade: ['Order'] } }).ok).toBe(true);
    expect(classifyBybitKey({ readOnly: 0, permissions: {} }).reason).toBe('write');
    expect(classifyBybitKey({ readOnly: 1, permissions: { Wallet: ['Withdraw'] } }).reason).toBe('write');
  });

  it('accepts only an OKX read_only perm', () => {
    expect(classifyOkxPerm('read_only').ok).toBe(true);
    expect(classifyOkxPerm('read_only,trade').reason).toBe('write');
    expect(classifyOkxPerm('read_only,withdraw').reason).toBe('write');
    expect(classifyOkxPerm('').reason).toBe('unknown');
  });

  it('accepts Bitget read codes and rejects write or withdraw', () => {
    expect(classifyBitgetAuthorities(['coor', 'cpor']).ok).toBe(true);
    expect(classifyBitgetAuthorities(['coor', 'coow']).reason).toBe('write');
    expect(classifyBitgetAuthorities(['wwow']).reason).toBe('write');
    expect(classifyBitgetV3({ permType: 'read-only', permissions: [] }).ok).toBe(true);
    expect(classifyBitgetV3({ permType: 'read-and-write', permissions: ['uta_trade'] }).reason).toBe('write');
    expect(classifyBitgetV3({ permType: 'read-only', permissions: ['withdraw'] }).reason).toBe('write');
  });

  it('accepts a Binance read-only key and rejects trading or withdrawals', () => {
    expect(classifyBinanceRestrictions({ enableReading: true, enableFutures: false, enableWithdrawals: false }).ok).toBe(true);
    expect(classifyBinanceRestrictions({ enableReading: true, enableFutures: true }).reason).toBe('write');
    expect(classifyBinanceRestrictions({ enableReading: true, enableWithdrawals: true }).reason).toBe('write');
  });
});

describe('verifyExchangeKeyReadOnly', () => {
  it('rejects a Bybit trade key before it would be stored', async () => {
    const fetchImpl = fetchJson({ retCode: 0, result: { readOnly: 0, permissions: { Wallet: [] } } });
    await expect(verifyExchangeKeyReadOnly('bybit', creds, fetchImpl)).rejects.toMatchObject({ code: 'key_not_readonly' });
  });

  it('accepts a Bybit read-only key', async () => {
    const fetchImpl = fetchJson({ retCode: 0, result: { readOnly: 1, permissions: { Wallet: [], ContractTrade: ['Position'] } } });
    await expect(verifyExchangeKeyReadOnly('bybit', creds, fetchImpl)).resolves.toEqual({ verified: true, supported: true });
  });

  it('rejects an OKX key that can trade', async () => {
    const fetchImpl = fetchJson({ code: '0', data: [{ perm: 'read_only,trade' }] });
    await expect(verifyExchangeKeyReadOnly('okx', creds, fetchImpl)).rejects.toMatchObject({ code: 'key_not_readonly' });
  });

  it('accepts a MEXC key whose permissions are read-only', () => {
    expect(classifyMexcKeyInfo({
      status: 'VALID',
      permissions: 'SPOT_ACCOUNT_READ,CONTRACT_ACCOUNT_READ,CONTRACT_DEAL_READ',
    }).ok).toBe(true);
  });

  it('rejects a MEXC key that can trade or withdraw', () => {
    expect(classifyMexcKeyInfo({ status: 'VALID', permissions: 'SPOT_ACCOUNT_READ,CONTRACT_DEAL_WRITE' }).reason).toBe('write');
    expect(classifyMexcKeyInfo({ status: 'VALID', permissions: 'SPOT_WITHDRAW_WRITE' }).reason).toBe('write');
    expect(classifyMexcKeyInfo({ status: 'VALID', permissions: '' }).reason).toBe('unknown');
  });

  it('asks MEXC for key info and stores nothing it cannot prove', async () => {
    let url = '';
    const fetchImpl = async (u) => {
      url = u;
      return { json: async () => ({ status: 'VALID', permissions: 'SPOT_ACCOUNT_READ,CONTRACT_DEAL_READ' }) };
    };
    await expect(verifyExchangeKeyReadOnly('mexc', creds, fetchImpl)).resolves.toEqual({ verified: true, supported: true });
    expect(url).toContain('https://api.mexc.com/api/v3/apiKeyInfo?');
    expect(url).not.toMatch(/order|withdraw/i);
  });

  it('does not call an unknown exchange', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { json: async () => ({}) }; };
    await expect(verifyExchangeKeyReadOnly('foo', creds, fetchImpl)).resolves.toEqual({ verified: false, supported: false });
    expect(called).toBe(false);
  });

  it('rejects a Binance key with withdrawals enabled', async () => {
    const fetchImpl = fetchJson({ enableReading: true, enableWithdrawals: true });
    await expect(verifyExchangeKeyReadOnly('binance', creds, fetchImpl)).rejects.toMatchObject({ code: 'key_not_readonly' });
  });

  it('tells Bybit failures apart and never echoes the secret', async () => {
    const secret = 'bybit-test-secret-QRSTUVWXYZ012345';
    const cases = [
      [{ retCode: 10010, retMsg: `ip ${secret}` }, 'ip_blocked'],
      [{ retCode: 10003, retMsg: secret }, 'key_invalid'],
      [{ retCode: 10004, retMsg: secret }, 'key_invalid'],
      [{ retCode: 33004, retMsg: secret }, 'key_expired'],
      [{ retCode: 10005, retMsg: secret }, 'no_permission'],
      [{ retCode: 10016, retMsg: `system error ${secret}` }, 'provider_unavailable'],
    ];
    for (const [payload, code] of cases) {
      const err = await verifyExchangeKeyReadOnly('bybit', { ...creds, apiSecret: secret }, fetchJson(payload)).catch((e) => e);
      expect(err).toMatchObject({ code });
      expect(err.message).not.toContain(secret);
      expect(JSON.stringify(err)).not.toContain(secret);
    }
  });

  it('tells MEXC failures apart and never echoes the key', async () => {
    const apiKey = 'MEXCTESTKEYABCDEFGHIJKLMNOP';
    const secret = 'mexc-test-secret-QRSTUVWXYZ012345';
    const cases = [
      [{ code: 406, msg: `whitelist ${apiKey}` }, 'ip_blocked'],
      [{ code: 401, msg: secret }, 'key_invalid'],
      [{ code: 602, msg: secret }, 'key_invalid'],
      [{ code: 402, msg: secret }, 'key_expired'],
    ];
    for (const [payload, code] of cases) {
      const err = await verifyExchangeKeyReadOnly('mexc', { apiKey, apiSecret: secret }, fetchJson(payload)).catch((e) => e);
      expect(err).toMatchObject({ code });
      expect(err.message).not.toContain(apiKey);
      expect(err.message).not.toContain(secret);
    }
  });

  it('maps a network failure to the provider message without the request URL', async () => {
    const apiKey = 'MEXCTESTKEYABCDEFGHIJKLMNOP';
    const fetchImpl = async () => {
      throw new Error(`https://api.mexc.com/api/v3/apiKeyInfo?accessKey=${apiKey}`);
    };
    const err = await verifyExchangeKeyReadOnly('mexc', { apiKey, apiSecret: 's' }, fetchImpl).catch((e) => e);
    expect(err).toMatchObject({ code: 'provider_unavailable' });
    expect(err.message).not.toContain(apiKey);
    expect(err.message).not.toContain('api.mexc.com');
  });

  it('still rejects a MEXC key that can trade', async () => {
    const fetchImpl = fetchJson({ status: 'VALID', permissions: 'SPOT_ACCOUNT_READ,CONTRACT_DEAL_WRITE' });
    const err = await verifyExchangeKeyReadOnly('mexc', creds, fetchImpl).catch((e) => e);
    expect(err).toMatchObject({ code: 'key_not_readonly' });
    expect(err.message).toContain('Read-Only');
    expect(err.message).toContain('Trade');
  });
});
