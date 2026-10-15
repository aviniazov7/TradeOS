import { useState, useEffect } from 'react';
import { useWorkerQuotes } from '../../hooks/useWorkerQuotes';
import { FUTURES_CONTRACTS } from '../../utils/constants';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPrices } from '../../services/coingeckoApi';
import { formatPrice, formatPercent } from '../../utils/formatters';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import TickerLogo from './TickerLogo';
import { TICKER_STOCKS } from '../../utils/stocks';
import { tickerView } from '../../utils/priceTicker';
import { TICKER_CRYPTO_FALLBACK, loadTopCryptoSymbols } from '../../utils/tickerSymbols';

// Headline futures contracts for the ticker.
const TICKER_FUTURES = ['ES','NQ','YM','RTY','CL','GC','SI','NG'];

export default function PriceTicker() {
  const { profile } = useAuth();
  // What the user trades drives what the ticker shows. Default crypto for
  // back-compat / signed-out. Stocks come from the worker's Yahoo feed.
  const assetClasses = profile?.settings?.assetClasses?.length ? profile.settings.assetClasses : ['crypto'];
  const showCrypto = assetClasses.includes('crypto');
  const showFutures = assetClasses.includes('futures_cme');
  const showStocks = assetClasses.includes('stocks');

  // Starts on the static majors, then swaps in the live top-by-cap list.
  const [cryptoSymbols, setCryptoSymbols] = useState(TICKER_CRYPTO_FALLBACK);
  useEffect(() => {
    if (!showCrypto) return undefined;
    let cancelled = false;
    loadTopCryptoSymbols().then((syms) => {
      if (cancelled) return;
      setCryptoSymbols((prev) => (
        prev.length === syms.length && prev.every((s, i) => s === syms[i]) ? prev : syms
      ));
    });
    return () => { cancelled = true; };
  }, [showCrypto]);

  // Crypto via Bybit (/cx) and futures via Yahoo (/fut) — both reachable from
  // the worker, where Binance + CoinGecko return 403.
  const crypto = useWorkerQuotes('/cx/quotes', cryptoSymbols, { enabled: showCrypto });
  const futures = useWorkerQuotes('/fut/quotes', TICKER_FUTURES, { enabled: showFutures });
  const stocks = useWorkerQuotes('/stk/quotes', TICKER_STOCKS, { enabled: showStocks });
  const cryptoPrices = crypto.prices;
  const futuresPrices = futures.prices;
  const stockPrices = stocks.prices;

  // Gold (XAU) isn't on the crypto quote feed (Bybit), so pull it from CoinGecko
  // (pax-gold) via fetchPrices — geo-safe through the worker proxy. Refreshed
  // every 60s while the crypto ticker is shown.
  const [gold, setGold] = useState(null);
  const [goldAttempt, setGoldAttempt] = useState(0);
  useEffect(() => {
    if (!showCrypto) return;
    let cancelled = false;
    const load = () => fetchPrices([{ symbol: 'XAU', coingeckoId: 'pax-gold' }])
      .then((r) => { if (!cancelled) setGold(r['pax-gold'] || null); })
      .catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [showCrypto, goldAttempt]);

  // Each source renders independently as soon as its data is in. We only show
  // the skeleton while NOTHING is available yet and something is still loading.
  const cryptoItems = showCrypto
    ? cryptoSymbols.filter((sym) => cryptoPrices[sym]).map((sym) => ({
        key: `c-${sym}`, kind: 'crypto', symbol: sym,
        label: `${sym}/USDT`, data: cryptoPrices[sym],
      }))
    : [];
  // Gold (XAU) — sourced from CoinGecko (pax-gold), shown with a gold icon.
  const goldItems = showCrypto && gold
    ? [{ key: 'c-gold', kind: 'gold', symbol: 'XAU', label: 'XAU/USD', data: { price: gold.usd, change24h: gold.usd_24h_change ?? 0 } }]
    : [];
  const futuresItems = showFutures
    ? FUTURES_CONTRACTS.filter((c) => TICKER_FUTURES.includes(c.symbol) && futuresPrices[c.symbol]).map((c) => ({
        key: `f-${c.symbol}`, kind: 'futures', symbol: c.symbol,
        label: c.symbol, data: futuresPrices[c.symbol],
      }))
    : [];
  const stockItems = showStocks
    ? TICKER_STOCKS.filter((sym) => stockPrices[sym]).map((sym) => ({
        key: `s-${sym}`, kind: 'stock', symbol: sym, label: sym, data: stockPrices[sym],
      }))
    : [];
  const items = [...stockItems, ...cryptoItems, ...goldItems, ...futuresItems];

  // Disabled feeds report loading/failed as false, so no per-class guard needed.
  const feeds = [crypto, futures, stocks];
  const view = tickerView({
    itemCount: items.length,
    loading: feeds.some((f) => f.loading),
    failed: feeds.some((f) => f.failed),
  });
  const retryAll = () => {
    feeds.forEach((f) => { if (f.failed) f.retry(); });
    if (showCrypto && !gold) setGoldAttempt((n) => n + 1);
  };
  const retryButton = (label) => (
    <button
      type="button"
      onClick={retryAll}
      className="flex items-center gap-1 px-2 h-6 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer shrink-0"
    >
      <RefreshCw className="w-3 h-3" aria-hidden />
      {label}
    </button>
  );

  if (view.state !== 'ready') {
    if (view.state === 'loading') {
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
    // Every feed came back empty — say so and offer a retry instead of an
    // endless "loading" (the feeds keep polling on their own as well).
    return (
      <div className="flex items-center justify-center gap-2 h-full" role="status">
        <span className="text-xs text-text-muted">המחירים לא זמינים כרגע</span>
        {retryButton('נסה שוב')}
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
    return (
      <div key={`${item.key}-${index}`} className="flex items-center gap-2 px-4 whitespace-nowrap">
        <TickerLogo kind={item.kind} symbol={item.symbol} className="w-4 h-4" />
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
    <div className="overflow-hidden h-full flex items-center gap-1" dir="ltr">
      {/* Some feed failed (e.g. crypto down, only gold in) — let the user retry
          it. Placed first so the marquee's max-content width can't push it out. */}
      {view.showRetry && retryButton('רענן')}
      {view.scroll ? (
        // shrink-0 is load-bearing: the animation moves the strip by 50% of ITS
        // OWN width (one copy of the list). As a flex child it could otherwise
        // shrink to the container width, and the strip would crawl half a
        // screen per cycle instead of half the list.
        <div className="ticker-scroll shrink-0" style={{ animationDuration: `${scrollDuration}s` }}>
          {items.map((item, i) => renderItem(item, i))}
          {items.map((item, i) => renderItem(item, i + items.length))}
        </div>
      ) : (
        // Too few quotes to loop — show them once, without the marquee.
        <div className="flex items-center min-w-0 overflow-hidden">
          {items.map((item, i) => renderItem(item, i))}
        </div>
      )}
    </div>
  );
}
