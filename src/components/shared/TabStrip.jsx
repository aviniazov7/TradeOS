import { motion } from 'framer-motion';

// The tab strip every toolbar page uses (journal, backtest, DCA, plans): the
// active pill slides between tabs. One instance per breakpoint is common —
// pass a distinct `layoutKey` for each so the two pills don't fight.
//   tabs: [{ id, label, mobileLabel?, count? }]
export default function TabStrip({ tabs, value, onChange, variant = 'desktop', layoutKey = 'tabs' }) {
  const mobile = variant === 'mobile';
  return (
    <div role="tablist" className={`flex items-center ${mobile ? 'overflow-x-auto no-scrollbar -mx-1 px-1' : ''}`}>
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
              mobile ? 'px-2.5 py-1.5 text-xs flex-shrink-0' : 'h-9 px-3.5 text-sm'
            } ${active ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}
          >
            {active && (
              <motion.span
                layoutId={`${layoutKey}-pill-${variant}`}
                className="absolute inset-0 rounded-lg bg-accent-primary/15"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{mobile && t.mobileLabel ? t.mobileLabel : t.label}</span>
            {t.count > 0 && (
              <span className={`relative num-mono text-[10px] px-1.5 py-px rounded-full ${active ? 'bg-accent-primary/20' : 'bg-bg-tertiary'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
