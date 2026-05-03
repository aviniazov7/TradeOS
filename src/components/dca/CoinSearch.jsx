import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { COINS } from '../../utils/constants';
import { searchCoins } from '../../services/coingeckoApi';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function CoinSearch({ value, onChange, label = 'מטבע', className = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Show selected coin display text
  const displayText = value ? `${value.symbol} - ${value.name}` : '';

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

  // Filter local COINS + search CoinGecko API
  useEffect(() => {
    if (!isOpen) return;

    const q = query.trim().toLowerCase();

    // Show local coins when no query or matching query
    const localMatches = COINS.filter(
      (c) => !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
    setResults(localMatches);

    // If query is long enough, also search CoinGecko
    if (q.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const apiResults = await searchCoins(q);
          // Merge: local coins first, then API results that aren't already in local
          const localSymbols = new Set(COINS.map((c) => c.symbol));
          const extra = apiResults.filter((r) => !localSymbols.has(r.symbol));
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

  const handleSelect = (coin) => {
    onChange(coin);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}

      {/* Selected coin display or search input */}
      {value && !isOpen ? (
        <div className={`${inputClass} flex items-center justify-between cursor-pointer`} onClick={() => setIsOpen(true)}>
          <span className="truncate">{displayText}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleClear(); }}
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
            placeholder="חפש מטבע... (BTC, Ethereum...)"
            autoFocus={isOpen}
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted text-center">מחפש...</div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-xs text-text-muted text-center">לא נמצאו תוצאות</div>
          )}
          {results.map((coin) => (
              <button
                key={coin.coingeckoId || coin.symbol}
                type="button"
                onClick={() => handleSelect(coin)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                {coin.thumb && (
                  <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-text-primary">{coin.symbol}</span>
                <span className="text-xs text-text-muted truncate">{coin.name}</span>
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
