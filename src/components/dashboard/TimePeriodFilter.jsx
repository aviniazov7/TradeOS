import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, Check } from 'lucide-react';

// Rolling windows (see filterTradesByPeriod): the label says exactly what is
// counted, so "שבוע" is never read as "this calendar week".
const PERIODS = [
  { key: 'week', label: '7 הימים האחרונים', short: '7 ימים' },
  { key: 'month', label: 'החודש האחרון', short: 'חודש' },
  { key: 'year', label: 'השנה האחרונה', short: 'שנה' },
  { key: 'all', label: 'כל הזמן', short: 'כל הזמן' },
];

// One compact button (same height as the header's icon buttons) that opens a
// short menu. The menu lives in a portal so a header card with overflow
// clipping, or an animated list, can never cut it off.
export default function TimePeriodFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const current = PERIODS.find((p) => p.key === value) || PERIODS[3];

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Anchor the menu's left edge to the button's left edge (RTL page: the
    // button sits at the left end of the header), clamped to the viewport.
    const width = 200;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left, width });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!open) place(); setOpen((v) => !v); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="תקופה"
        className={`h-11 shrink-0 inline-flex items-center gap-2 px-3 sm:px-3.5 rounded-xl border bg-bg-tertiary text-sm font-semibold transition-colors cursor-pointer ${
          open ? 'border-accent-primary/50 text-text-primary' : 'border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover'
        }`}
      >
        <CalendarDays className="w-[18px] h-[18px] text-accent-hover" />
        <span className="whitespace-nowrap">{current.short}</span>
        <ChevronDown className={`hidden sm:block w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div
            role="listbox"
            aria-label="תקופה"
            dir="rtl"
            className="absolute rounded-xl border border-border-primary bg-bg-overlay shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-1"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onClick={(e) => e.stopPropagation()}
          >
            {PERIODS.map((p) => {
              const on = p.key === current.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => { onChange(p.key); setOpen(false); }}
                  className={`w-full h-10 flex items-center justify-between gap-2 px-3 rounded-lg text-sm text-right transition-colors cursor-pointer ${
                    on ? 'bg-accent-primary/12 text-accent-hover font-semibold' : 'text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  {p.label}
                  {on && <Check className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
