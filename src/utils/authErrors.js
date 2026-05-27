// Maps Firebase Auth (and generic) error codes to Hebrew messages so users
// never see raw English error strings like "Firebase: Error (auth/...)".

const MESSAGES = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/user-disabled': 'החשבון הושבת',
  'auth/user-not-found': 'אימייל או סיסמה שגויים',
  'auth/wrong-password': 'אימייל או סיסמה שגויים',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים',
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
