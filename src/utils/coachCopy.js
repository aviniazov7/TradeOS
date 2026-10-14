// How the AI coach is allowed to talk when the journal is still thin.
// One closed trade used to come back as "stop trading X" or "מצוין".

export const MIN_CONCLUSION_TRADES = 5;

export const NOT_ENOUGH_DATA_NOTE = 'אין מספיק נתונים להסקת מסקנות — צריך לפחות 5 עסקאות סגורות.';

export function conclusionsReady(total) {
  return Number(total) >= MIN_CONCLUSION_TRADES;
}

/** long/short (and an already-Hebrew label) → לונג/שורט. Anything else is unchanged. */
export function directionLabelHe(direction) {
  const raw = String(direction || '').trim();
  const key = raw.toLowerCase();
  if (key === 'long' || raw === 'לונג') return 'לונג';
  if (key === 'short' || raw === 'שורט') return 'שורט';
  return raw;
}

/** English direction words the model echoes ("short · 1") → Hebrew. */
export function hebrewDirections(text) {
  return String(text || '')
    .replace(/\blongs?\b/gi, 'לונג')
    .replace(/\bshorts?\b/gi, 'שורט');
}

const STRONG_CONCLUSION = /הפסק לסחור|stop trading|מצוין|excellent/i;

export function isStrongConclusion(text) {
  return STRONG_CONCLUSION.test(String(text || ''));
}

/**
 * Drop bullets that grade or command when fewer than 5 trades are in the
 * sample. Headings stay. A large enough sample is returned unchanged.
 */
export function softenCoachReport(text, total) {
  const source = String(text || '');
  if (conclusionsReady(total)) return source;
  return source.split('\n').filter((line) => {
    const body = line.trim();
    if (!body) return true;
    if (/^\*\*/.test(body) || /^#{1,6}\s/.test(body)) return true;
    const bullet = body.replace(/^[•\-*]\s*/, '');
    return !isStrongConclusion(bullet);
  }).join('\n');
}

/** Profit-factor subtitle. A thin sample is never "מצוין". */
export function profitFactorLabel(profitFactor, total) {
  if (!conclusionsReady(total)) return 'אין מספיק נתונים';
  const pf = Number(profitFactor);
  if (!Number.isFinite(pf)) return 'לשיפור';
  if (pf >= 1.5) return 'מצוין';
  if (pf >= 1) return 'תקין';
  return 'לשיפור';
}
