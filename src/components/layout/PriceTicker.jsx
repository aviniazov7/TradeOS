import { useWorkerQuotes } from '../../hooks/useWorkerQuotes';
import { COINS, FUTURES_CONTRACTS } from '../../utils/constants';
import { useAuth } from '../../contexts/AuthContext';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { TrendingUp, TrendingDown, Droplet, Flame, Gem, Landmark, CandlestickChart } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';

// Crypto symbols shown in the ticker (kept small to keep the API request light).
// PAXG = PAX Gold (Bybit pair PAXGUSDT); displayed as gold/XAU.
const TICKER_SYMBOLS = ['BTC','ETH','SOL','AVAX','BNB','ADA','XRP','DOGE','TRX','SUI','NEAR','LINK','DOT','PEPE','WIF','ARB','UNI','ATOM','PAXG'];
// Headline futures contracts for the ticker.
const TICKER_FUTURES = ['ES','NQ','YM','RTY','CL','GC','SI','NG'];

// A fitting, colour-coded icon per futures contract so they read like distinct
// instruments (gold = amber, silver = slate, oil = orange, gas = blue flame,
// indices = a candlestick) rather than one generic glyph.
function futuresIcon(symbol) {
  if (symbol === 'GC' || symbol === 'MGC') return { Icon: Gem, className: 'text-amber-400' };     // gold
  if (symbol === 'SI') return { Icon: Gem, className: 'text-slate-300' };                         // silver
  if (symbol === 'CL' || symbol === 'MCL') return { Icon: Droplet, className: 'text-orange-500' };// crude oil
  if (symbol === 'NG') return { Icon: Flame, className: 'text-sky-400' };                         // natural gas
  if (symbol === 'ZB' || symbol === 'ZN') return { Icon: Landmark, className: 'text-emerald-400' };// rates
  return { Icon: CandlestickChart, className: 'text-indigo-400' };                                // equity indices
}

export default function PriceTicker() {
  const { profile } = useAuth();
  // What the user trades drives what the ticker shows. Default crypto for
  // back-compat / signed-out. 'stocks' has no price feed yet, so it's ignored.
  const assetClasses = profile?.settings?.assetClasses?.length ? profile.settings.assetClasses : ['crypto'];
  const showCrypto = assetClasses.includes('crypto');
  const showFutures = assetClasses.includes('futures_cme');

  // Crypto via Bybit (/cx) and futures via Yahoo (/fut) — both reachable from
  // the worker, where Binance + CoinGecko return 403.
  const { prices: cryptoPrices, loading: cryptoLoading } = useWorkerQuotes('/cx/quotes', TICKER_SYMBOLS, { enabled: showCrypto });
  const { prices: futuresPrices, loading: futuresLoading } = useWorkerQuotes('/fut/quotes', TICKER_FUTURES, { enabled: showFutures });

  // Each source renders independently as soon as its data is in. We only show
  // the skeleton while NOTHING is available yet and something is still loading.
  const cryptoItems = showCrypto
    ? COINS.filter((c) => cryptoPrices[c.symbol]).map((c) => ({
        key: `c-${c.symbol}`, kind: 'crypto', symbol: c.symbol,
        label: `${c.symbol}/USDT`, data: cryptoPrices[c.symbol],
      }))
    : [];
  // Gold (PAX Gold on Bybit) — shown alongside crypto as XAU with a gold icon.
  const goldItems = showCrypto && cryptoPrices['PAXG']
    ? [{ key: 'c-gold', kind: 'gold', symbol: 'XAU', label: 'XAU/USD', data: cryptoPrices['PAXG'] }]
    : [];
  const futuresItems = showFutures
    ? FUTURES_CONTRACTS.filter((c) => TICKER_FUTURES.includes(c.symbol) && futuresPrices[c.symbol]).map((c) => ({
        key: `f-${c.symbol}`, kind: 'futures', symbol: c.symbol,
        label: c.symbol, data: futuresPrices[c.symbol],
      }))
    : [];
  const items = [...cryptoItems, ...goldItems, ...futuresItems];

  const anyLoading = (showCrypto && cryptoLoading) || (showFutures && futuresLoading);

  if (!items.length) {
    if (anyLoading) {
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
    return (
      <div className="flex items-center justify-center h-full" dir="ltr">
        <span className="text-xs text-text-muted">טוען מחירים...</span>
      </div>
    );
  }

  // Keep the scroll speed constant per item regardless of how many show — a
  // fixed CSS duration made an 8-item futures-only ticker crawl. ~4s/item
  // matches the original crypto speed.
  const scrollDuration = Math.max(30, items.length * 4);

  const renderItem = (item, index) => {
    const { data } = item;
    const isPositive = data.change24h >= 0;
    const fut = item.kind === 'futures' ? futuresIcon(item.symbol) : null;
    return (
      <div key={`${item.key}-${index}`} className="flex items-center gap-2 px-4 whitespace-nowrap">
        {item.kind === 'crypto'
          ? <CoinIcon pair={`${item.symbol}USDT`} className="w-3.5 h-3.5" />
          : item.kind === 'gold'
            ? <Gem className="w-3.5 h-3.5 text-amber-400" />
            : <fut.Icon className={`w-3.5 h-3.5 ${fut.className}`} />}
        <span className="text-xs font-bold text-text-primary">{item.label}</span>
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
      <div className="ticker-scroll" style={{ animationDuration: `${scrollDuration}s` }}>
        {items.map((item, i) => renderItem(item, i))}
        {items.map((item, i) => renderItem(item, i + items.length))}
      </div>
    </div>
  );
}
