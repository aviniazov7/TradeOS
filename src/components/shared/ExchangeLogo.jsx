import { useState } from 'react';
import { getExchangeLogo, EXCHANGES } from '../../utils/constants';

export default function ExchangeLogo({ exchange, size = 'w-4 h-4' }) {
  const [error, setError] = useState(false);
  const logoUrl = getExchangeLogo(exchange);
  const label = EXCHANGES.find((e) => e.value === exchange)?.label || exchange;

  if (!exchange || error || !logoUrl) {
    if (!exchange) return null;
    return (
      <span className={`${size} rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-[9px] font-bold flex-shrink-0 uppercase`}>
        {(label || '?')[0]}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={label}
      className={`${size} rounded-sm flex-shrink-0`}
      onError={() => setError(true)}
    />
  );
}
