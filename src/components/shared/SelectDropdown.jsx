import { useState, useRef, useEffect } from 'react';

/**
 * SelectDropdown - custom dropdown replacement for native <select>.
 *
 * Props:
 *   value       - string, current selected value
 *   onChange     - (value: string) => void
 *   options      - Array<{ value: string, label: string }>
 *   placeholder  - string, shown when no value selected
 *   label        - optional label text
 *   allowClear   - boolean, show clear option (default false)
 *   compact      - boolean, smaller size for inline/filter use (default false)
 */
export default function SelectDropdown({ value, onChange, options = [], placeholder = 'בחר...', label, allowClear = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
    <div className="relative" ref={ref}>
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={btnClass}
      >
        <span className={`truncate ${hasValue ? 'text-text-primary' : 'text-text-muted'}`}>{displayText}</span>
        <svg className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform mr-1 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 left-0 bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
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
      )}
    </div>
  );
}
