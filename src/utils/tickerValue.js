// Money, percents, R-multiples, "1.2K", masked dots. Hebrew words are not
// ticker values: RollingNumber forces dir=ltr, which would spell them backwards.
const TICKER_RE = /^[\s\u200E\u200F\u2066\u2069\u2022+\-−$₪€£¥%.,:/0-9∞—–A-Za-z]+$/;

export function isTickerValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (typeof value !== 'string') return false;
  const t = value.trim();
  return t.length > 0 && TICKER_RE.test(t);
}
