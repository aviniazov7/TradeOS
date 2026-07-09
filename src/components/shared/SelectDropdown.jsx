import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * SelectDropdown - custom dropdown replacement for native <select>.
 *
 * The menu is rendered in a portal with a backdrop so it always floats above
 * page content — animated lists (framer-motion transforms) create their own
 * stacking contexts that would otherwise paint over an absolutely-positioned
 * menu.
 *
 * Props:
 *   value       - string, current selected value
 *   onChange     - (value: string) => void
 *   options      - Array<{ value: string, label: string }>
 *   placeholder  - string, shown when no value selected
 *   label        - optional label text
 *   allowClear   - boolean, show clear option (default false)
 *   compact      - boolean, smaller size for inline/filter use (default false)
 *   className        - optional extra classes for the root wrapper
 *   triggerClassName - optional extra classes for the trigger button (e.g. h-full
 *                      to match sibling buttons when inlined in an action row)
 */
export default function SelectDropdown({ value, onChange, options = [], placeholder = 'בחר...', label, allowClear = false, compact = false, className = '', triggerClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Open upward when there isn't enough room below the trigger.
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 240 && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? null : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.max(140, (openUp ? r.top : spaceBelow) - 16),
    });
  };

  useLayoutEffect(() => {
    if (open) updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const displayText = selectedOption?.label || placeholder;
  const hasValue = !!value;

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  const btnClass = compact
    ? 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary transition-colors text-right flex items-center justify-between cursor-pointer'
    : 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right flex items-center justify-between cursor-pointer';

  const itemClass = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`relative ${className}`}>
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`${btnClass} ${triggerClassName}`}
      >
        <span className={`truncate ${hasValue ? 'text-text-primary' : 'text-text-muted'}`}>{displayText}</span>
        <svg className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform mr-1 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
            style={{ left: pos.left, width: pos.width, top: pos.top ?? undefined, bottom: pos.bottom ?? undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto" style={{ maxHeight: pos.maxHeight }}>
              {allowClear && hasValue && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className={`w-full flex items-center px-3 py-2 ${itemClass} text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer text-right`}
                >
                  {placeholder}
                </button>
              )}
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={`w-full flex items-center px-3 py-2 ${itemClass} transition-colors cursor-pointer text-right ${
                    value === o.value ? 'bg-accent-primary/10 text-accent-primary font-medium' : 'text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
