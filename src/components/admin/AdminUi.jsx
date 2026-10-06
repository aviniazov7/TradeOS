import Card from '../shared/Card';

// Small building blocks shared by the admin tabs, so every panel, pill and
// meter looks the same.

// A titled section: title (+ optional count badge) on one side, an action on
// the other, content below.
export function Panel({ title, badge, action, className = '', bodyClassName = '', children }) {
  return (
    <Card className={`rounded-2xl p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[15px] font-bold text-text-primary truncate">{title}</h2>
            {badge}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export function Pill({ className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

// Thin progress bar. Turns amber from 70% and red from 90% unless a fixed
// colour class is given.
export function Meter({ pct, className = '', color }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = color || (p >= 90 ? 'bg-loss' : p >= 70 ? 'bg-amber-500' : 'bg-accent-primary');
  return (
    <div className={`h-1.5 rounded-full bg-bg-tertiary overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${p > 0 ? Math.max(p, 2) : 0}%` }} />
    </div>
  );
}

const GRADIENTS = [
  'from-blue-500 to-violet-500',
  'from-sky-500 to-emerald-500',
  'from-amber-500 to-rose-500',
  'from-violet-500 to-pink-500',
  'from-teal-500 to-blue-500',
  'from-indigo-500 to-sky-500',
];

// Photo when we have one, otherwise initials on a gradient picked from the id
// (stable per user).
export function Avatar({ user, size = 'w-9 h-9 text-xs' }) {
  if (user?.photoURL) {
    return <img src={user.photoURL} alt="" className={`${size} rounded-full object-cover shrink-0`} referrerPolicy="no-referrer" />;
  }
  const name = user?.displayName || user?.email || '?';
  const parts = name.trim().split(/\s+/);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  const seed = [...(user?.id || name)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={`${size} rounded-full bg-gradient-to-br ${GRADIENTS[seed % GRADIENTS.length]} text-white font-bold grid place-items-center shrink-0`}>
      {initials}
    </span>
  );
}

// Secondary button used inside panels (outline, 40px tall).
export const softBtn = 'h-10 px-4 whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-primary bg-bg-tertiary text-[13px] font-semibold text-text-primary hover:border-border-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
// Primary button (filled accent).
export const primaryBtn = 'h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
