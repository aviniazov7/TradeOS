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
  // Percentage width/height on a grid item collapses in WebKit, which is why
  // the NVIDIA eye painted as an empty black circle on iPhone. Fill the tile
  // with an absolutely positioned <img> that has an intrinsic size, and load
  // a static file (never an inline SVG, so duplicated marquee copies cannot
  // share gradient ids).
  const pad = `${Math.max(0, (100 - parseFloat(inset)) / 2)}%`;
  return (
    <span
      data-testid="ticker-logo"
      className={`${className} relative rounded-full overflow-hidden shrink-0`}
      style={{
        background,
        boxShadow: background === '#000000' ? 'inset 0 0 0 1px rgba(255,255,255,0.28)' : undefined,
      }}
    >
      <img
        src={src}
        alt=""
        width="64"
        height="64"
        draggable="false"
        decoding="sync"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ padding: pad, boxSizing: 'border-box' }}
        onError={() => setFailed((n) => n + 1)}
      />
    </span>
  );
}
