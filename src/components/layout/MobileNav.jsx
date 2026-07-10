import { useLayoutEffect, useRef, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Activity,
  Newspaper,
  Bot,
} from 'lucide-react';

// The bottom bar holds the DAILY quick-access screens (Hebrew labels, matching
// the sidebar). Backtest / Mental / DCA stay one tap away in the menu — they're
// occasional, not everyday.
const mobileItems = [
  { to: '/', label: 'בית', icon: LayoutDashboard },
  { to: '/journal', label: 'יומן', icon: BookOpen },
  { to: '/market', label: 'שוק', icon: Activity },
  { to: '/news', label: 'חדשות', icon: Newspaper },
  { to: '/trade-ai', label: 'TradeAI', icon: Bot },
];

export default function MobileNav() {
  const { pathname } = useLocation();
  const containerRef = useRef(null);
  const itemRefs = useRef([]);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const activeIndex = (() => {
    const match = mobileItems.findIndex(
      (i) => i.to !== '/' && pathname.startsWith(i.to)
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

  return (
    <nav
      className="lg:hidden fixed left-3 right-3 z-40 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      aria-label="ניווט ראשי"
    >
      <div
        ref={containerRef}
        className="pointer-events-auto relative mx-auto flex items-center gap-1 px-2 py-2 rounded-full"
        style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow-sm)',
          WebkitBackdropFilter: 'blur(28px)',
          backdropFilter: 'blur(28px)',
        }}
      >
        <motion.div
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 rounded-full bg-accent-primary/15 pointer-events-none"
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

        {mobileItems.map((item, i) => {
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
              className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[11px] font-medium"
            >
              <span
                className={`flex flex-col items-center gap-0.5 transition-colors ${
                  isActive ? '' : 'text-text-muted'
                }`}
              >
                <motion.span
                  animate={{ scale: isActive ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="inline-flex"
                >
                  <item.icon
                    className="w-[22px] h-[22px]"
                    strokeWidth={isActive ? 2.4 : 2}
                    style={isActive ? { stroke: 'url(#ai-grad)' } : undefined}
                  />
                </motion.span>
                <span className={`leading-none ${isActive ? 'text-gradient font-semibold' : ''}`}>{item.label}</span>
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
