// Maps Firebase Auth (and generic) error codes to Hebrew messages so users
// never see raw English error strings like "Firebase: Error (auth/...)".

const MESSAGES = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/user-disabled': 'החשבון הושבת',
  'auth/user-not-found': 'אימייל או סיסמה שגויים',
  'auth/wrong-password': 'אימייל או סיסמה שגויים',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים',
  'auth/invalid-login-credentials': 'אימייל או סיסמה שגויים',
  'auth/missing-password': 'הכנס סיסמה',
  'auth/password-does-not-meet-requirements': 'הסיסמה צריכה לפחות 8 תווים, אות גדולה ומספר',
  'auth/email-already-in-use': 'האימייל כבר רשום במערכת',
  'auth/account-exists-with-different-credential': 'קיים חשבון עם אמצעי התחברות אחר',
  'auth/popup-closed-by-user': 'חלון ההתחברות נסגר',
  'auth/popup-blocked': 'הדפדפן חסם את חלון ההתחברות',
  'auth/cancelled-popup-request': 'ההתחברות בוטלה',
  'auth/network-request-failed': 'בעיית רשת — בדוק את החיבור לאינטרנט',
  'auth/too-many-requests': 'יותר מדי ניסיונות — נסה שוב מאוחר יותר',
  'auth/expired-action-code': 'הקישור פג תוקף — בקש קישור חדש',
  'auth/invalid-action-code': 'הקישור אינו תקין — בקש קישור חדש',
  'auth/weak-password': 'הסיסמה חלשה מדי',
  'auth/operation-not-allowed': 'אמצעי ההתחברות אינו זמין',
};

export function authErrorHe(err, fallback = 'שגיאה בהתחברות') {
  const code = err?.code || '';
  return MESSAGES[code] || fallback;
}

// Google sign-in the user closed or replaced themselves — not worth a message.
const SILENT_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

/** True when the error is the user backing out, so no message should show. */
export function isSilentAuthError(err) {
  return SILENT_CODES.has(err?.code);
}

/**
 * Message for the email login / signup form. Unmapped codes used to read
 * "שגיאה בהתחברות" even on signup — including a network drop after which the
 * account often DID exist, so the user was told signup failed when it hadn't.
 * @param {'login' | 'register'} [mode]
 */
export function authErrorMessage(err, mode = 'login') {
  if (mode === 'register' && err?.code === 'auth/network-request-failed') {
    return 'בעיית רשת. ייתכן שהחשבון נוצר בכל זאת, נסה להתחבר עם הפרטים שלך';
  }
  return authErrorHe(err, mode === 'register' ? 'ההרשמה נכשלה. נסה שוב' : 'ההתחברות נכשלה. נסה שוב');
}
