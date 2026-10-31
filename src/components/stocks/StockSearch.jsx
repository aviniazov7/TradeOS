import { useState, useEffect, useRef } from 'react';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { searchStocks } from '../../services/stocksApi';
import { stockSymbol } from '../../utils/stocks';
import StockLogo from './StockLogo';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

// Ticker picker for stock journals: popular names first, then any listing
// Yahoo knows (US, TASE as XXX.TA, Europe). Shows the company logo and name.
export default function StockSearch({ value, onChange, label = 'מניה', className = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useCloseOnEscape(isOpen, () => setIsOpen(false));

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search; the controller drops answers to queries already typed over.
  useEffect(() => {
    if (!isOpen) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const list = await searchStocks(query, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) { setResults(list); setLoading(false); }
    }, query.trim() ? 250 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, isOpen]);

  const pick = (symbol) => {
    onChange(stockSymbol(symbol));
    setQuery('');
    setIsOpen(false);
  };

  const typed = stockSymbol(query);
  const showCustom = /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(typed) && !results.some((r) => r.symbol === typed);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}

      {value && !isOpen ? (
        <div className={`${inputClass} flex items-center justify-between gap-2 cursor-pointer`} onClick={() => setIsOpen(true)}>
          <span className="flex items-center gap-2 min-w-0">
            <StockLogo symbol={value} className="w-5 h-5" />
            <span className="font-semibold truncate" dir="ltr">{value}</span>
          </span>
          <button type="button" aria-label="נקה מניה"
            onClick={(e) => { e.stopPropagation(); onChange(''); setIsOpen(true); }}
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
            placeholder="חפש מניה... (AAPL, Tesla, TEVA)"
            autoFocus={isOpen}
          />
        </div>
      )}

      {isOpen && (
        <div data-popover="" className="absolute z-50 top-full mt-1 w-full min-w-[16rem] bg-bg-overlay border border-border-primary rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {showCustom && (
            <button type="button" onClick={() => pick(typed)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-b border-border-primary bg-accent-primary/5">
              <Plus className="w-4 h-4 text-accent-hover" />
              <span className="text-sm font-semibold text-accent-hover" dir="ltr">{typed}</span>
              <span className="text-xs text-text-muted">השתמש בסימול הזה</span>
            </button>
          )}
          {results.map((r) => (
            <button key={r.symbol} type="button" onClick={() => pick(r.symbol)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer ${r.symbol === value ? 'bg-accent-primary/8' : ''}`}>
              <StockLogo symbol={r.symbol} className="w-6 h-6" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-text-primary" dir="ltr">{r.symbol}</span>
                  {r.type === 'ETF' && <span className="text-[9px] font-bold px-1 py-px rounded bg-sky-500/15 text-sky-300">ETF</span>}
                </span>
                <span className="block text-[11px] text-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>
                  {r.name}{r.exchange ? ` · ${r.exchange}` : ''}
                </span>
              </span>
            </button>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-text-muted border-t border-border-primary">
              <Loader2 className="w-3 h-3 animate-spin" /> מחפש...
            </div>
          )}
          {!loading && !results.length && !showCustom && (
            <div className="px-3 py-3 text-xs text-text-muted text-center">לא נמצאו מניות</div>
          )}
        </div>
      )}
    </div>
  );
}
