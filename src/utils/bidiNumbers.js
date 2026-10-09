// Keep signed / unit-suffixed numbers readable inside Hebrew (RTL) AI text.
//
// In an RTL paragraph the bidi algorithm treats "+" "-" "%" "$" as neutral and
// moves them around the digits, so "+200 USDT" renders as "USDT 200+" and
// "-1.5R" as "R1.5-". Wrapping each such run in <span dir="ltr"> isolates it
// and it reads as written. Runs inside a Hebrew word ("ב-200") are left alone:
// that hyphen is a prefix separator, not a minus sign, and renders fine.

const UNIT = '(?:%|R|x|USDT|USDC|USD|BTC|ETH|SOL|K|M|B)';
const NUM = '\\d[\\d,]*(?:\\.\\d+)?';

// Ranges and dollar prices first (they may carry a sign), then signed numbers,
// trailing-dollar prices ("63,900$"), then plain numbers with a unit.
// Sign/number must not follow a letter or digit.
export const LTR_RUN_RE = new RegExp(
  [
    `(?<![\\p{L}\\d])[+\\-−]?\\$?${NUM}\\s*[-–]\\s*\\$?${NUM}\\$?(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])[+\\-−]?\\$\\s?${NUM}(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])[+\\-−]${NUM}\\$?(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])${NUM}\\$(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])${NUM}\\$?\\s?${UNIT}(?![A-Za-z])`,
  ].join('|'),
  'gu',
);

/**
 * Wrap every LTR number run in `text` with `wrap(run)`. Call this on plain text
 * BEFORE other markup is added, so it never matches inside tag attributes.
 * @param {string} text
 * @param {(run: string) => string} [wrap]
 */
export function wrapLtrRuns(text, wrap = (run) => `<span dir="ltr">${run}</span>`) {
  return String(text).replace(LTR_RUN_RE, (run) => wrap(run));
}
