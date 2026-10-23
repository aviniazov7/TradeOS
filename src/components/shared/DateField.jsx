import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { localDayKey } from '../../utils/calculations';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
// Sunday first — the Hebrew week. The grid is RTL, so Sunday sits on the right.
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const CHIP_TRIGGER = 'w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap outline-none focus-visible:border-accent-primary/50 hover:border-border-hover inline-flex items-center justify-between gap-1.5';
const FIELD_TRIGGER = 'w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer outline-none focus:border-accent-primary inline-flex items-center justify-between gap-2 text-right';

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function isAllowed(iso, min, max) {
  if (!parseDay(iso)) return false;
  if (parseDay(min) && iso < min) return false;
  if (parseDay(max) && iso > max) return false;
  return true;
}

function formatDisplay(iso) {
  const date = parseDay(iso);
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

function monthCells(view) {
  const first = startOfMonth(view);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function measure(el) {
  const rect = el.getBoundingClientRect();
  const width = 292;
  const estimatedHeight = 360;
  const margin = 8;
  const rtl = (document.documentElement.dir || document.dir || 'rtl') !== 'ltr';
  let left = rtl ? rect.right - width : rect.left;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
  return {
    left,
    width,
    top: openUp ? undefined : rect.bottom + 4,
    bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
  };
}

/**
 * Themed date field. `value` / `onChange` stay `YYYY-MM-DD` or `''` — the same
 * contract as the native input this replaces, so journal filtering is unchanged.
 *
 * `size="compact"` matches the journal filter chips (px-3 py-1.5 text-xs).
 * `size="field"` matches a form text input (px-3 py-2 text-sm).
 */
export default function DateField({
  value = '',
  onChange,
  label,
  placeholder,
  min,
  max,
  size = 'compact',
  className = '',
  id,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [view, setView] = useState(() => startOfMonth(parseDay(value) || new Date()));
  const [cursor, setCursor] = useState('');
  const btnRef = useRef(null);
  const cursorRef = useRef('');
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  const reactId = useId();
  const buttonId = id || reactId;
  const dialogId = `${buttonId}-dialog`;

  const selected = parseDay(value) ? value : '';
  const emptyLabel = placeholder || label || 'בחר תאריך';
  const compact = size !== 'field';

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };

  const openPicker = () => {
    const base = parseDay(value) || new Date();
    setView(startOfMonth(base));
    setCursor(localDayKey(base));
    if (btnRef.current) setPos(measure(btnRef.current));
    setOpen(true);
  };

  const pick = (iso) => {
    if (!isAllowed(iso, min, max)) return;
    onChangeRef.current?.(iso);
    close();
  };

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => {
      if (btnRef.current) setPos(measure(btnRef.current));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      // RTL calendar: Sunday is on the right, so ArrowRight walks backward in time.
      const delta = e.key === 'ArrowRight' ? -1
        : e.key === 'ArrowLeft' ? 1
        : e.key === 'ArrowUp' ? -7
        : e.key === 'ArrowDown' ? 7
        : 0;
      if (delta) {
        e.preventDefault();
        const base = parseDay(cursorRef.current) || parseDay(value) || new Date();
        const next = addDays(base, delta);
        setView(startOfMonth(next));
        setCursor(localDayKey(next));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const iso = cursorRef.current;
        if (isAllowed(iso, min, max)) {
          onChangeRef.current?.(iso);
          close();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, min, max, value]);

  useEffect(() => {
    if (!open || !cursor) return undefined;
    const el = document.querySelector(`[data-date-cursor="${buttonId}"][data-iso="${cursor}"]`);
    try { el?.focus({ preventScroll: true }); } catch { /* happy-dom */ }
    return undefined;
  }, [open, cursor, buttonId, view]);

  const cells = monthCells(view);
  const todayIso = localDayKey(new Date());
  const title = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const triggerClass = compact ? CHIP_TRIGGER : FIELD_TRIGGER;

  return (
    <div className={`relative min-w-0 ${compact ? '' : 'w-full'} ${className}`}>
      <button
        ref={btnRef}
        id={buttonId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={label || emptyLabel}
        onClick={() => (open ? close() : openPicker())}
        className={triggerClass}
      >
        {selected ? (
          <bdi dir="ltr" className="num-mono truncate text-text-primary">{formatDisplay(selected)}</bdi>
        ) : (
          <span className="truncate text-text-muted">{emptyLabel}</span>
        )}
        <Calendar className={`shrink-0 text-text-muted ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[100]" onClick={close}>
          <div
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-label={label || 'בחירת תאריך'}
            dir="rtl"
            className="absolute bg-bg-overlay border border-border-primary rounded-2xl shadow-[0_25px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl font-sans p-3"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                aria-label="חודש קודם"
                onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
                className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/10 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="text-[15px] font-semibold text-text-primary" aria-live="polite">
                {MONTHS[view.getMonth()]} <bdi dir="ltr" className="num-mono">{view.getFullYear()}</bdi>
              </div>
              <button
                type="button"
                aria-label="חודש הבא"
                onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
                className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/10 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div role="grid" aria-label={title}>
              <div role="row" className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((name) => (
                  <div key={name} role="columnheader" className="h-8 grid place-items-center text-xs font-medium text-text-muted">
                    {name}
                  </div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} role="row" className="grid grid-cols-7">
                  {week.map((date) => {
                    const iso = localDayKey(date);
                    const inMonth = date.getMonth() === view.getMonth();
                    const allowed = isAllowed(iso, min, max);
                    const isSelected = iso === selected;
                    const isToday = iso === todayIso;
                    const isCursor = iso === cursor;
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        data-iso={iso}
                        data-date-cursor={buttonId}
                        data-today={isToday ? 'true' : undefined}
                        aria-selected={isSelected}
                        aria-disabled={!allowed}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={`${date.getDate()} ב${MONTHS[date.getMonth()]} ${date.getFullYear()}`}
                        disabled={!allowed}
                        tabIndex={isCursor ? 0 : -1}
                        onClick={() => pick(iso)}
                        className={`date-field-day w-9 h-9 rounded-[10px] text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-accent-primary text-black font-semibold'
                            : isToday
                              ? 'ring-1 ring-inset ring-accent-primary font-semibold text-text-primary hover:bg-white/10'
                              : inMonth
                                ? 'text-text-secondary hover:bg-white/10 hover:text-text-primary'
                                : 'text-text-muted/40 hover:bg-white/10 hover:text-text-primary'
                        }`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-2 pt-2 border-t border-border-primary">
              <button
                type="button"
                onClick={() => { onChangeRef.current?.(''); close(); }}
                disabled={!selected}
                className="w-full h-8 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                נקה
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
