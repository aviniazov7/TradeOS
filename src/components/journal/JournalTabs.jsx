import { motion } from 'framer-motion';

const LABELS = {
  trades: 'עסקאות',
  analytics: 'ניתוחים',
  calendar: 'יומן חודשי',
  exchange: 'חיבור בורסאות',
};
// Narrow screens: shorter label so all four fit without scrolling on most phones.
const MOBILE_LABELS = { ...LABELS, exchange: 'בורסאות' };

const SIZES = {
  desktop: 'h-9 px-3.5 text-sm',
  mobile: 'px-2.5 py-1.5 text-xs flex-shrink-0',
};

// The journal's tab strip. One component for both breakpoints (they used to be
// two hand-copied sets of four buttons). The active pill slides between tabs;
// `variant` keeps a separate layoutId per instance since both are mounted and
// only one is visible via CSS.
export default function JournalTabs({ tabs, value, onChange, tradesCount, variant = 'desktop' }) {
  const labels = variant === 'mobile' ? MOBILE_LABELS : LABELS;
  return (
    <div role="tablist" className={`flex items-center ${variant === 'mobile' ? 'overflow-x-auto no-scrollbar -mx-1 px-1' : ''}`}>
      {tabs.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`relative inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${SIZES[variant]} ${
              active ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`journal-tab-pill-${variant}`}
                className="absolute inset-0 rounded-lg bg-accent-primary/15"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{labels[id]}</span>
            {id === 'trades' && tradesCount > 0 && (
              <span className={`relative num-mono text-[10px] px-1.5 py-px rounded-full ${active ? 'bg-accent-primary/20' : 'bg-bg-tertiary'}`}>
                {tradesCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
