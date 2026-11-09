// On connect, ask the exchange whether this API key can trade or withdraw.
// Checked venues: Bybit (readOnly flag), OKX (account config `perm`),
// Bitget (authorities / permType), Binance (apiRestrictions), MEXC
// (GET /api/v3/apiKeyInfo — read permissions only). Anything else is
// unsupported and must not be stored. This module never places an order
// and never logs the secret.
//
// MEXC's query requires SPOT_ACCOUNT_READ. A futures-only key cannot prove
// it is read-only, so it is rejected. The connect dialog asks for that
// read permission. No write-shaped probe is sent.

import { classifyExchangeAuthError } from './exchangeNormalize.js';
import { exchangeConnectMessage } from '../src/utils/exchangeConnectErrors.js';

const enc = new TextEncoder();

async function hmac(secret, msg, out = 'hex') {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  if (out === 'base64') {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getJson(fetchImpl, url, headers) {
  const r = await fetchImpl(url, { headers });
  const data = await r.json().catch(() => ({}));
  return data && typeof data === 'object' ? data : {};
}

export class KeyPermissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KeyPermissionError';
    this.code = code;
  }
}

export function classifyBybitKey(result) {
  if (!result || result.readOnly === undefined || result.readOnly === null) return { ok: false, reason: 'unknown' };
  if (Number(result.readOnly) !== 1) return { ok: false, reason: 'write' };
  const wallet = Array.isArray(result.permissions?.Wallet) ? result.permissions.Wallet : [];
  if (wallet.some((p) => /withdraw|transfer/i.test(String(p)))) return { ok: false, reason: 'write' };
  return { ok: true };
}

// `perm` is a comma list: read_only, trade, withdraw. Anything besides
// read_only is a write-capable key.
export function classifyOkxPerm(perm) {
  const parts = String(perm || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, reason: 'unknown' };
  if (parts.some((p) => p !== 'read_only')) return { ok: false, reason: 'write' };
  return { ok: true };
}

// Bitget v2 short codes. The trailing "r" set is read; "w" / wwow is write
// or withdraw. Unknown codes fail closed.
const BITGET_READ = new Set(['coor', 'cpor', 'stor', 'smor', 'ttor', 'wtor', 'taxr', 'chor', 'p2pr', 'pllr']);

export function classifyBitgetAuthorities(authorities) {
  if (!Array.isArray(authorities) || authorities.length === 0) return { ok: false, reason: 'unknown' };
  for (const a of authorities) {
    if (!BITGET_READ.has(String(a).toLowerCase())) return { ok: false, reason: 'write' };
  }
  return { ok: true };
}

export function classifyBitgetV3(data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'unknown' };
  if (data.permType !== 'read-only') return { ok: false, reason: data.permType ? 'write' : 'unknown' };
  const perms = Array.isArray(data.permissions) ? data.permissions : [];
  if (perms.some((p) => /trade|withdraw|mgt|order/i.test(String(p)))) return { ok: false, reason: 'write' };
  return { ok: true };
}

const BINANCE_WRITE_FLAGS = [
  'enableWithdrawals',
  'enableInternalTransfer',
  'permitsUniversalTransfer',
  'enableSpotAndMarginTrading',
  'enableMargin',
  'enableFutures',
  'enableVanillaOptions',
  'enableFixApiTrade',
  'enablePortfolioMarginTrading',
];

export function classifyBinanceRestrictions(data) {
  if (!data || typeof data !== 'object' || data.code) return { ok: false, reason: 'unknown' };
  if (data.enableReading !== true) return { ok: false, reason: 'unknown' };
  if (BINANCE_WRITE_FLAGS.some((k) => data[k] === true)) return { ok: false, reason: 'write' };
  return { ok: true };
}

function judgement(j) {
  if (j.ok) return { verified: true, supported: true };
  if (j.reason === 'write') throw new KeyPermissionError('key_not_readonly', exchangeConnectMessage('key_not_readonly'));
  throw new KeyPermissionError('permission_check_failed', exchangeConnectMessage('permission_check_failed'));
}

// The exchange text is used only to pick a reason. It is not returned or logged.
function rejectUpstream(exchange, code, message) {
  const text = String(message || '');
  const reason = classifyExchangeAuthError(exchange, code, text)
    || (/timeout|temporar|internal server|system error|service unavailable/i.test(text) ? 'provider_unavailable' : 'key_invalid');
  throw new KeyPermissionError(reason, exchangeConnectMessage(reason));
}

const MEXC_READ = new Set([
  'SPOT_ACCOUNT_READ',
  'SPOT_DEAL_READ',
  'CONTRACT_ACCOUNT_READ',
  'CONTRACT_DEAL_READ',
  'SPOT_TRANSFER_READ',
  'SPOT_WITHDRAW_READ',
]);

// Anything outside this set (including SPOT_WITHDRAW_WRITE and every *_WRITE)
// can move funds or place orders. Empty or unknown payloads fail closed.
export function classifyMexcKeyInfo(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.code) return { ok: false, reason: 'unknown' };
  if (data.status != null && String(data.status) !== 'VALID') return { ok: false, reason: 'unknown' };
  const raw = data.permissions;
  const parts = (Array.isArray(raw) ? raw : String(raw || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!parts.length) return { ok: false, reason: 'unknown' };
  if (parts.some((p) => !MEXC_READ.has(p))) return { ok: false, reason: 'write' };
  return { ok: true };
}

export const PERMISSION_CHECKED_EXCHANGES = new Set(['bybit', 'okx', 'bitget', 'binance', 'mexc']);

// Ids the store route will even attempt. Unknown ids are not written to KV.
export const STORABLE_EXCHANGES = PERMISSION_CHECKED_EXCHANGES;

export async function verifyExchangeKeyReadOnly(exchange, creds, fetchImpl = fetch) {
  if (!PERMISSION_CHECKED_EXCHANGES.has(exchange)) return { verified: false, supported: false };
  const { apiKey, apiSecret, passphrase } = creds || {};
  try {
    if (exchange === 'bybit') {
      const ts = Date.now().toString();
      const recvWindow = '5000';
      const sign = await hmac(apiSecret, `${ts}${apiKey}${recvWindow}`);
      const data = await getJson(fetchImpl, 'https://api.bybit.com/v5/user/query-api', {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': ts,
        'X-BAPI-SIGN': sign,
        'X-BAPI-RECV-WINDOW': recvWindow,
      });
      if (data.retCode !== 0) rejectUpstream('bybit', data.retCode, data.retMsg);
      return judgement(classifyBybitKey(data.result));
    }
    if (exchange === 'okx') {
      const path = '/api/v5/account/config';
      const ts = new Date().toISOString();
      const sign = await hmac(apiSecret, `${ts}GET${path}`, 'base64');
      const data = await getJson(fetchImpl, `https://www.okx.com${path}`, {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase || '',
        'Content-Type': 'application/json',
      });
      if (data.code !== '0') rejectUpstream('okx', data.code, data.msg);
      return judgement(classifyOkxPerm(data.data?.[0]?.perm));
    }
    if (exchange === 'bitget') {
      const headersFor = async (path, ts) => ({
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': await hmac(apiSecret, `${ts}GET${path}`, 'base64'),
        'ACCESS-TIMESTAMP': ts,
        'ACCESS-PASSPHRASE': passphrase || '',
        'Content-Type': 'application/json',
        locale: 'en-US',
      });
      const v2 = '/api/v2/spot/account/info';
      const first = await getJson(fetchImpl, `https://api.bitget.com${v2}`, await headersFor(v2, String(Date.now())));
      if (first.code === '00000' && Array.isArray(first.data?.authorities)) {
        return judgement(classifyBitgetAuthorities(first.data.authorities));
      }
      const v3 = '/api/v3/account/info';
      const second = await getJson(fetchImpl, `https://api.bitget.com${v3}`, await headersFor(v3, String(Date.now())));
      if (second.code !== '00000') rejectUpstream('bitget', second.code, second.msg);
      return judgement(classifyBitgetV3(second.data));
    }
    if (exchange === 'mexc') {
      // Spot keys are alphanumeric. Reject anything else before it is placed
      // on a query string. GET only — this is not an order or a withdraw.
      if (!/^[A-Za-z0-9]+$/.test(String(apiKey || ''))) {
        throw new KeyPermissionError('key_invalid', exchangeConnectMessage('key_invalid'));
      }
      const timestamp = Date.now().toString();
      const qs = `accessKey=${apiKey}&recvWindow=5000&timestamp=${timestamp}`;
      const signature = await hmac(apiSecret, qs);
      const data = await getJson(
        fetchImpl,
        `https://api.mexc.com/api/v3/apiKeyInfo?${qs}&signature=${signature}`,
        { 'X-MEXC-APIKEY': apiKey },
      );
      if (data.code || data.msg) rejectUpstream('mexc', data.code, data.msg);
      return judgement(classifyMexcKeyInfo(data));
    }
    if (exchange === 'binance') {
      const qs = `recvWindow=5000&timestamp=${Date.now()}`;
      const sign = await hmac(apiSecret, qs);
      const data = await getJson(
        fetchImpl,
        `https://api.binance.com/sapi/v1/account/apiRestrictions?${qs}&signature=${sign}`,
        { 'X-MBX-APIKEY': apiKey },
      );
      if (data.code && data.msg) rejectUpstream('binance', data.code, data.msg);
      return judgement(classifyBinanceRestrictions(data));
    }
  } catch (err) {
    if (err instanceof KeyPermissionError) throw err;
    throw new KeyPermissionError('provider_unavailable', exchangeConnectMessage('provider_unavailable'));
  }
  return { verified: false, supported: false };
}
