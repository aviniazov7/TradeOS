import { useId } from 'react';

// The login mark: icon plus "TradeOS". Unique gradient ids so two copies on
// the same page don't share a paint server (React 19 hydration mismatch).
//   sm — header row on a phone: icon + wordmark, no tagline
//   md / lg — login page, with the tagline
export default function BrandMark({ size = 'md' }) {
  const uid = useId().replace(/:/g, '');
  const bgId = `bm-bg-${uid}`;
  const lineId = `bm-line-${uid}`;
  const sm = size === 'sm';
  const box = size === 'lg' ? 'w-12 h-12 rounded-2xl' : sm ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl';
  const word = size === 'lg' ? 'text-2xl' : sm ? 'text-base' : 'text-xl';
  return (
    <div className={`flex items-center ${sm ? 'gap-2' : 'gap-3'}`}>
      <svg
        viewBox="0 0 48 48"
        className={`${box} shrink-0`}
        style={{ boxShadow: sm ? '0 0 16px -6px rgba(0,123,167,0.55)' : '0 0 28px -8px rgba(0,123,167,0.6)' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#141414" /><stop offset="100%" stopColor="#0a0a0a" /></linearGradient>
          <linearGradient id={lineId} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#005e80" /><stop offset="55%" stopColor="#007ba7" /><stop offset="100%" stopColor="#1496c4" /></linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill={`url(#${bgId})`} />
        <path d="M12 34 L22 24 L26 28 L36 16" fill="none" stroke={`url(#${lineId})`} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="36" cy="16" r="5.5" fill="none" stroke="#007ba7" strokeOpacity="0.35" strokeWidth="1.5" />
      </svg>
      <div className="leading-tight">
        <div className={`${word} font-extrabold text-text-primary`} dir="ltr">TradeOS</div>
        {!sm && <div className="text-xs text-text-muted">מערכת ההפעלה למסחר</div>}
      </div>
    </div>
  );
}
