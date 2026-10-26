import { useLayoutEffect, useRef, useState, useCallback, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Activity,
  Bot,
  Plus,
  Link2,
} from 'lucide-react';
import { getConnectedExchanges } from '../../services/exchangeService';
import { shouldShowMobileConnectShortcut } from '../../utils/connectShortcut';

// The bottom bar holds the DAILY quick-access screens (Hebrew labels, matching
// the sidebar), split around a centre "+" that opens the new-trade form.
// Backtest / plans / portfolio stay one tap away in the menu (header burger).
//   match — extra path prefixes that light the tab up (pages living under it)
const mobileItems = [
  { to: '/', label: 'בית', icon: LayoutDashboard },
  { to: '/journal', label: 'יומן', icon: BookOpen },
  { to: '/trade-ai', label: 'TradeAI', icon: Bot },
  { to: '/market', label: 'שוק', icon: Activity, match: ['/news', '/polymarket'] },
];
// The "+" sits between these two halves of mobileItems.
const SPLIT_AT = 2;

export default function MobileNav() {
  const { pathname } = useLocation();
  const [connectedCount, setConnectedCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getConnectedExchanges()
      .then((list) => { if (!cancelled) setConnectedCount(Array.isArray(list) ? list.length : 0); })
      .catch(() => { if (!cancelled) setConnectedCount(0); });
    return () => { cancelled = true; };
  }, [pathname]);
  const containerRef = useRef(null);
  const itemRefs = useRef([]);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const activeIndex = (() => {
    const match = mobileItems.findIndex(
      (i) => i.to !== '/' && [i.to, ...(i.match || [])].some((p) => pathname.startsWith(p))
    );
    if (match !== -1) return match;
    return pathname === '/' ? 0 : -1;
  })();

  const measure = useCallback(() => {
    const container = containerRef.current;
    const el = itemRefs.current[activeIndex];
    if (!container || !el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    setPill({
      left: eRect.left - cRect.left,
      width: eRect.width,
      ready: true,
    });
  }, [activeIndex]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const renderItem = (item, i) => {
    const isActive = activeIndex === i;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        ref={(el) => (itemRefs.current[i] = el)}
        onClick={() => {
          // Tapping the already-active tab scrolls the page back to the top.
          if (isActive) {
            document.getElementById('app-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        className="relative z-10 flex-1 flex flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px] font-medium"
      >
        {/* Monochrome, X-style: active = primary text color, no accent
            gradients — the neutral pill carries the state. */}
        <span
          className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
            isActive ? 'text-text-primary' : 'text-text-muted'
          }`}
        >
          <item.icon
            className="w-[22px] h-[22px]"
            strokeWidth={isActive ? 2.2 : 1.8}
          />
          <span className={`leading-none ${isActive ? 'font-semibold' : ''}`}>{item.label}</span>
        </span>
      </NavLink>
    );
  };

  return (
    <nav
      className="lg:hidden fixed left-3 right-3 z-40 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      aria-label="ניווט ראשי"
    >
      {shouldShowMobileConnectShortcut(connectedCount) && (
        <Link
          to="/journal?tab=exchange"
          data-testid="mobile-connect-exchange"
          className="mobile-connect-chip pointer-events-auto absolute -top-11 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold text-white bg-accent-muted shadow-[0_8px_24px_rgba(37,99,235,0.4)]"
        >
          <Link2 className="w-3.5 h-3.5" /> חיבור בורסה
        </Link>
      )}
      <div
        ref={containerRef}
        className="pointer-events-auto relative mx-auto flex items-center gap-0.5 px-2 py-1.5 rounded-full"
        style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.4)',
          backdropFilter: 'blur(32px) saturate(1.4)',
        }}
      >
        {/* Active highlight — a quiet NEUTRAL pill (X-style), not an accent
            tint. text-primary/10 flips with the theme automatically. */}
        <m.div
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 rounded-full bg-text-primary/10 pointer-events-none"
          initial={false}
          animate={
            pill.ready
              ? { x: pill.left, width: pill.width, opacity: activeIndex === -1 ? 0 : 1 }
              : { opacity: 0 }
          }
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 32,
            mass: 0.6,
          }}
          style={{ left: 0 }}
        />

        {mobileItems.slice(0, SPLIT_AT).map((item, i) => renderItem(item, i))}

        {/* Centre action: new trade. ?new=1 opens the journal's trade form
            (also when the journal is already open). */}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <Link
            to="/journal?new=1"
            aria-label="עסקה חדשה"
            title="עסקה חדשה"
            className="w-12 h-12 rounded-full grid place-items-center text-white bg-accent-muted hover:bg-accent-primary transition-colors"
            style={{ boxShadow: '0 6px 20px rgba(37,99,235,0.45)' }}
          >
            <Plus className="w-6 h-6" strokeWidth={2.4} />
          </Link>
        </div>

        {mobileItems.slice(SPLIT_AT).map((item, j) => renderItem(item, SPLIT_AT + j))}
      </div>
    </nav>
  );
}
