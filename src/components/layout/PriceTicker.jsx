import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import { COINS } from '../../utils/constants';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { TrendingUp, TrendingDown } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';

// Ticker shows only these symbols to keep the Binance API request small
const TICKER_SYMBOLS = ['BTC','ETH','SOL','AVAX','BNB','ADA','XRP','DOGE','TRX','SUI','NEAR','LINK','DOT','PEPE','WIF','ARB','UNI','ATOM'];

export default function PriceTicker() {
  const { prices, loading } = useCryptoPrices({ symbols: TICKER_SYMBOLS });

  if (loading) {
    return (
      <div className="flex items-center gap-6" dir="ltr">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-8 h-3 bg-bg-tertiary rounded animate-pulse" />
            <div className="w-14 h-3 bg-bg-tertiary rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const tickerItems = COINS.filter((c) => prices[c.symbol]);
  if (!tickerItems.length) {
    return (
      <div className="flex items-center justify-center h-full" dir="ltr">
        <span className="text-xs text-text-muted">טוען מחירים...</span>
      </div>
    );
  }

  const renderItem = (coin, index) => {
    const data = prices[coin.symbol];
    if (!data) return null;
    const isPositive = data.change24h >= 0;

    return (
      <div key={`${coin.symbol}-${index}`} className="flex items-center gap-2 px-4 whitespace-nowrap">
        <CoinIcon pair={`${coin.symbol}USDT`} className="w-3.5 h-3.5" />
        <span className="text-xs font-bold text-text-primary">{coin.symbol}/USDT</span>
        <span className="text-xs text-text-secondary">${formatPrice(data.price)}</span>
        <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-profit' : 'text-loss'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {formatPercent(data.change24h)}
        </span>
      </div>
    );
  };

  return (
    <div className="overflow-hidden h-full flex items-center" dir="ltr">
      <div className="ticker-scroll">
        {tickerItems.map((coin, i) => renderItem(coin, i))}
        {tickerItems.map((coin, i) => renderItem(coin, i + tickerItems.length))}
      </div>
    </div>
  );
}
