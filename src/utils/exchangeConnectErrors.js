// Fixed Hebrew sentences for a failed exchange connect. The Worker and the
// login-free client share this list so a reason is never replaced by the
// exchange's own text, which can echo a request URL.

const KEY_LIKE = /[A-Za-z0-9+/=_-]{24,}/;

export const EXCHANGE_CONNECT_ERRORS = {
  key_not_readonly: {
    status: 400,
    message: 'המפתח חייב להיות Read-Only בלבד. בטל הרשאות Trade, Transfer ו-Convert, וצור מפתח חדש.',
  },
  key_invalid: {
    status: 400,
    message: 'המפתח או הסוד לא תואמים. העתק אותם מחדש מדף ה-API, בלי רווחים מיותרים.',
  },
  ip_blocked: {
    status: 400,
    message: 'המפתח מוגבל לפי כתובת IP. הסר את הגבלת ה-IP וצור מפתח חדש. TradeOS מתחבר מכתובות משתנות.',
  },
  no_permission: {
    status: 400,
    message: 'למפתח חסרות הרשאות קריאה. הוסף קריאה לחשבון ולפקודות, בלי מסחר, משיכה או המרה.',
  },
  key_expired: {
    status: 400,
    message: 'תוקף המפתח פג. צור מפתח חדש בבורסה וחבר אותו כאן.',
  },
  permission_check_failed: {
    status: 400,
    message: 'לא הצלחנו לוודא שהמפתח הוא לקריאה בלבד. נסה שוב בעוד רגע.',
  },
  provider_unavailable: {
    status: 503,
    message: 'לא הצלחנו להגיע לבורסה. בדוק את החיבור ונסה שוב בעוד רגע.',
  },
  service_unavailable: {
    status: 503,
    message: 'שירות החיבור אינו זמין זמנית. נסה שוב בעוד רגע.',
  },
  rate_limited: {
    status: 429,
    message: 'הגעת למגבלת 5 ניסיונות לשעה. נסה שוב מאוחר יותר.',
  },
  free_limit: {
    status: 403,
    message: 'במסלול החינמי אפשר לחבר בורסה אחת. נתק את הקיימת או שדרג ל-Premium.',
  },
  missing_fields: {
    status: 400,
    message: 'חסרים מפתח או סוד. מלא את שני השדות ונסה שוב.',
  },
  unauthorized: {
    status: 401,
    message: 'יש להתחבר כדי לחבר בורסה.',
  },
  unsupported: {
    status: 400,
    message: 'אי אפשר לחבר את הבורסה הזו עם מפתח API.',
  },
};

export function exchangeConnectMessage(code) {
  return EXCHANGE_CONNECT_ERRORS[code]?.message || '';
}

export function exchangeConnectBody(code) {
  const known = EXCHANGE_CONNECT_ERRORS[code] ? code : 'provider_unavailable';
  const row = EXCHANGE_CONNECT_ERRORS[known];
  return { status: row.status, body: { error: row.message, code: known } };
}

// Prefer the fixed sentence for a known code. An old response with only a
// short Hebrew `error` is still shown. Anything that looks like a key is not.
export function connectClientError(payload) {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const known = exchangeConnectMessage(code);
  if (known) return { code, message: known };
  const raw = typeof payload?.error === 'string' ? payload.error.trim() : '';
  if (raw && raw.length <= 180 && !KEY_LIKE.test(raw)) return { code: '', message: raw };
  return { code: 'provider_unavailable', message: exchangeConnectMessage('provider_unavailable') };
}
