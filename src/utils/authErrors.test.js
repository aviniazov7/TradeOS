import { describe, it, expect } from 'vitest';
import { authErrorMessage, isSilentAuthError } from './authErrors';

describe('authErrorMessage', () => {
  it('maps every wrong-credentials code to one message', () => {
    for (const code of ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found', 'auth/wrong-password']) {
      expect(authErrorMessage({ code })).toBe('אימייל או סיסמה שגויים');
    }
  });

  it('tells a signup hit by a network error that the account may exist', () => {
    expect(authErrorMessage({ code: 'auth/network-request-failed' }, 'register')).toMatch(/ייתכן שהחשבון נוצר/);
    expect(authErrorMessage({ code: 'auth/network-request-failed' }, 'login')).toMatch(/בעיית רשת/);
  });

  it('explains common signup problems', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' }, 'register')).toMatch(/כבר רשום/);
    expect(authErrorMessage({ code: 'auth/too-many-requests' })).toMatch(/יותר מדי ניסיונות/);
    expect(authErrorMessage({ code: 'auth/invalid-email' }, 'register')).toBe('כתובת אימייל לא תקינה');
    expect(authErrorMessage({ code: 'auth/password-does-not-meet-requirements' }, 'register')).toMatch(/8 תווים/);
  });

  it('falls back per mode for unknown errors', () => {
    expect(authErrorMessage({ code: 'auth/something-new' }, 'login')).toBe('ההתחברות נכשלה. נסה שוב');
    expect(authErrorMessage(new Error('x'), 'register')).toBe('ההרשמה נכשלה. נסה שוב');
    expect(authErrorMessage(undefined)).toBe('ההתחברות נכשלה. נסה שוב');
  });
});

describe('isSilentAuthError', () => {
  it('is true only when the user closed the Google popup', () => {
    expect(isSilentAuthError({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isSilentAuthError({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isSilentAuthError(null)).toBe(false);
  });
});
