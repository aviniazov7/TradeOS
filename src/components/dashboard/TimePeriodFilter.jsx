import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { TIME_PERIODS } from '../../utils/constants';

export default function TimePeriodFilter({ value, onChange, compact, dropdown }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const currentLabel = TIME_PERIODS.find((p) => p.key === value)?.label || value;

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (dropdown) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-9 inline-flex items-center gap-1 px-3 bg-bg-tertiary rounded-lg text-[11px] font-medium text-accent-primary cursor-pointer transition-colors"
        >
          {currentLabel}
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 bg-bg-overlay border border-border-primary rounded-lg shadow-xl z-50 min-w-[100px] overflow-hidden">
            {TIME_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => { onChange(p.key); setOpen(false); }}
                className={`block w-full text-right px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  value === p.key
                    ? 'bg-accent-primary/15 text-accent-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`h-9 inline-flex items-center gap-0.5 bg-bg-tertiary rounded-lg ${compact ? 'px-1' : 'px-1'}`}>
      {TIME_PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-md font-medium transition-colors cursor-pointer ${
            compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          } ${
            value === p.key
              ? 'bg-accent-primary text-black'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
