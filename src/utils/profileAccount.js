/**
 * Pure checks for the profile screen: display-name edits and account
 * deletion. Firebase calls stay in authService; these only decide what the
 * dialog is allowed to do and which error the user sees.
 */
import { authErrorHe } from './authErrors';

export const DELETE_CONFIRM_WORD = 'מחק';
export const DISPLAY_NAME_MAX = 50;

/** null when the name can be saved. */
export function displayNameProblem(raw) {
  const next = String(raw ?? '').trim();
  if (!next) return 'הזן שם תצוגה';
  if (next.length > DISPLAY_NAME_MAX) return 'השם יכול להכיל עד 50 תווים';
  return null;
}

/**
 * Email users confirm by typing the password (it is also the re-auth
 * credential). Google users type the confirmation word; the popup is the
 * credential. Either way the delete button stays disabled until this is true.
 */
export function canConfirmAccountDeletion({ isEmailUser, password, confirmText } = {}) {
  if (isEmailUser) return String(password || '').length > 0;
  return String(confirmText || '').trim() === DELETE_CONFIRM_WORD;
}

/**
 * An email account with no password must fail BEFORE any Firestore wipe.
 * Skipping re-auth used to erase the data and only then throw
 * auth/requires-recent-login, and the dialog closed on that error.
 */
export function emailReauthMissingPassword(user, password) {
  const isEmail = Array.isArray(user?.providerData)
    && user.providerData.some((p) => p.providerId === 'password');
  return isEmail && !password;
}

/** In-dialog copy. Never empty — a silent failure looked like a no-op. */
export function accountDeletionErrorText(err) {
  if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') return 'סיסמה שגויה';
  if (err?.code === 'auth/requires-recent-login') return 'כדי למחוק את החשבון צריך לאמת את הזהות שוב. אשר ואז המחיקה תמשיך.';
  if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return 'האימות בוטל — כדי למחוק את החשבון יש לאשר את חלון ההתחברות';
  if (err?.code === 'auth/popup-blocked') return 'הדפדפן חסם את חלון ההתחברות';
  if (typeof err?.message === 'string' && /[\u0590-\u05FF]/.test(err.message)) return err.message;
  return authErrorHe(err, 'שגיאה במחיקת החשבון');
}
