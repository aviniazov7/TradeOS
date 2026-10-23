import { useEffect, useState } from 'react';
import { getExchangeLogo, EXCHANGES } from '../../utils/constants';

// The app defaults to dark and adds `light` on <html> for the light theme.
function useLightTheme() {
  const [light, setLight] = useState(() => (
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  ));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(root.classList.contains('light'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return light;
}

// Bundled marks are transparent and sit directly on the UI. A Google favicon
// (unknown broker) gets a subtle neutral chip — not a white tile. No logo,
// or a failed load, becomes a readable letter. `badge` is the journal name
// when the caller has one.
export default function ExchangeLogo({ exchange, size = 'w-4 h-4', badge }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const light = useLightTheme();
  const logoUrl = getExchangeLogo(exchange, { theme: light ? 'light' : 'dark' });
  const label = EXCHANGES.find((e) => e.value === exchange)?.label || exchange;
  const letter = Array.from(String(badge || label || '?').trim())[0] || '?';
  const error = !!logoUrl && failedUrl === logoUrl;
  const remote = typeof logoUrl === 'string' && /^https?:/i.test(logoUrl);

  if (!exchange) return null;

  if (error || !logoUrl) {
    return (
      <span className={`${size} rounded-full bg-accent-primary/20 text-accent-primary inline-flex items-center justify-center text-[13px] font-extrabold leading-none flex-shrink-0`} aria-hidden="true">
        {letter}
      </span>
    );
  }

  const frame = remote
    ? (light
      ? 'rounded-md bg-black/[0.06] ring-1 ring-inset ring-black/10'
      : 'rounded-md bg-white/10 ring-1 ring-inset ring-white/15')
    : '';

  return (
    <span className={`${size} ${frame} inline-flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      <img
        src={logoUrl}
        alt={label}
        className={`${remote ? 'w-[78%] h-[78%]' : 'w-full h-full'} object-contain`}
        onError={() => setFailedUrl(logoUrl)}
      />
    </span>
  );
}
