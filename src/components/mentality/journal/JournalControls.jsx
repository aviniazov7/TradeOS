import { useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { focusCls } from './journalUi';

// The journal's form controls: chips, segmented choices, a 1–10 scale, labelled
// fields, a numbered section panel and an "optional extras" disclosure. One
// accent colour for every selected state; keyboard-friendly (radio groups use
// a roving tab stop and the arrow keys, RTL-aware).

// Arrow-key handling shared by every radio group. In RTL the visual "next"
// item sits to the LEFT, so ArrowLeft moves forward.
function onRadioKeyDown(e, index, count, choose) {
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
  const step = {
    ArrowDown: 1, ArrowUp: -1, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, Home: 'first', End: 'last',
  }[e.key];
  if (step === undefined) return;
  e.preventDefault();
  const next = step === 'first' ? 0 : step === 'last' ? count - 1 : (index + step + count) % count;
  const radios = e.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]');
  radios?.[next]?.focus();
  choose(next);
}

// Single choice (type="radio") or several (type="multi", optional `max`).
//   variant="chips"     — wrapping pills, optional small icon per option
//   variant="segmented" — one even row, for 2–4 short options
export function OptionGroup({
  options, value, onChange, type = 'radio', max, variant = 'chips', allowClear = false, ariaLabel, ariaLabelledBy, className = '',
}) {
  const multi = type === 'multi';
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const isOn = (v) => (multi ? selected.includes(v) : selected === v);
  const atMax = multi && max && selected.length >= max;
  const tabIndexOf = (i) => {
    if (multi) return 0;
    const cur = options.findIndex((o) => o.value === selected);
    return (cur === -1 ? i === 0 : i === cur) ? 0 : -1;
  };

  const toggle = (v) => {
    if (multi) {
      if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
      else if (!atMax) onChange([...selected, v]);
      else if (max === 1) onChange([v]);
      return;
    }
    onChange(allowClear && selected === v ? '' : v);
  };

  const seg = variant === 'segmented';
  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={seg
        ? `grid gap-1 p-1 rounded-xl bg-bg-tertiary border border-border-primary sm:max-w-md ${className}`
        : `flex flex-wrap gap-2 ${className}`}
      style={seg ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o, i) => {
        const on = isOn(o.value);
        const blocked = multi && !on && atMax && max !== 1;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            aria-disabled={blocked || undefined}
            tabIndex={tabIndexOf(i)}
            onClick={() => toggle(o.value)}
            onKeyDown={multi ? undefined : (e) => onRadioKeyDown(e, i, options.length, (n) => onChange(options[n].value))}
            className={seg
              ? `h-9 min-w-0 px-2 rounded-lg text-sm font-medium truncate transition-colors cursor-pointer ${focusCls} ${
                on
                  ? 'bg-accent-primary/15 text-text-primary shadow-[inset_0_0_0_1px_var(--color-accent-primary)]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`
              : `h-9 inline-flex items-center gap-1.5 px-3 rounded-full border text-sm transition-colors cursor-pointer ${focusCls} ${
                on
                  ? 'border-accent-primary bg-accent-primary/12 text-text-primary font-semibold'
                  : blocked
                    ? 'border-border-primary bg-bg-tertiary text-text-muted opacity-50 cursor-not-allowed'
                    : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-border-hover hover:text-text-primary'
              }`}
          >
            {!seg && (on
              ? <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" aria-hidden />
              : Icon && <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden />)}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Compact 1–10 scale: ten even cells, the chosen one filled, the ones below it
// tinted so the level reads at a glance.
export function RatingScale({ value, onChange, lowLabel, highLabel, ariaLabel, ariaLabelledBy }) {
  const cells = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div>
      <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className="grid grid-cols-10 gap-1">
        {cells.map((n, i) => {
          const on = value === n;
          const below = value != null && n < value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} מתוך 10`}
              tabIndex={(value == null ? n === 1 : on) ? 0 : -1}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onRadioKeyDown(e, i, 10, (k) => onChange(k + 1))}
              className={`h-10 min-w-0 rounded-lg border text-sm font-semibold num-mono transition-colors cursor-pointer ${focusCls} ${
                on
                  ? 'bg-accent-primary border-accent-primary text-white'
                  : below
                    ? 'bg-accent-primary/12 border-accent-primary/25 text-text-primary'
                    : 'bg-bg-tertiary border-border-primary text-text-secondary hover:border-border-hover hover:text-text-primary'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between mt-1.5 text-[11px] text-text-muted" aria-hidden>
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

// A labelled field. Children may be a function receiving { id, labelId } so
// inputs can be wired to the label.
export function Field({ label, hint, required, optional, children, className = '' }) {
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <label id={labelId} htmlFor={id} className="text-sm font-semibold text-text-primary">
          {label}
          {required && <span className="text-accent-primary ms-1" aria-hidden>*</span>}
          {required && <span className="sr-only"> (חובה)</span>}
        </label>
        {optional && <span className="text-[11px] text-text-muted shrink-0">רשות</span>}
      </div>
      {typeof children === 'function' ? children({ id, labelId }) : children}
      {hint && <p className="mt-1.5 text-xs text-text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

// One numbered step of the journal. `done` turns the number into a check.
export function JournalSection({ id, n, title, subtitle, done, optional, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-bg-secondary border border-border-primary rounded-2xl p-4 md:p-5 scroll-mt-20">
      <header className="flex items-start gap-3 mb-4">
        <span
          className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-bold num-mono border transition-colors ${
            done ? 'bg-accent-primary border-accent-primary text-white' : 'bg-bg-tertiary border-border-primary text-text-secondary'
          }`}
          aria-hidden
        >
          {done ? <Check className="w-3.5 h-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-base font-bold text-text-primary leading-tight">
            {title}
            {done && <span className="sr-only"> (הושלם)</span>}
          </h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {optional && <span className="text-[11px] text-text-muted shrink-0 mt-1">רשות</span>}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// Optional extras, collapsed by default (opens by itself when it holds data).
export function Disclosure({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="border-t border-border-primary pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 py-1 text-sm font-medium text-text-secondary hover:text-text-primary cursor-pointer rounded-lg ${focusCls}`}
      >
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div id={id} className="pt-3 space-y-4">{children}</div>}
    </div>
  );
}

// A small quoted note from another journal (yesterday's lesson in the morning,
// this morning's intention in the evening).
export function ContextNote({ icon: Icon, label, text }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-bg-tertiary border border-border-primary px-3 py-2.5">
      {Icon && <Icon className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" aria-hidden />}
      <p className="text-xs text-text-secondary leading-relaxed min-w-0">
        <span className="font-semibold text-text-primary">{label}: </span>
        <span className="break-words">{text}</span>
      </p>
    </div>
  );
}
