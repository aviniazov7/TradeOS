import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { COINS, PAIRS } from '../../utils/constants';
import { searchCoins } from '../../services/coingeckoApi';
import { cacheImage, clearCachedImage } from '../../services/coinImageCache';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function PairSearch({ value, onChange, label = 'זוג', className = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter local PAIRS + search CoinGecko API
  useEffect(() => {
    if (!isOpen) return;

    const q = query.trim().toUpperCase();

    // Local pairs matching
    const localMatches = COINS
      .filter((c) => !q || c.symbol.includes(q) || c.name.toUpperCase().includes(q) || `${c.symbol}USDT`.includes(q))
      .map((c) => ({ pair: `${c.symbol}USDT`, symbol: c.symbol, name: c.name, coingeckoId: c.coingeckoId }));
    setResults(localMatches);

    // Search CoinGecko for additional coins
    if (q.length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const searchQuery = q.replace(/USDT$/i, '');
          const apiResults = await searchCoins(searchQuery);
          const localSymbols = new Set(COINS.map((c) => c.symbol));
          const extra = apiResults
            .filter((r) => !localSymbols.has(r.symbol))
            .map((r) => {
              if (r.thumb) cacheImage(r.symbol, r.thumb);
              return { pair: `${r.symbol}USDT`, symbol: r.symbol, name: r.name, coingeckoId: r.coingeckoId, thumb: r.thumb };
            });
          setResults([...localMatches, ...extra]);
        } catch {
          // Keep local results on error
        } finally {
          setLoading(false);
        }
      }, 300);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  const handleSelect = (item) => {
    onChange(item.pair);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}

      {/* Selected pair or search input */}
      {value && !isOpen ? (
        <div className={`${inputClass} flex items-center justify-between cursor-pointer`} onClick={() => setIsOpen(true)}>
          <span className="truncate">{value}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleClear(); setIsOpen(true); }}
            className="p-0.5 rounded text-text-muted hover:text-loss cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className={`${inputClass} pr-8`}
            placeholder="חפש זוג... (BTC, SOL...)"
            autoFocus={isOpen}
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {/* Custom pair option */}
          {query.trim() && (() => {
            const symbol = query.trim().toUpperCase().replace(/USDT$/i, '');
            const customPair = `${symbol}USDT`;
            const alreadyExists = results.some((r) => r.pair === customPair);
            if (symbol && !alreadyExists) {
              return (
                <button
                  type="button"
                  onClick={() => { clearCachedImage(symbol); handleSelect({ pair: customPair, symbol, name: symbol }); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer border-b border-border-primary hover:bg-bg-tertiary"
                >
                  <span className="text-text-muted text-xs flex items-center gap-1"><Plus className="w-3 h-3" />מותאם אישית</span>
                  <span className="font-medium text-accent-primary">{customPair}</span>
                </button>
              );
            }
            return null;
          })()}
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted text-center">מחפש...</div>
          )}
          {results.map((item) => (
            <button
              key={item.pair}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-bg-tertiary"
            >
              <span className="text-text-muted text-xs truncate">{item.name}</span>
              <span className="font-medium text-text-primary">{item.pair}</span>
            </button>
          ))}
          {loading && results.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-text-muted text-center border-t border-border-primary">מחפש עוד...</div>
          )}
        </div>
      )}
    </div>
  );
}
