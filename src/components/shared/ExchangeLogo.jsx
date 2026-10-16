import { useState } from 'react';
import { getExchangeLogo, EXCHANGES } from '../../utils/constants';

// Real exchange marks sit on a white tile: several of them (OKX) are dark
// and disappear on the app background. No logo, or a failed load, becomes a
// readable letter — `badge` is the journal name when the caller has one.
export default function ExchangeLogo({ exchange, size = 'w-4 h-4', badge }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const logoUrl = getExchangeLogo(exchange);
  const label = EXCHANGES.find((e) => e.value === exchange)?.label || exchange;
  const letter = Array.from(String(badge || label || '?').trim())[0] || '?';
  const error = !!logoUrl && failedUrl === logoUrl;

  if (!exchange) return null;

  if (error || !logoUrl) {
    return (
      <span className={`${size} rounded-full bg-accent-primary/20 text-accent-primary inline-flex items-center justify-center text-[13px] font-extrabold leading-none flex-shrink-0`} aria-hidden="true">
        {letter}
      </span>
    );
  }

  return (
    <span className={`${size} rounded-md bg-white inline-flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      <img
        src={logoUrl}
        alt={label}
        className="w-[86%] h-[86%] object-contain"
        onError={() => setFailedUrl(logoUrl)}
      />
    </span>
  );
}
