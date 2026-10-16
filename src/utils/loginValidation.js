import { passwordProblem } from './passwordPolicy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Hebrew reason the login/signup form cannot submit, or null.
 * Replaces the browser's native English "please fill out this field" tooltip.
 */
export function loginFieldError({ email, password, mode = 'login' } = {}) {
  const e = String(email || '').trim();
  if (!e) return 'נא להזין אימייל';
  if (!EMAIL_RE.test(e)) return 'האימייל לא תקין';
  if (!password) return 'נא להזין סיסמה';
  if (mode === 'register') return passwordProblem(password);
  return null;
}
