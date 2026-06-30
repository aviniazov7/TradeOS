import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Plus, Trash2, ExternalLink, Search, TrendingUp, TrendingDown, X, StickyNote } from 'lucide-react';
import { searchCoins, fetchPrices } from '../../services/coingeckoApi';
import { useWatchlist } from '../../hooks/useWatchlist';
import { pageVariants, pageTransition } from '../../utils/animations';
import EmptyState from '../shared/EmptyState';
import toast from 'react-hot-toast';

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}
function tvUrl(symbol) {
  const s = String(symbol || '').toUpperCase();
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BINANCE:${s}USDT`)}`;
}

export default function WatchlistPage() {
  const { items, loading, addItem, removeItem } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [adding, setAdding] = useState(false);
  const [prices, setPrices] = useState({}); // { coingeckoId: { usd, usd_24h_change } }
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Live prices for all watched coins — refreshed on mount, when the list
  // changes, and every 45s.
  const refreshPrices = useCallback(async (signal) => {
    if (!items.length) { setPrices({}); return; }
    const coins = items.map((i) => ({ symbol: i.symbol, coingeckoId: i.coingeckoId }));
    const p = await fetchPrices(coins, signal);
    if (!signal?.aborted) setPrices(p);
  }, [items]);

  useEffect(() => {
    const ctrl = new AbortController();
    refreshPrices(ctrl.signal);
    const t = setInterval(() => refreshPrices(ctrl.signal), 45_000);
    return () => { ctrl.abort(); clearInterval(t); };
  }, [refreshPrices]);

  // Coin search (debounced).
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await searchCoins(query.trim());
      setResults(r);
      setShowResults(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close the results dropdown on outside click.
  useEffect(() => {
    const onClick = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleAdd = async (coin) => {
    if (items.some((i) => i.coingeckoId === coin.coingeckoId)) {
      toast.error('המטבע כבר במעקב');
      setQuery(''); setShowResults(false);
      return;
    }
    setAdding(true);
    try {
      // Capture the current price at add-time so the card can show change-since.
      const p = await fetchPrices([{ symbol: coin.symbol, coingeckoId: coin.coingeckoId }]);
      const addedPrice = p[coin.coingeckoId]?.usd ?? null;
      await addItem({
        coingeckoId: coin.coingeckoId,
        symbol: coin.symbol,
        name: coin.name,
        thumb: coin.thumb || null,
        addedPrice,
        note: '',
      });
      toast.success(`${coin.symbol} נוסף למעקב`);
      setQuery(''); setResults([]); setShowResults(false);
    } catch {
      toast.error('הוספה נכשלה');
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="max-w-5xl mx-auto px-1 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-accent-primary" />
        <h1 className="text-lg font-bold text-text-primary">מעקב מטבעות</h1>
        <span className="text-xs text-text-muted">({items.length})</span>
      </div>

      {/* Add coin */}
      <div className="relative max-w-md mb-6" ref={searchRef}>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-4 py-3 focus-within:border-accent-primary/50 transition-colors">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setShowResults(true)}
            placeholder="חפש מטבע להוספה למעקב..."
            className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full"
          />
          {adding && <span className="text-[11px] text-text-muted shrink-0">מוסיף…</span>}
        </div>
        <AnimatePresence>
          {showResults && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
              className="absolute z-50 top-full mt-1 inset-x-0 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
            >
              {results.map((coin) => (
                <button
                  key={coin.coingeckoId}
                  onClick={() => handleAdd(coin)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-bg-tertiary transition-colors cursor-pointer text-right"
                >
                  {coin.thumb && <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full" />}
                  <span className="text-text-primary font-medium">{coin.name}</span>
                  <span className="text-text-muted text-xs">{coin.symbol}</span>
                  <Plus className="w-4 h-4 text-accent-primary mr-auto" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-sm text-text-muted text-center py-10">טוען…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="אין מטבעות במעקב"
          description="הוסף מטבע שאתה מנתח כדי לעקוב אחרי המחיר ולפתוח אותו ב-TradingView בלחיצה."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {items.map((it) => {
              const live = prices[it.coingeckoId];
              const cur = live?.usd;
              const ch24 = live?.usd_24h_change;
              const sinceAdd = (cur != null && it.addedPrice) ? ((cur - it.addedPrice) / it.addedPrice) * 100 : null;
              return (
                <motion.div
                  key={it.id}
                  layout
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                  className="bento-card p-4 group"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    {it.thumb
                      ? <img src={it.thumb} alt="" className="w-8 h-8 rounded-full shrink-0" />
                      : <span className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-[11px] font-bold text-text-secondary shrink-0">{it.symbol?.slice(0, 3)}</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">{it.symbol}</p>
                      <p className="text-[11px] text-text-muted truncate">{it.name}</p>
                    </div>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="mr-auto p-1.5 rounded-md text-text-muted hover:text-loss hover:bg-loss/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="הסר ממעקב"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-lg font-bold num-mono text-text-primary leading-none">{fmtPrice(cur)}</p>
                      {ch24 != null && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 ${ch24 >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {ch24 >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}% 24ש
                        </span>
                      )}
                    </div>
                    {it.addedPrice != null && (
                      <div className="text-left">
                        <p className="text-[9px] text-text-muted">מאז ההוספה</p>
                        <p className={`text-xs font-semibold num-mono ${sinceAdd == null ? 'text-text-muted' : sinceAdd >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {sinceAdd == null ? '—' : `${sinceAdd >= 0 ? '+' : ''}${sinceAdd.toFixed(2)}%`}
                        </p>
                      </div>
                    )}
                  </div>

                  {it.note ? (
                    <p className="flex items-start gap-1.5 text-[11px] text-text-secondary mb-3 bg-bg-tertiary/50 rounded-lg px-2 py-1.5">
                      <StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-text-muted" /> {it.note}
                    </p>
                  ) : null}

                  <a
                    href={tvUrl(it.symbol)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/15 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> פתח ב-TradingView
                  </a>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
