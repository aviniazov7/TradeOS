import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Check, Settings2 } from 'lucide-react';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';

/**
 * MultiSelector - dropdown that supports selecting multiple items, plus add custom.
 *
 * Props:
 *   values             - string[], current selected values
 *   onChange           - (newValues: string[]) => void
 *   options            - string[], available built-in options
 *   labels             - { [value]: string }, optional display labels for built-in options
 *   onAdd              - optional (name: string) => void, persist custom value
 *   onRemove           - optional (name: string) => void, remove option from list
 *   label              - optional label text
 *   addLabel           - text for the "add custom" button (default: "מותאם אישית")
 *   inputPlaceholder   - placeholder for add input (default: "שם...")
 *   emptyText          - text when no items (default: "אין פריטים")
 *   placeholder        - text when no selection (default: "בחר...")
 *   chipClass          - className for selected chips inside the trigger button
 */
export default function MultiSelector({
  values = [],
  onChange,
  options = [],
  labels = {},
  onAdd,
  onRemove,
  label,
  addLabel = 'מותאם אישית',
  inputPlaceholder = 'שם...',
  emptyText = 'אין פריטים',
  placeholder = 'בחר...',
  chipClass = 'bg-accent-primary text-black',
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const [box, setBox] = useState(null);

  // All options = built-in options + any custom selected values not in built-in
  const allOptions = [
    ...options,
    ...values.filter((v) => !options.includes(v)),
  ];

  useEffect(() => {
    if (!open) { setAdding(false); setManaging(false); setCustom(''); }
  }, [open]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 220 && r.top > spaceBelow;
    setBox({
      left: r.left,
      width: r.width,
      top: openUp ? null : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.max(140, Math.min(240, (openUp ? r.top : spaceBelow) - 12)),
    });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onReflow = () => place();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  // Escape closes this menu only. Capture + stopPropagation so a dialog
  // behind it (the trade ticket) stays open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const toggleValue = (v) => {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else {
      onChange([...values, v]);
    }
  };

  const removeFromSelection = (v) => {
    onChange(values.filter((x) => x !== v));
  };

  const handleAddCustom = () => {
    const t = custom.trim();
    if (!t) return;
    if (!values.includes(t)) {
      onChange([...values, t]);
    }
    onAdd?.(t);
    setCustom('');
    setAdding(false);
  };

  const labelOf = (v) => labels[v] || v;
  const hasSelection = values.length > 0;

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="block text-xs text-text-muted mb-1">{label}</label>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex items-center justify-between gap-2 cursor-pointer min-h-[40px]`}
      >
        {hasSelection ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {values.map((v) => (
              <span
                key={v}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${chipClass}`}
              >
                {labelOf(v)}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromSelection(v);
                  }}
                  className="cursor-pointer hover:opacity-70 inline-flex"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span className="truncate text-text-muted flex-1 text-right">{placeholder}</span>
        )}
        <svg className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && box && createPortal(
        <div className="fixed inset-0 z-[80]" data-popover="" onMouseDown={() => setOpen(false)}>
        <div
          className="bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
          style={{ position: 'fixed', left: box.left, width: box.width, top: box.top ?? undefined, bottom: box.bottom ?? undefined, maxHeight: box.maxHeight }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {managing ? (
            <>
              <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: Math.max(80, box.maxHeight - 44) }}>
                {allOptions.map((opt) => (
                  <div key={opt} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-tertiary transition-colors">
                    <span className="text-xs text-text-primary">{labelOf(opt)}</span>
                    <button type="button" onClick={() => onRemove?.(opt)} className="p-0.5 text-text-muted hover:text-loss transition-colors cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {allOptions.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-2">{emptyText}</p>
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
              <div className="overflow-y-auto" style={{ maxHeight: Math.max(80, box.maxHeight - 44) }}>
                {allOptions.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-3">{emptyText}</p>
                )}
                {allOptions.map((opt) => {
                  const isSelected = values.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleValue(opt)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer text-right ${
                        isSelected
                          ? 'bg-accent-primary/10 text-accent-primary font-medium'
                          : 'text-text-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      <span className="truncate">{labelOf(opt)}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
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
                      placeholder={inputPlaceholder}
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
                      <Plus className="w-3.5 h-3.5" /> {addLabel}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
