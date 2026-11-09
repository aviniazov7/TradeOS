import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_CONNECT_ERRORS,
  connectClientError,
  exchangeConnectBody,
  exchangeConnectMessage,
} from './exchangeConnectErrors';

const SECRET = 'bybit-test-secret-QRSTUVWXYZ012345';
const KEY = 'MEXCTESTKEYABCDEFGHIJKLMNOP';

describe('exchange connect errors', () => {
  it('has a Hebrew action for every reason', () => {
    const codes = [
      'key_not_readonly',
      'key_invalid',
      'ip_blocked',
      'no_permission',
      'key_expired',
      'permission_check_failed',
      'provider_unavailable',
      'service_unavailable',
      'rate_limited',
      'free_limit',
      'missing_fields',
      'unauthorized',
      'unsupported',
    ];
    expect(Object.keys(EXCHANGE_CONNECT_ERRORS).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      const message = exchangeConnectMessage(code);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/[A-Za-z0-9+/=_-]{24,}/);
      const { status, body } = exchangeConnectBody(code);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body).toEqual({ error: message, code });
      expect(JSON.stringify(body)).not.toContain(SECRET);
      expect(JSON.stringify(body)).not.toContain(KEY);
    }
  });

  it('says the key must be read-only and names the extra permissions', () => {
    expect(exchangeConnectMessage('key_not_readonly')).toBe(
      'המפתח חייב להיות Read-Only בלבד. בטל הרשאות Trade, Transfer ו-Convert, וצור מפתח חדש.',
    );
  });

  it('says the hourly attempt limit in the rate-limit message', () => {
    const { status, body } = exchangeConnectBody('rate_limited');
    expect(status).toBe(429);
    expect(body.error).toBe('הגעת למגבלת 5 ניסיונות לשעה. נסה שוב מאוחר יותר.');
  });

  it('says a free account can connect one exchange', () => {
    expect(exchangeConnectMessage('free_limit')).toContain('בורסה אחת');
  });

  it('shows the fixed sentence and drops a secret that arrived in the payload', () => {
    const failure = connectClientError({
      code: 'ip_blocked',
      error: `blocked ${KEY}`,
      apiSecret: SECRET,
    });
    expect(failure).toEqual({
      code: 'ip_blocked',
      message: exchangeConnectMessage('ip_blocked'),
    });
    expect(JSON.stringify(failure)).not.toContain(KEY);
    expect(JSON.stringify(failure)).not.toContain(SECRET);
  });

  it('hides an unknown payload that looks like a key', () => {
    const failure = connectClientError({ error: KEY, apiSecret: SECRET });
    expect(failure.code).toBe('provider_unavailable');
    expect(failure.message).not.toContain(KEY);
  });

  it('keeps a short message from an older response', () => {
    const failure = connectClientError({ error: 'שמירת המפתחות נכשלה' });
    expect(failure).toEqual({ code: '', message: 'שמירת המפתחות נכשלה' });
  });

  it('maps an unknown code to the provider message', () => {
    expect(exchangeConnectBody('retMsg').body.code).toBe('provider_unavailable');
  });
});
