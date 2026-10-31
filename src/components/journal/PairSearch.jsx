import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { COINS } from '../../utils/constants';
import { buildPairResults } from '../../utils/pairCatalog';
import { searchCoins } from '../../services/coingeckoApi';
import { cacheImage, clearCachedImage } from '../../services/coinImageCache';
import CoinIcon from '../shared/CoinIcon';

const EMPTY_SAVED = [];
const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function PairSearch({
  value, onChange, label = 'זוג', className = '',
  includeMarkets = false, savedPairs = undefined, placeholder,
}) {
  const saved = savedPairs || EMPTY_SAVED;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [custom, setCustom] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const hint = placeholder || (includeMarkets ? 'חפש זוג... (BTC, XAUUSD...)' : 'חפש זוג... (BTC, SOL...)');

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

  // Filter local pairs + search CoinGecko API
  useEffect(() => {
    if (!isOpen) return;

    const q = query.trim().toUpperCase();
    const apply = (remote) => {
      const next = buildPairResults({ query, includeMarkets, saved, remote });
      setResults(next.rows);
      setCustom(next.custom);
    };
    apply([]);

    if (q.length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const searchQuery = q.replace(/USDT$/i, '');
          const apiResults = await searchCoins(searchQuery);
          const localSymbols = new Set(COINS.map((c) => c.symbol));
          const remote = apiResults
            .filter((r) => r.symbol && !localSymbols.has(r.symbol))
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
  }, [query, isOpen, includeMarkets, saved]);

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
          <span className="truncate" dir="ltr">{value}</span>
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
            className={`${inputClass} pr-8`}
            placeholder={hint}
            autoFocus={isOpen && !!value}
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {custom && (
            <button
              type="button"
              data-testid="pair-custom"
              onClick={() => { if (!includeMarkets) clearCachedImage(custom.symbol); handleSelect(custom); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary bg-accent-primary/5"
            >
              <Plus className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium text-accent-primary" dir="ltr">{custom.pair}</span>
              <span className="text-xs text-text-muted">השתמש בזוג מותאם</span>
            </button>
          )}
          {loading && results.length === 0 && !custom && (
            <div className="px-3 py-2 text-xs text-text-muted text-center">מחפש...</div>
          )}
          {results.map((item) => (
            <button
              key={item.pair}
              type="button"
              data-testid="pair-option"
              data-pair={item.pair}
              onClick={() => handleSelect(item)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <CoinIcon pair={item.pair} className="w-5 h-5" />
              <span className="text-sm font-medium text-text-primary" dir="ltr">{item.pair}</span>
              <span className="text-xs text-text-muted truncate">{item.name}</span>
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
