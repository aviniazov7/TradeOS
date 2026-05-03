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

  useEffect(() => {
    if (!symbol || imageUrl) return;

    let cancelled = false;
    prefetchCoinImages().then((map) => {
      if (!cancelled && map[symbol]) {
        setImageUrl(map[symbol]);
      }
    });
    return () => { cancelled = true; };
  }, [symbol, imageUrl]);

  if (!symbol) return null;

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${className} flex-shrink-0 rounded-full`}
        onError={() => setFailed(true)}
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
