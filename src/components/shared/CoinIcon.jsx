import { useState, useEffect } from 'react';
import { getCachedImage, prefetchCoinImages } from '../../services/coinImageCache';

const SYMBOL_COLORS = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f3ba2f',
  XRP: '#00aae4', ADA: '#0033ad', DOGE: '#c2a633', AVAX: '#e84142',
  XAU: '#d4af37', XAG: '#c0c0c0', LINK: '#2a5ada', DOT: '#e6007a',
  UNI: '#ff007a', ATOM: '#2e3148', NEAR: '#00c08b', APT: '#00bfa5',
  ARB: '#28a0f0', OP: '#ff0420',
};

function getSymbolColor(symbol) {
  return SYMBOL_COLORS[symbol] || '#6366f1';
}

export function getCoinIcon(pair) {
  const symbol = (pair || '').replace(/USDT$/i, '').toUpperCase();
  return getCachedImage(symbol);
}

export default function CoinIcon({ pair, className = 'w-4 h-4' }) {
  const symbol = (pair || '').replace(/USDT$/i, '').toUpperCase();
  const [imageUrl, setImageUrl] = useState(() => getCachedImage(symbol));
  const [failed, setFailed] = useState(false);

  // Re-resolve image whenever the symbol changes
  useEffect(() => {
    if (!symbol) {
      setImageUrl(null);
      setFailed(false);
      return;
    }
    // Always check cache first; if symbol changed we must re-read
    const cached = getCachedImage(symbol);
    if (cached) {
      setImageUrl(cached);
      setFailed(false);
      return;
    }
    // Not in cache yet — fetch the full map
    setImageUrl(null);
    setFailed(false);
    let cancelled = false;
    prefetchCoinImages().then((map) => {
      if (!cancelled) {
        setImageUrl(map[symbol] || null);
        setFailed(false);
      }
    });
    return () => { cancelled = true; };
  }, [symbol]);

  // When image load fails, try re-fetching from API
  const handleError = () => {
    setFailed(true);
    prefetchCoinImages().then((map) => {
      const fresh = map[symbol];
      if (fresh && fresh !== imageUrl) {
        setImageUrl(fresh);
        setFailed(false);
      }
    });
  };

  if (!symbol) return null;

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${className} flex-shrink-0 rounded-full`}
        onError={handleError}
      />
    );
  }

  return (
    <span
      className={`${className} flex-shrink-0 inline-flex items-center justify-center rounded-full`}
      style={{ backgroundColor: getSymbolColor(symbol), fontSize: '60%', color: '#fff', fontWeight: 700 }}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
