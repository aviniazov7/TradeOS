import { describe, it, expect } from 'vitest';
import { loginFieldError } from './loginValidation';

describe('loginFieldError', () => {
  it('asks for an email and a password in Hebrew', () => {
    expect(loginFieldError({ email: '', password: 'secret', mode: 'login' })).toBe('נא להזין אימייל');
    expect(loginFieldError({ email: 'not-an-email', password: 'secret', mode: 'login' })).toBe('האימייל לא תקין');
    expect(loginFieldError({ email: 'a@b.co', password: '', mode: 'login' })).toBe('נא להזין סיסמה');
  });

  it('accepts a login with any non-empty password', () => {
    expect(loginFieldError({ email: 'a@b.co', password: 'x', mode: 'login' })).toBeNull();
  });

  it('still enforces the signup password rules in Hebrew', () => {
    expect(loginFieldError({ email: 'a@b.co', password: 'short', mode: 'register' })).toBe('הסיסמה חייבת להכיל לפחות 8 תווים');
    expect(loginFieldError({ email: 'a@b.co', password: 'Longpass1', mode: 'register' })).toBeNull();
  });
});
