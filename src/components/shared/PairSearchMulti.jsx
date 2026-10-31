import { useState, useEffect, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { COINS } from '../../utils/constants';
import { buildPairResults } from '../../utils/pairCatalog';
import { searchCoins } from '../../services/coingeckoApi';
import { cacheImage } from '../../services/coinImageCache';
import CoinIcon from './CoinIcon';

const EMPTY_SELECTED = [];
const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-1.5 text-[11px] text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function PairSearchMulti({
  selectedPairs = EMPTY_SELECTED, onAdd, includeMarkets = false, placeholder,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [custom, setCustom] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const hint = placeholder || (includeMarkets ? 'חפש זוג... (XAUUSD, EUR...)' : 'חפש מטבע...');

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

  // Filter local COINS + search CoinGecko API.
  // With markets on, an empty query lists the CFD/forex symbols (not every coin).
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim().toUpperCase();
    if (!includeMarkets && !q) {
      setResults([]);
      setCustom(null);
      return;
    }

    const apply = (remote) => {
      const next = buildPairResults({
        query,
        selected: selectedPairs,
        includeMarkets,
        remote,
        emptyIsMarketsOnly: true,
      });
      setResults(next.rows);
      setCustom(next.custom);
    };
    apply([]);

    if (q.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const searchQuery = q.replace(/USDT$/i, '');
          const apiResults = await searchCoins(searchQuery);
          const localSymbols = new Set(COINS.map((c) => c.symbol));
          const remote = apiResults
            .filter((r) => r.symbol && !localSymbols.has(r.symbol) && !selectedPairs.includes(`${r.symbol}USDT`))
            .map((r) => {
              if (r.thumb) cacheImage(r.symbol, r.thumb);
              return r;
            });
          apply(remote);
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
  }, [query, isOpen, selectedPairs, includeMarkets]);

  const handleSelect = (item) => {
    onAdd(item.pair);
    setQuery('');
    setResults([]);
    setCustom(null);
  };

  const showList = isOpen && (results.length > 0 || custom);
  const showEmpty = isOpen && !loading && !custom && results.length === 0 && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (custom) {
              e.preventDefault();
              handleSelect(custom);
            } else if (results[0]) {
              e.preventDefault();
              handleSelect(results[0]);
            }
          }}
          className={`${inputClass} pr-7`}
          placeholder={hint}
        />
      </div>

      {/* Dropdown opens UPWARD to avoid being clipped by modal overflow */}
      {showList && (
        <div className="absolute z-[60] bottom-full mb-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-44 overflow-y-auto">
          {custom && (
            <button
              type="button"
              data-testid="pair-custom"
              onClick={() => handleSelect(custom)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary bg-accent-primary/5"
            >
              <Plus className="w-3.5 h-3.5 text-accent-primary" />
              <span className="text-xs font-medium text-accent-primary" dir="ltr">{custom.pair}</span>
              <span className="text-[10px] text-text-muted">השתמש בזוג מותאם</span>
            </button>
          )}
          {results.map((item) => (
            <button
              key={item.pair}
              type="button"
              data-testid="pair-option"
              data-pair={item.pair}
              onClick={() => handleSelect(item)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-right hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <CoinIcon pair={item.pair} className="w-4 h-4" />
              <span className="text-xs font-medium text-text-primary" dir="ltr">{item.pair}</span>
              <span className="text-[10px] text-text-muted truncate">{item.name}</span>
            </button>
          ))}
          {loading && (
            <div className="px-2.5 py-1.5 text-[10px] text-text-muted text-center border-t border-border-primary">מחפש...</div>
          )}
        </div>
      )}
      {showEmpty && (
        <div className="absolute z-[60] bottom-full mb-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl">
          <div className="px-2.5 py-1.5 text-[10px] text-text-muted text-center">לא נמצאו תוצאות</div>
        </div>
      )}
    </div>
  );
}
