// Login-screen odometer. The signed-in app uses RollingNumber (framer-motion);
// this page must not load that chunk. Digits are a CSS strip (see .css-ticker-strip).
// dir=ltr so a leading + or % is not reversed in the Hebrew layout.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function CssTicker({ value, className = '' }) {
  const str = value == null || value === '' ? '' : String(value);
  return (
    <span className={`inline-flex items-end num-ltr ${className}`} aria-label={str}>
      <span className="sr-only">{str}</span>
      {Array.from(str).map((ch, i) => {
        if (ch >= '0' && ch <= '9') {
          return (
            <span
              key={`${i}-${ch}`}
              className="css-ticker-digit"
              style={{ '--d': ch, animationDelay: `${i * 0.07}s` }}
              aria-hidden="true"
            >
              <span className="css-ticker-strip" style={{ animationDelay: `${i * 0.07}s` }}>
                {DIGITS.map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          );
        }
        return <span key={`${i}-${ch}`} aria-hidden="true">{ch}</span>;
      })}
    </span>
  );
}
