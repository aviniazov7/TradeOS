import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, Link2, Newspaper } from 'lucide-react';
import { PRIMARY_TABS, primaryTabId } from './primaryNav';

const ICONS = {
  home: LayoutDashboard,
  journal: BookOpen,
  news: Newspaper,
  exchange: Link2,
};

// Four destinations inside one rounded track. The active tab is a solid white
// pill with dark text. Position is measured in viewport pixels so RTL does
// not slide it the wrong way.
export default function TopNav() {
  const { pathname, search } = useLocation();
  const active = primaryTabId(pathname, search);
  const listRef = useRef(null);
  const [box, setBox] = useState(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector('[aria-current="page"]');
    if (!el) {
      setBox(null);
      return;
    }
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const next = {
      x: Math.round((er.left - lr.left) * 10) / 10,
      y: Math.round((er.top - lr.top) * 10) / 10,
      w: Math.round(er.width * 10) / 10,
      h: Math.round(er.height * 10) / 10,
    };
    setBox((prev) => (
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next
    ));
  }, []);

  useLayoutEffect(() => {
    measure();
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
    });
  }, [active, measure]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <nav aria-label="ניווט עליון" className="min-w-0">
      <div
        ref={listRef}
        className="top-nav-track relative flex w-max min-w-full md:min-w-0 md:w-auto items-center gap-0.5 rounded-full p-1"
      >
        {box && box.w > 0 && (
          <span
            aria-hidden="true"
            data-nav-pill=""
            className="top-nav-pill absolute z-0 pointer-events-none transition-[transform,width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              left: 0,
              top: 0,
              width: box.w,
              height: box.h,
              transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
            }}
          />
        )}
        {PRIMARY_TABS.map((tab) => {
          const on = tab.id === active;
          const Icon = ICONS[tab.id];
          return (
            <Link
              key={tab.id}
              to={tab.to}
              data-tab-id={tab.id}
              aria-current={on ? 'page' : undefined}
              className="top-nav-link relative z-[1] inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap"
            >
              {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} /> : null}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
