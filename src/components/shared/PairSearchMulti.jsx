import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { COINS } from '../../utils/constants';
import { searchCoins } from '../../services/coingeckoApi';
import { cacheImage } from '../../services/coinImageCache';
import CoinIcon from './CoinIcon';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-1.5 text-[11px] text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function PairSearchMulti({ selectedPairs = [], onAdd }) {
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

  // Filter local COINS + search CoinGecko API
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([]);
      return;
    }

    const q = query.trim().toUpperCase();

    // Local coins matching
    const localMatches = COINS
      .filter((c) => c.symbol.includes(q) || c.name.toUpperCase().includes(q) || `${c.symbol}USDT`.includes(q))
      .filter((c) => !selectedPairs.includes(`${c.symbol}USDT`))
      .map((c) => ({ pair: `${c.symbol}USDT`, symbol: c.symbol, name: c.name }));
    setResults(localMatches);

    // Search CoinGecko for additional coins
    if (q.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const searchQuery = q.replace(/USDT$/i, '');
          const apiResults = await searchCoins(searchQuery);
          const localSymbols = new Set(COINS.map((c) => c.symbol));
          const extra = apiResults
            .filter((r) => !localSymbols.has(r.symbol) && !selectedPairs.includes(`${r.symbol}USDT`))
            .map((r) => {
              if (r.thumb) cacheImage(r.symbol, r.thumb);
              return { pair: `${r.symbol}USDT`, symbol: r.symbol, name: r.name, thumb: r.thumb };
            });
          // Re-filter local matches in case selectedPairs changed
          const freshLocal = COINS
            .filter((c) => c.symbol.includes(q) || c.name.toUpperCase().includes(q) || `${c.symbol}USDT`.includes(q))
            .filter((c) => !selectedPairs.includes(`${c.symbol}USDT`))
            .map((c) => ({ pair: `${c.symbol}USDT`, symbol: c.symbol, name: c.name }));
          setResults([...freshLocal, ...extra]);
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
  }, [query, isOpen, selectedPairs]);

  const handleSelect = (item) => {
    onAdd(item.pair);
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className={`${inputClass} pr-7`}
          placeholder="חפש מטבע..."
        />
      </div>

      {/* Dropdown opens UPWARD to avoid being clipped by modal overflow */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-[60] bottom-full mb-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-44 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.pair}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-right hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <CoinIcon pair={item.pair} className="w-4 h-4" />
              <span className="text-xs font-medium text-text-primary">{item.pair}</span>
              <span className="text-[10px] text-text-muted truncate">{item.name}</span>
            </button>
          ))}
          {loading && (
            <div className="px-2.5 py-1.5 text-[10px] text-text-muted text-center border-t border-border-primary">מחפש...</div>
          )}
        </div>
      )}
      {isOpen && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-[60] bottom-full mb-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl">
          <div className="px-2.5 py-1.5 text-[10px] text-text-muted text-center">לא נמצאו תוצאות</div>
        </div>
      )}
    </div>
  );
}
