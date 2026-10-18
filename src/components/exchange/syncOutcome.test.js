import { describe, expect, it } from 'vitest';
import { resolveSyncOutcome } from './syncOutcome';

const rejected = (reason) => ({ status: 'rejected', reason });
const fulfilled = (value) => ({ status: 'fulfilled', value });

describe('resolveSyncOutcome', () => {
  it('surfaces a key error when both calls fail, instead of an empty journal', () => {
    const err = Object.assign(new Error('מפתח ה-API פג תוקף'), { reason: 'key_expired' });
    const out = resolveSyncOutcome(rejected(err), rejected(new Error('boom')));
    expect(out.type).toBe('error');
    expect(out.error).toBe(err);
    expect(out.error.reason).toBe('key_expired');
  });

  it('surfaces the failure when one call fails and the other returns nothing', () => {
    const err = Object.assign(new Error('מפתח ה-API לא תקין או נמחק בבורסה'), { reason: 'key_invalid' });
    const out = resolveSyncOutcome(rejected(err), fulfilled([]));
    expect(out.type).toBe('error');
    expect(out.error.reason).toBe('key_invalid');
  });

  it('keeps an empty result only when both calls succeeded with no rows', () => {
    expect(resolveSyncOutcome(fulfilled([]), fulfilled([]))).toEqual({ type: 'empty' });
  });

  it('returns rows and the partial error when only one call failed', () => {
    const err = Object.assign(new Error('שגיאה'), { reason: 'ip_blocked' });
    const out = resolveSyncOutcome(fulfilled([{ pair: 'BTCUSDT' }]), rejected(err));
    expect(out.type).toBe('ok');
    expect(out.trades).toEqual([{ pair: 'BTCUSDT' }]);
    expect(out.partialError).toBe(err);
  });

  it('tags open positions', () => {
    const out = resolveSyncOutcome(fulfilled([]), fulfilled([{ pair: 'ETHUSDT' }]));
    expect(out.trades[0]).toMatchObject({ pair: 'ETHUSDT', _isOpen: true, pnlFromExchange: null });
  });
});
