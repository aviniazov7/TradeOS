import { describe, it, expect } from 'vitest';
import { authErrorHe } from './authErrors';

// Without this the user sees "Firebase: Error (auth/invalid-credential)".

describe('authErrorHe', () => {
  it('translates a known code to Hebrew', () => {
    expect(authErrorHe({ code: 'auth/invalid-email' })).toBe('כתובת אימייל לא תקינה');
    expect(authErrorHe({ code: 'auth/too-many-requests' })).toBe('יותר מדי ניסיונות — נסה שוב מאוחר יותר');
  });

  it('gives the SAME message for every wrong-credential variant', () => {
    // Telling an attacker whether the address exists is an enumeration oracle.
    const same = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential']
      .map((code) => authErrorHe({ code }));
    expect(new Set(same).size).toBe(1);
    expect(same[0]).toBe('אימייל או סיסמה שגויים');
  });

  it('never leaks a raw code for something unmapped', () => {
    const msg = authErrorHe({ code: 'auth/some-new-code' });
    expect(msg).toBe('שגיאה בהתחברות');
    expect(msg).not.toContain('auth/');
  });

  it('honours a caller-supplied fallback', () => {
    expect(authErrorHe({ code: 'auth/unknown' }, 'שגיאה בהרשמה')).toBe('שגיאה בהרשמה');
  });

  it('survives an error object with no code at all', () => {
    expect(authErrorHe(null)).toBe('שגיאה בהתחברות');
    expect(authErrorHe({})).toBe('שגיאה בהתחברות');
    expect(authErrorHe(new Error('boom'))).toBe('שגיאה בהתחברות');
  });
});
