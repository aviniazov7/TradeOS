import { useState } from 'react';
import CoinIcon from '../shared/CoinIcon';
import StockLogo from '../stocks/StockLogo';
import { tickerCoinUrls, tickerMarkUrls } from '../../utils/tickerMarks';

function LetterBadge({ text, className }) {
  return (
    <span
      className={`${className} rounded-full bg-bg-tertiary text-text-secondary grid place-items-center text-[8px] font-bold shrink-0 leading-none`}
      aria-hidden="true"
    >
      {String(text || '?').slice(0, 2)}
    </span>
  );
}

function MarkImage({ urls, badge, className }) {
  const [idx, setIdx] = useState(0);
  const url = urls[idx];
  if (!url) return <LetterBadge text={badge} className={className} />;
  return (
    <img
      src={url}
      alt=""
      className={`${className} rounded-full object-cover shrink-0 bg-white`}
      onError={() => setIdx((n) => n + 1)}
    />
  );
}

/** One ticker icon: a coin, a company, or a commodity/index mark. Never a broken image. */
export default function TickerLogo({ kind, symbol, className = 'w-4 h-4' }) {
  if (kind === 'stock') return <StockLogo symbol={symbol} className={className} rounded="rounded-full" />;
  if (kind === 'crypto') {
    const local = tickerCoinUrls(symbol);
    if (local.length) return <MarkImage urls={local} badge={symbol} className={className} />;
    return <CoinIcon pair={symbol} className={className} />;
  }
  return <MarkImage urls={tickerMarkUrls(symbol)} badge={symbol} className={className} />;
}
