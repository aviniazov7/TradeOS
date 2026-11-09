// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
// The package's node export replaces both browser persistences with memory.
// The browser build is what Safari loads, including the storage listener.
import {
  browserLocalPersistence,
  browserSessionPersistence,
} from '../../node_modules/@firebase/auth/dist/esm/index.js';
import { clearSharedAuthUsers, SHARED_AUTH_USER_PREFIX } from './authTabIsolation';

const AUTH_USER_KEY = `${SHARED_AUTH_USER_PREFIX}test-key:[DEFAULT]`;
const JOURNAL_KEY = 'tradeos_activeBacktestJournal:user-a';

function userBlob(uid) {
  return { uid };
}

function storageEvent(key, newValue) {
  const EventCtor = window.StorageEvent;
  window.dispatchEvent(new EventCtor('storage', {
    key,
    newValue,
    storageArea: localStorage,
  }));
}

describe('tab auth persistence', () => {
  const locals = [];

  afterEach(() => {
    for (const { persistence, key, listener } of locals) {
      persistence._removeListener(key, listener);
    }
    locals.length = 0;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps this tab on account A when another tab writes account B', async () => {
    const session = new browserSessionPersistence();
    const shared = new browserLocalPersistence();
    expect(session.type).toBe('SESSION');
    expect(shared.type).toBe('LOCAL');
    // Including local persistence in the hierarchy makes Firebase migrate the
    // user back onto the shared store. Session persistence refuses that.
    expect(shared._shouldAllowMigration).toBe(true);
    expect(session._shouldAllowMigration).not.toBe(true);

    const seen = [];
    const listener = (value) => { seen.push(value?.uid ?? null); };
    shared._addListener(AUTH_USER_KEY, listener);
    locals.push({ persistence: shared, key: AUTH_USER_KEY, listener });

    await session._set(AUTH_USER_KEY, userBlob('account-a'));
    expect(await session._get(AUTH_USER_KEY)).toEqual({ uid: 'account-a' });
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toContain('account-a');
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(seen).toEqual([]);

    // Same-tab reload reads sessionStorage again.
    expect(await session._get(AUTH_USER_KEY)).toEqual({ uid: 'account-a' });

    const sharedUser = JSON.stringify(userBlob('account-b'));
    localStorage.setItem(AUTH_USER_KEY, sharedUser);
    storageEvent(AUTH_USER_KEY, sharedUser);

    expect(seen).toEqual(['account-b']);
    expect(await session._get(AUTH_USER_KEY)).toEqual({ uid: 'account-a' });

    // Signing out of this tab does not sign out the other storage.
    await session._remove(AUTH_USER_KEY);
    expect(await session._get(AUTH_USER_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toContain('account-b');
  });

  it('session persistence does not subscribe to other tabs', () => {
    const session = new browserSessionPersistence();
    let calls = 0;
    const listener = () => { calls += 1; };
    session._addListener(AUTH_USER_KEY, listener);
    storageEvent(AUTH_USER_KEY, JSON.stringify(userBlob('account-b')));
    session._removeListener(AUTH_USER_KEY, listener);
    expect(calls).toBe(0);
  });

  it('drops the shared auth user and leaves this tab and journal selection', () => {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userBlob('account-b')));
    localStorage.setItem('firebase:authUser:other:[DEFAULT]', JSON.stringify(userBlob('account-c')));
    localStorage.setItem(JOURNAL_KEY, 'btc-a');
    localStorage.setItem('tradeos_hideBalances', 'true');
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(userBlob('account-a')));

    clearSharedAuthUsers(localStorage);

    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(localStorage.getItem('firebase:authUser:other:[DEFAULT]')).toBeNull();
    expect(localStorage.getItem(JOURNAL_KEY)).toBe('btc-a');
    expect(localStorage.getItem('tradeos_hideBalances')).toBe('true');
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toContain('account-a');
  });

  it('tells an old shared tab to sign out without clearing this tab', () => {
    const shared = new browserLocalPersistence();
    const seen = [];
    const listener = (value) => { seen.push(value?.uid ?? null); };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userBlob('account-b')));
    shared._addListener(AUTH_USER_KEY, listener);
    locals.push({ persistence: shared, key: AUTH_USER_KEY, listener });
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(userBlob('account-a')));

    clearSharedAuthUsers(localStorage);
    storageEvent(AUTH_USER_KEY, null);

    expect(seen).toEqual([null]);
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toContain('account-a');
  });

  it('initializes Auth with session persistence only', () => {
    const src = readFileSync('src/services/firebase.js', 'utf8');
    expect(src).toMatch(/persistence:\s*browserSessionPersistence/);
    expect(src).not.toMatch(/persistence:\s*browserLocalPersistence/);
    expect(src).not.toMatch(/persistence:\s*\[/);
    expect(src).toMatch(/clearSharedAuthUsers\(/);
  });
});
