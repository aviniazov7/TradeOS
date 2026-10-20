// Keep signed / unit-suffixed numbers readable inside Hebrew (RTL) AI text.
//
// In an RTL paragraph the bidi algorithm treats "+" "-" "%" "$" as neutral and
// moves them around the digits, so "+200 USDT" renders as "USDT 200+" and
// "-1.5R" as "R1.5-". Wrapping each such run in <span dir="ltr" class="num-ltr">
// isolates it (direction:ltr + unicode-bidi:isolate) and it reads as written.
// A trailing sign ("11.24-") is moved in front before the wrap. Runs inside a
// Hebrew word ("ב-200") are left alone: that hyphen is a prefix separator, not
// a minus sign, and renders fine.

import { normalizeSignedToken } from './signedNumbers';

const UNIT = '(?:%|R|x|USDT|USDC|USD|BTC|ETH|SOL|K|M|B)';
const NUM = '\\d[\\d,]*(?:\\.\\d+)?';
const TRAIL = '(?:\\s?[+\\-−])?';

// Ranges and dollar prices first (they may carry a sign), then signed numbers,
// trailing-dollar prices ("63,900$"), then plain numbers with a unit, then a
// bare number whose sign was written after the digits ("11.24-").
// Sign/number must not follow a letter or digit.
export const LTR_RUN_RE = new RegExp(
  [
    `(?<![\\p{L}\\d])[+\\-−]?\\$?${NUM}\\s*[-–]\\s*\\$?${NUM}\\$?(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])[+\\-−]?\\$\\s?${NUM}${TRAIL}(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])[+\\-−]${NUM}\\$?(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])${NUM}\\$${TRAIL}(?:\\s?${UNIT}(?![A-Za-z]))?`,
    `(?<![\\p{L}\\d])${NUM}\\$?\\s?${UNIT}(?![A-Za-z])${TRAIL}`,
    `(?<![\\p{L}\\d])${NUM}\\s?[+\\-−](?![\\p{L}\\d])`,
  ].join('|'),
  'gu',
);

/**
 * Wrap every LTR number run in `text` with `wrap(run)`. Call this on plain text
 * BEFORE other markup is added, so it never matches inside tag attributes.
 * The run passed to `wrap` already has a trailing sign moved to the front.
 * @param {string} text
 * @param {(run: string) => string} [wrap]
 */
export function wrapLtrRuns(text, wrap = (run) => `<span dir="ltr" class="num-ltr">${run}</span>`) {
  return String(text).replace(LTR_RUN_RE, (run) => wrap(normalizeSignedToken(run)));
}
