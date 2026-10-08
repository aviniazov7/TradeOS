import { Check } from 'lucide-react';
import { focusCls } from './journalUi';

// Read-only pieces of the completed-journal summary, plus the morning rules
// checklist (a list of long labels, so rows rather than chips).

// Small label/value tiles: "מוכנות 7/10", "שינה טובה"…
export function FactGrid({ facts }) {
  const shown = facts.filter((f) => f && f.value);
  if (!shown.length) return null;
  return (
    <dl className={`grid grid-cols-2 gap-2 ${shown.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
      {shown.map((f) => (
        <div key={f.label} className="rounded-xl bg-bg-tertiary border border-border-primary px-3 py-2.5 min-w-0">
          <dt className="text-[11px] text-text-muted">{f.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text-primary truncate">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// One written answer. `primary` sets it apart (the intention / the lesson).
export function Answer({ label, text, primary = false }) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return null;
  return (
    <div className={primary ? 'rounded-xl border border-accent-primary/30 bg-accent-primary/8 px-3.5 py-3' : ''}>
      <p className={`text-[11px] font-medium mb-1 ${primary ? 'text-accent-hover' : 'text-text-muted'}`}>{label}</p>
      <p className={`whitespace-pre-wrap break-words ${primary ? 'text-base font-semibold text-text-primary' : 'text-sm text-text-primary'}`}>{value}</p>
    </div>
  );
}

export function SummaryStack({ children }) {
  return <div className="space-y-4">{children}</div>;
}

// Rules to confirm before trading. Each row is a checkbox button.
export function RulesChecklist({ rules, checked, onChange, labelledBy }) {
  const set = new Set(checked);
  const all = rules.length > 0 && rules.every((r) => set.has(r));
  const toggle = (r) => onChange(set.has(r) ? checked.filter((x) => x !== r) : [...checked, r]);
  return (
    <div>
      <ul className="space-y-1.5" aria-labelledby={labelledBy}>
        {rules.map((r) => {
          const on = set.has(r);
          return (
            <li key={r}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(r)}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-right text-sm transition-colors cursor-pointer ${focusCls} ${
                  on
                    ? 'border-accent-primary/50 bg-accent-primary/8 text-text-primary'
                    : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-border-hover hover:text-text-primary'
                }`}
              >
                <span
                  className={`w-5 h-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${
                    on ? 'bg-accent-primary border-accent-primary' : 'border-text-muted'
                  }`}
                  aria-hidden
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 break-words">{r}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {rules.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(all ? [] : [...rules])}
          className={`mt-2 text-xs font-medium text-accent-primary hover:text-accent-hover cursor-pointer rounded ${focusCls}`}
        >
          {all ? 'נקה סימונים' : 'אני מתחייב לכל הכללים'}
        </button>
      )}
    </div>
  );
}
