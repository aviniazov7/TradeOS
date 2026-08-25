import { describe, it, expect } from 'vitest';
import { planExpiresMs } from './premium';

// The Premium gate reads this. Returning NaN here does not fail loudly — it
// quietly locks a paying customer out of what they bought.

describe('planExpiresMs', () => {
  const ms = Date.UTC(2026, 5, 1, 12);

  it('reads every shape planExpires arrives in', () => {
    // A coupon grant writes timestampValue and the SDK hydrates a Timestamp;
    // `new Date(<Timestamp>)` is Invalid Date, which is what broke the gate.
    expect(planExpiresMs({ toDate: () => new Date(ms) })).toBe(ms);
    expect(planExpiresMs({ seconds: ms / 1000, nanoseconds: 0 })).toBe(ms);
    expect(planExpiresMs({ _seconds: ms / 1000 })).toBe(ms);   // serialized
    expect(planExpiresMs(new Date(ms).toISOString())).toBe(ms); // worker REST
    expect(planExpiresMs(new Date(ms))).toBe(ms);
    expect(planExpiresMs(ms)).toBe(ms);
  });

  it('returns null — never NaN — when there is nothing usable', () => {
    // NaN would make every comparison false and read as "expired".
    for (const v of [null, undefined, '', 'not a date', {}]) {
      expect(planExpiresMs(v)).toBe(null);
    }
  });

  it('a lifetime plan (no expiry) is null, not zero', () => {
    // Zero is the epoch, i.e. long expired — the opposite of lifetime.
    expect(planExpiresMs(undefined)).not.toBe(0);
  });
});
