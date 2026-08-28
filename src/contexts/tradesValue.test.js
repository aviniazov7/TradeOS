import { describe, it, expect } from 'vitest';
import { tradesValue, backoffMs, RETRY_MS, RETRY_MAX_MS } from './tradesValue';

// The bug this pins: the listener's error path could not clear `loading`.
// EMPTY carries uid:null, so the handler's `prev.uid === uid` guard never
// matched before the first snapshot — and even if it had, the memo returned
// AWAITING because the stamp still did not match the user. Dashboard and
// Journal render a full-page skeleton on that flag, so a permission-denied
// left the app spinning forever while re-subscribing every five seconds.

const user = { uid: 'u1' };
const EMPTY = { uid: null, allTrades: [], loading: true };

describe('tradesValue', () => {
  it('signed out is not loading', () => {
    expect(tradesValue(null, EMPTY, null)).toEqual({ allTrades: [], loading: false, error: null });
  });

  it('waits while the snapshot belongs to nobody yet', () => {
    expect(tradesValue(user, EMPTY, null).loading).toBe(true);
  });

  it('serves trades once the snapshot is stamped with THIS user', () => {
    const snap = { uid: 'u1', allTrades: [{ id: 't' }], loading: false };
    expect(tradesValue(user, snap, null)).toEqual({ allTrades: [{ id: 't' }], loading: false, error: null });
  });

  it('an error before any data STOPS loading and reports the code', () => {
    // The whole point. Previously this returned loading:true, forever.
    const v = tradesValue(user, EMPTY, { uid: 'u1', code: 'permission-denied' });
    expect(v.loading).toBe(false);
    expect(v.error).toBe('permission-denied');
  });

  it('never serves another account trades, or another account error', () => {
    const other = { uid: 'u2', allTrades: [{ id: 'theirs' }], loading: false };
    expect(tradesValue(user, other, null)).toEqual({ allTrades: [], loading: true, error: null });
    // A late error from the previous session must not surface here either.
    expect(tradesValue(user, EMPTY, { uid: 'u2', code: 'permission-denied' }).error).toBe(null);
  });

  it('good data wins over a stale failure for the same user', () => {
    // The success handler clears the failure, but ordering is not guaranteed;
    // a snapshot that IS stamped for this user must never render the error.
    const snap = { uid: 'u1', allTrades: [{ id: 't' }], loading: false };
    expect(tradesValue(user, snap, { uid: 'u1', code: 'unavailable' }).error).toBe(null);
  });
});

describe('backoffMs', () => {
  it('starts at the base delay and doubles', () => {
    expect(backoffMs(0)).toBe(RETRY_MS);
    expect(backoffMs(1)).toBe(RETRY_MS * 2);
    expect(backoffMs(2)).toBe(RETRY_MS * 4);
  });
  it('caps, so a permission-denied that never heals does not retry forever at speed', () => {
    expect(backoffMs(50)).toBe(RETRY_MAX_MS);
    expect(backoffMs(1e6)).toBe(RETRY_MAX_MS);
  });
});
