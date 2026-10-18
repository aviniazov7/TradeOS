import { describe, expect, it } from 'vitest';
import {
  classifyBinanceRestrictions,
  classifyBitgetAuthorities,
  classifyBitgetV3,
  classifyBybitKey,
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

  it('does not pretend MEXC was verified', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { json: async () => ({}) }; };
    await expect(verifyExchangeKeyReadOnly('mexc', creds, fetchImpl)).resolves.toEqual({ verified: false, supported: false });
    expect(called).toBe(false);
  });

  it('rejects a Binance key with withdrawals enabled', async () => {
    const fetchImpl = fetchJson({ enableReading: true, enableWithdrawals: true });
    await expect(verifyExchangeKeyReadOnly('binance', creds, fetchImpl)).rejects.toMatchObject({ code: 'key_not_readonly' });
  });
});
