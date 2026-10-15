import { useEffect, useRef } from 'react';

// The tab strip every toolbar page uses (journal, backtest, DCA, plans).
// The active pill is a CSS background. A shared layoutId animation needed
// framer-motion's layout engine (domMax), which the login page must not load.
//   tabs: [{ id, label, mobileLabel?, count? }]
export default function TabStrip({ tabs, value, onChange, variant = 'desktop' }) {
  const mobile = variant === 'mobile';
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current;
    if (!mobile || !el || typeof el.scrollIntoView !== 'function') return;
    // Keep the selected label inside the phone scroller without jumping the page.
    el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [mobile, value]);
  return (
    // Mobile is one row that is as wide as its labels. The parent scroller
    // pans it; shrinking or wrapping here is what clipped "חיבור בורסות".
    <div role="tablist" className={`flex items-center ${mobile ? 'flex-nowrap w-max min-w-full' : ''}`}>
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            ref={active ? activeRef : undefined}
            className={`relative inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
              mobile ? 'px-2.5 py-1.5 text-xs shrink-0' : 'h-9 px-3.5 text-sm'
            } ${active ? 'text-accent-primary bg-accent-primary/15' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}
          >
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
