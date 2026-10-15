import { useState } from 'react';
import CoinIcon from '../shared/CoinIcon';
import { tickerLogoFrame } from '../../utils/tickerLogo';

function LetterBadge({ text, className }) {
  return (
    <span
      className={`${className} rounded-full bg-bg-tertiary text-text-secondary grid place-items-center text-[9px] font-bold shrink-0 leading-none`}
      aria-hidden="true"
    >
      {String(text || '?').slice(0, 2)}
    </span>
  );
}

/** One ticker icon on a circular tile. Never cropped, never a broken image. */
export default function TickerLogo({ kind, symbol, className = 'w-6 h-6' }) {
  const [failed, setFailed] = useState(0);
  const { background, inset, urls } = tickerLogoFrame(kind, symbol);
  const src = urls[failed];
  if (!src) {
    if (kind === 'crypto') return <CoinIcon pair={symbol} className={className} />;
    return <LetterBadge text={symbol} className={className} />;
  }
  return (
    <span
      data-testid="ticker-logo"
      className={`${className} rounded-full overflow-hidden grid place-items-center shrink-0`}
      style={{
        background,
        boxShadow: background === '#000000' ? 'inset 0 0 0 1px rgba(255,255,255,0.28)' : undefined,
      }}
    >
      <img
        src={src}
        alt=""
        draggable="false"
        className="object-contain max-w-none"
        style={{ width: inset, height: inset }}
        onError={() => setFailed((n) => n + 1)}
      />
    </span>
  );
}
