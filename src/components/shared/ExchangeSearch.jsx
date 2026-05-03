import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { EXCHANGES } from '../../utils/constants';
import ExchangeLogo from './ExchangeLogo';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

export default function ExchangeSearch({ value, onChange, label = 'בורסה / ברוקר / תיק ממומן', className = '' }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayLabel = EXCHANGES.find((e) => e.value === value)?.label || value;

  const filtered = EXCHANGES.filter((ex) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return ex.label.toLowerCase().includes(q) || ex.value.toLowerCase().includes(q);
  });

  const handleSelect = (ex) => {
    onChange(ex.value);
    setQuery('');
    setIsOpen(false);
  };

  const handleCustomSubmit = () => {
    const trimmed = query.trim();
    if (trimmed) {
      const match = EXCHANGES.find((e) => e.label.toLowerCase() === trimmed.toLowerCase());
      onChange(match ? match.value : trimmed);
    }
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomSubmit();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="block text-xs text-text-muted mb-1.5">{label}</label>}

      {value && !isOpen ? (
        <div className={`${inputClass} flex items-center justify-between cursor-pointer`} onClick={() => setIsOpen(true)}>
          <div className="flex items-center gap-2">
            <ExchangeLogo exchange={value} size="w-4 h-4" />
            <span className="truncate">{displayLabel}</span>
          </div>
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
            onKeyDown={handleKeyDown}
            className={`${inputClass} pr-8`}
            placeholder="חפש בורסה / ברוקר / תיק ממומן..."
            autoFocus={isOpen}
          />
        </div>
      )}

      {isOpen && (() => {
        const exchanges = filtered.filter((e) => e.type === 'exchange' || !e.type);
        const brokers = filtered.filter((e) => e.type === 'broker');
        const props = filtered.filter((e) => e.type === 'prop');
        return (
          <div className="absolute z-50 top-full mt-1 w-full bg-bg-overlay border border-border-primary rounded-lg shadow-xl max-h-56 overflow-y-auto">
            {exchanges.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-bg-tertiary/50 sticky top-0">בורסות</div>
                {exchanges.map((ex) => (
                  <button
                    key={ex.value}
                    type="button"
                    onClick={() => handleSelect(ex)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer ${
                      value === ex.value ? 'bg-accent-primary/10' : ''
                    }`}
                  >
                    <ExchangeLogo exchange={ex.value} size="w-5 h-5" />
                    <span className="text-sm font-medium text-text-primary">{ex.label}</span>
                  </button>
                ))}
              </>
            )}
            {brokers.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-bg-tertiary/50 sticky top-0">ברוקרים</div>
                {brokers.map((ex) => (
                  <button
                    key={ex.value}
                    type="button"
                    onClick={() => handleSelect(ex)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer ${
                      value === ex.value ? 'bg-accent-primary/10' : ''
                    }`}
                  >
                    <ExchangeLogo exchange={ex.value} size="w-5 h-5" />
                    <span className="text-sm font-medium text-text-primary">{ex.label}</span>
                  </button>
                ))}
              </>
            )}
            {props.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-bg-tertiary/50 sticky top-0">תיקים ממומנים</div>
                {props.map((ex) => (
                  <button
                    key={ex.value}
                    type="button"
                    onClick={() => handleSelect(ex)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer ${
                      value === ex.value ? 'bg-accent-primary/10' : ''
                    }`}
                  >
                    <ExchangeLogo exchange={ex.value} size="w-5 h-5" />
                    <span className="text-sm font-medium text-text-primary">{ex.label}</span>
                  </button>
                ))}
              </>
            )}
            {query.trim() && !filtered.some((e) => e.label.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-bg-tertiary transition-colors cursor-pointer border-t border-border-primary"
              >
                <ExchangeLogo exchange={query.trim()} size="w-5 h-5" />
                <span className="text-sm text-accent-primary">הוסף "{query.trim()}"</span>
              </button>
            )}
            {filtered.length === 0 && !query.trim() && (
              <div className="px-3 py-2 text-xs text-text-muted text-center">אין תוצאות</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
