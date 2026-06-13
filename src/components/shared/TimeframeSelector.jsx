import { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, Settings2 } from 'lucide-react';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';

/**
 * TimeframeSelector - custom dropdown for selecting timeframes.
 *
 * Props:
 *   value       - string (single) or string[] (multi)
 *   onChange     - (value) => void
 *   timeframes   - string[], available timeframes (from hook)
 *   onAdd        - (name: string) => void, add custom timeframe
 *   onRemove     - (name: string) => void, remove timeframe
 *   multi       - boolean, default false
 *   label       - optional label text
 */
export default function TimeframeSelector({ value, onChange, timeframes, onAdd, onRemove, multi = false, label }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const [managing, setManaging] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = multi ? (value || []) : value;
  const allOptions = timeframes || [];

  const displayText = multi
    ? (selected.length > 0 ? selected.join(', ') : 'בחר...')
    : (selected || 'בחר...');

  const hasValue = multi ? selected.length > 0 : !!selected;

  useEffect(() => {
    if (!open) { setManaging(false); setAdding(false); setCustom(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleSelect = (tf) => {
    if (multi) {
      onChange(selected.includes(tf) ? selected.filter((t) => t !== tf) : [...selected, tf]);
    } else {
      onChange(tf);
      setOpen(false);
    }
  };

  const handleAddCustom = () => {
    const t = custom.trim();
    if (!t) return;
    onAdd?.(t);
    if (multi) {
      if (!selected.includes(t)) onChange([...selected, t]);
    } else {
      onChange(t);
      setOpen(false);
    }
    setCustom('');
    setAdding(false);
  };

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="block text-xs text-text-muted mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex items-center justify-between cursor-pointer`}
      >
        <span className={`truncate ${hasValue ? 'text-text-primary' : 'text-text-muted'}`}>{displayText}</span>
        <svg className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 left-0 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden">
          {managing ? (
            <>
              <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                {allOptions.map((tf) => (
                  <div key={tf} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-tertiary transition-colors">
                    <span className="text-xs text-text-primary">{tf}</span>
                    <button type="button" onClick={() => onRemove?.(tf)} className="p-0.5 text-text-muted hover:text-loss transition-colors cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {allOptions.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-2">אין טיימפריימים</p>
                )}
              </div>
              <div className="border-t border-border-primary">
                <button
                  type="button"
                  onClick={() => setManaging(false)}
                  className="w-full text-center text-xs text-accent-primary hover:bg-bg-tertiary py-2 cursor-pointer transition-colors"
                >
                  סגור ניהול
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {allOptions.map((tf) => {
                  const isSelected = multi ? selected.includes(tf) : selected === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => handleSelect(tf)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer text-right ${
                        isSelected && !multi ? 'bg-accent-primary/10' : 'hover:bg-bg-tertiary'
                      }`}
                    >
                      <span className={isSelected ? 'text-accent-primary font-medium' : 'text-text-primary'}>{tf}</span>
                      {multi && (
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-primary'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-black" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-border-primary">
                {adding ? (
                  <div className="flex items-center gap-1 p-2">
                    <input
                      ref={inputRef}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
                      className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
                      placeholder="5m, 2H, 1D..."
                    />
                    <button type="button" onClick={handleAddCustom}
                      className="p-1.5 rounded-lg bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 cursor-pointer">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => { setAdding(false); setCustom(''); }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-loss cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="flex-1 flex items-center gap-1 px-3 py-2 text-sm text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> מותאם אישית
                    </button>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => setManaging(true)}
                        className="px-3 py-2 text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-r border-border-primary"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
