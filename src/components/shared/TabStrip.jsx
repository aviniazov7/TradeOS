import { useEffect, useRef } from 'react';

// The tab strip every toolbar page uses (journal, backtest, DCA, plans).
// The active pill is a CSS background. A shared layoutId animation needed
// framer-motion's layout engine (domMax), which the login page must not load.
//   tabs: [{ id, label, mobileLabel?, icon?, count? }]
//   wrap — phone journal: every tab is on screen (two rows when there are
//   five). No horizontal scroller. Short labels via mobileLabel.
export default function TabStrip({ tabs, value, onChange, variant = 'desktop' }) {
  const mobile = variant === 'mobile';
  const underline = variant === 'underline';
  const wrap = variant === 'wrap';
  const pans = mobile || underline;
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current;
    if (!pans || !el || typeof el.scrollIntoView !== 'function') return;
    // Keep the selected label inside the phone scroller without jumping the page.
    el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pans, value]);
  const n = tabs.length;
  // Five journal tabs: 3 + 2, both rows full width (a 6-column grid).
  // Four (stocks, no exchange tab): a 2×2 grid. Fewer: one row.
  const gridCols = wrap ? (n >= 5 ? 'grid-cols-6' : n === 4 ? 'grid-cols-2' : n === 3 ? 'grid-cols-3' : n === 2 ? 'grid-cols-2' : 'grid-cols-1') : '';
  return (
    // Mobile (non-wrap) is one row as wide as its labels. The parent scroller
    // pans it; shrinking or wrapping there is what clipped "חיבור בורסות".
    <div role="tablist" className={wrap ? `grid w-full gap-1 ${gridCols}` : `flex items-center ${pans ? 'flex-nowrap w-max min-w-full' : ''}`}>
      {tabs.map((t, i) => {
        const active = value === t.id;
        const Icon = t.icon;
        const span = wrap && n >= 5 ? (i < 3 ? 'col-span-2' : 'col-span-3') : '';
        const look = wrap
          ? `w-full min-h-9 min-w-0 px-1 py-1.5 text-[11px] leading-none justify-center text-center ${span} ${active ? 'text-accent-primary bg-accent-primary/15 font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-primary/40'}`
          : underline
            ? `px-3 py-2 text-sm shrink-0 rounded-none border-b-2 -mb-px ${active ? 'border-accent-primary text-accent-primary font-semibold' : 'border-transparent text-text-muted hover:text-text-primary'}`
            : `${mobile ? 'px-2.5 py-1.5 text-xs shrink-0' : 'h-9 px-3.5 text-sm'} ${active ? 'text-accent-primary bg-accent-primary/15' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`;
        const short = (mobile || wrap) && t.mobileLabel ? t.mobileLabel : t.label;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            ref={active ? activeRef : undefined}
            className={`relative inline-flex items-center gap-1 font-medium cursor-pointer transition-colors ${underline ? '' : 'rounded-lg'} ${wrap ? '' : 'whitespace-nowrap'} ${look}`}
          >
            {wrap && Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
            <span className="relative">{short}</span>
            {t.count > 0 && (
              <span className={`relative num-mono text-[10px] px-1.5 py-px rounded-full shrink-0 ${active ? 'bg-accent-primary/20' : 'bg-bg-tertiary'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
