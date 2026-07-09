// eslint-disable-next-line no-unused-vars -- motion is used as <motion.span> (JSX-uses-vars false positive)
import { motion } from 'framer-motion';

// Odometer-style number ticker (21st.dev / Magic-UI look): each digit is a
// vertical 0-9 strip that springs to its target, so a changing value rolls
// like a mechanical counter. Non-digit chars ($, %, +/-, ',', '.') stay
// static. Drop-in superset of <AnimatedValue> — same { value, className } API.
//
// Sizing is font-relative (1em per digit) so it works at any text size the
// caller sets via className. Digits use tabular-nums for stable width.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollDigit({ d }) {
  return (
    <span
      className="inline-block overflow-hidden tabular-nums"
      style={{ height: '1em', lineHeight: '1em', verticalAlign: 'bottom' }}
    >
      {/* Strip is 10em tall; y as % of the strip moves it by d digit-heights.
          Starts at 0 so the number visibly rolls up on mount (count-up), then
          animates digit-to-digit on every subsequent value change. */}
      <motion.span
        className="flex flex-col"
        initial={{ y: '0%' }}
        animate={{ y: `-${d * 10}%` }}
        transition={{ type: 'spring', stiffness: 190, damping: 26, mass: 0.7 }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block text-center" style={{ height: '1em', lineHeight: '1em' }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export default function RollingNumber({ value, className = '' }) {
  const str = value == null || value === '' ? '' : String(value);
  return (
    // dir="ltr" is load-bearing: each character is its own flex item, and
    // flexbox lays items out by the element's direction — inside the app's
    // dir="rtl" pages the row runs right-to-left, so "-$2,012.28" was
    // displayed character-reversed as "82.210,2$-" (bidi can't fix it
    // because the digits are separate elements, not one text run).
    <span
      dir="ltr"
      className={`inline-flex items-baseline tabular-nums ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {str.split('').map((ch, i) =>
        // Position-stable enough for prices/stats (format keeps digit count
        // steady between updates); a rare length change just re-seats a column.
        /\d/.test(ch)
          ? <RollDigit key={i} d={Number(ch)} />
          : <span key={i} className="whitespace-pre">{ch}</span>
      )}
    </span>
  );
}
