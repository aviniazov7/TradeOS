import { describe, it, expect } from 'vitest';
import {
  displayNameProblem,
  canConfirmAccountDeletion,
  emailReauthMissingPassword,
  accountDeletionErrorText,
  DISPLAY_NAME_MAX,
} from './profileAccount';

describe('displayNameProblem', () => {
  it('rejects an empty name and a name past 50 characters', () => {
    expect(displayNameProblem('   ')).toMatch(/שם תצוגה/);
    expect(displayNameProblem('א'.repeat(DISPLAY_NAME_MAX + 1))).toMatch(/50/);
    expect(displayNameProblem('  אבי  ')).toBeNull();
  });
});

describe('account deletion confirmation', () => {
  it('requires a password for email users and the typed word for Google users', () => {
    expect(canConfirmAccountDeletion({ isEmailUser: true, password: '' })).toBe(false);
    expect(canConfirmAccountDeletion({ isEmailUser: true, password: 'secret' })).toBe(true);
    expect(canConfirmAccountDeletion({ isEmailUser: false, confirmText: 'מחק ' })).toBe(true);
    expect(canConfirmAccountDeletion({ isEmailUser: false, confirmText: 'delete' })).toBe(false);
  });

  it('blocks an email wipe when the password is missing', () => {
    const emailUser = { providerData: [{ providerId: 'password' }] };
    const googleUser = { providerData: [{ providerId: 'google.com' }] };
    expect(emailReauthMissingPassword(emailUser, '')).toBe(true);
    expect(emailReauthMissingPassword(emailUser, 'secret')).toBe(false);
    expect(emailReauthMissingPassword(googleUser, '')).toBe(false);
  });

  it('always returns a message, including requires-recent-login', () => {
    expect(accountDeletionErrorText({ code: 'auth/requires-recent-login' })).toMatch(/לאמת/);
    expect(accountDeletionErrorText({ code: 'auth/wrong-password' })).toBe('סיסמה שגויה');
    expect(accountDeletionErrorText({ code: 'auth/popup-blocked' })).toMatch(/חסם/);
    expect(accountDeletionErrorText({ message: 'מחיקת הנתונים נכשלה — נסה שוב' })).toMatch(/נכשלה/);
    expect(accountDeletionErrorText({ code: 'auth/internal-error' })).toBe('שגיאה במחיקת החשבון');
    expect(accountDeletionErrorText(null)).toBe('שגיאה במחיקת החשבון');
  });
});
