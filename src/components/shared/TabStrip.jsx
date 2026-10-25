import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// The tab strip every toolbar page uses (journal, backtest, DCA, plans).
// The active chip is a pill that slides between tabs. Its box is measured in
// viewport pixels (getBoundingClientRect), then placed with a physical
// translate — the same coordinates flex uses in both LTR and RTL, so the pill
// follows the selected tab instead of sliding the wrong way.
// A shared layoutId would need framer-motion's layout engine (domMax), which
// the login page must not load. This pill is CSS only.
//   tabs: [{ id, label, mobileLabel?, icon?, count? }]
//   wrap — phone journal: every tab is on screen in one row (four or fewer).
//   No horizontal scroller. Short labels via mobileLabel.
//   layoutKey — names the strip (several can be on one page). Each instance
//   measures itself; the key is exposed for tests and debugging.
export default function TabStrip({ tabs, value, onChange, variant = 'desktop', layoutKey }) {
  const mobile = variant === 'mobile';
  const underline = variant === 'underline';
  const wrap = variant === 'wrap';
  const pans = mobile || underline;
  const activeRef = useRef(null);
  const listRef = useRef(null);
  const [box, setBox] = useState(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list || underline) return;
    const el = list.querySelector('[aria-selected="true"]');
    if (!el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const next = {
      x: Math.round((er.left - lr.left) * 10) / 10,
      y: Math.round((er.top - lr.top) * 10) / 10,
      w: Math.round(er.width * 10) / 10,
      h: Math.round(er.height * 10) / 10,
    };
    setBox((prev) => (
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next
    ));
  }, [underline]);

  useLayoutEffect(() => {
    const el = activeRef.current;
    if (!pans || !el || typeof el.scrollIntoView !== 'function') return;
    // Keep the selected label inside the phone scroller without jumping the page.
    el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pans, value]);

  useLayoutEffect(() => {
    measure();
  }, [value, variant, tabs, measure]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || underline || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((btn) => ro.observe(btn));
    return () => ro.disconnect();
  }, [underline, measure, tabs, value, variant]);

  useLayoutEffect(() => {
    // The first box is placed with transitions off so the pill doesn't fly in
    // from 0,0. Later value changes slide.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const n = tabs.length;
  // One row when the journal has four tabs or fewer. Five or more still wrap
  // (3 + 2 on a 6-column grid) so nothing is clipped off the side.
  const gridCols = wrap ? (n >= 5 ? 'grid-cols-6' : n === 4 ? 'grid-cols-4' : n === 3 ? 'grid-cols-3' : n === 2 ? 'grid-cols-2' : 'grid-cols-1') : '';
  return (
    // Mobile (non-wrap) is one row as wide as its labels. The parent scroller
    // pans it; shrinking or wrapping there is what clipped "חיבור בורסות".
    <div
      ref={listRef}
      role="tablist"
      data-layout-key={layoutKey || undefined}
      className={`relative ${wrap ? `grid w-full gap-1 ${gridCols}` : `flex items-center ${pans ? 'flex-nowrap w-max min-w-full' : ''}`}`}
    >
      {!underline && box && (
        <span
          aria-hidden="true"
          data-tab-pill=""
          data-ready={ready ? 'true' : 'false'}
          className={`tab-pill absolute z-0 rounded-lg bg-accent-primary shadow-[0_8px_24px_-6px_rgba(37,99,235,0.95)] pointer-events-none ${ready ? 'transition-[transform,width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]' : ''}`}
          style={{
            left: 0,
            top: 0,
            width: box.w,
            height: box.h,
            transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
          }}
        />
      )}
      {tabs.map((t, i) => {
        const active = value === t.id;
        const Icon = t.icon;
        const span = wrap && n >= 5 ? (i < 3 ? 'col-span-2' : 'col-span-3') : '';
        const look = wrap
          ? `w-full min-h-9 min-w-0 px-1 py-1.5 text-[11px] leading-none justify-center text-center ${span} ${active ? 'text-white font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-primary/40'}`
          : underline
            ? `px-3 py-2 text-sm shrink-0 rounded-none border-b-2 -mb-px ${active ? 'border-accent-primary text-accent-primary font-semibold' : 'border-transparent text-text-muted hover:text-text-primary'}`
            : `${mobile ? 'px-2.5 py-1.5 text-xs shrink-0' : 'h-9 px-3.5 text-sm'} ${active ? 'text-white font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`;
        const short = (mobile || wrap) && t.mobileLabel ? t.mobileLabel : t.label;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab-id={t.id}
            aria-selected={active}
            onClick={() => onChange(t.id)}
            ref={active ? activeRef : undefined}
            className={`relative z-[1] inline-flex items-center gap-1 font-medium whitespace-nowrap cursor-pointer transition-colors ${underline ? '' : 'rounded-lg'} ${look}`}
          >
            {wrap && Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
            <span className="relative">{short}</span>
            {t.count > 0 && (
              <span className={`relative num-mono text-[10px] px-1.5 py-px rounded-full shrink-0 ${active ? 'bg-white/20' : 'bg-bg-tertiary'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
