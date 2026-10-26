import { Minus, Plus } from 'lucide-react';

/**
 * NumberStepper — a professional −/+ number control that replaces the browser's
 * native (and ugly) number spinner. Free typing is still allowed; the buttons
 * clamp to [min, max]. Value is kept as a string so empty input is possible.
 *
 * Props:
 *   value     - string | number
 *   onChange  - (next: string) => void
 *   min, max  - optional bounds (default min = 1)
 *   step      - increment (default 1)
 *   suffix    - optional small text shown inside the field (e.g. unit)
 */
export default function NumberStepper({ value, onChange, min = 1, max, step = 1, placeholder = '', suffix, className = '' }) {
  const places = (String(step).split('.')[1] || '').length;
  const clamp = (v) => {
    if (Number.isNaN(v)) return min ?? 0;
    if (max != null) v = Math.min(max, v);
    if (min != null) v = Math.max(min, v);
    if (places) v = Number(v.toFixed(places));
    return v;
  };
  const current = parseFloat(value);
  const bump = (dir) => onChange(String(clamp((Number.isNaN(current) ? (min ?? 0) : current) + dir * step)));

  return (
    <div className={`flex items-stretch bg-bg-tertiary border border-border-primary rounded-lg overflow-hidden focus-within:border-accent-primary transition-colors ${className}`}>
      <button type="button" tabIndex={-1} onClick={() => bump(-1)}
        className="px-2.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer flex items-center justify-center">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
        <input
          type="number"
          inputMode={places ? 'decimal' : 'numeric'}
          step={places ? 'any' : step}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-sm text-text-primary text-center outline-none py-2.5"
        />
        {suffix && <span className="text-[11px] text-text-muted pl-1 shrink-0">{suffix}</span>}
      </div>
      <button type="button" tabIndex={-1} onClick={() => bump(1)}
        className="px-2.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer flex items-center justify-center">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
