import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  ClipboardList,
  Activity,
  Calculator,
  Shield,
  Crown,
  Bot,
  Briefcase,
  Brain,
  Newspaper,
  User,
} from 'lucide-react';
import PositionCalculator from '../calculator/PositionCalculator';
import { useAuth } from '../../contexts/AuthContext';

// One flat list — no collapsible groups. Pages with several views (Market,
// Portfolio) keep them as tabs inside the page, not as menu sub-rows.
//   match — extra path prefixes that count as "inside" the item (redirects,
//           detail pages)
const navItems = [
  { key: 'home', to: '/', label: 'בית', icon: LayoutDashboard },
  { key: 'journal', to: '/journal', label: 'יומן מסחר', icon: BookOpen, match: ['/terminal'] },
  { key: 'backtest', to: '/backtest', label: 'בקטסט', icon: FlaskConical },
  { key: 'plans', to: '/plans', label: 'תוכניות מסחר', icon: ClipboardList },
  { key: 'mentality', to: '/mentality', label: 'האזור המנטלי', icon: Brain },
  { key: 'ai', to: '/trade-ai', label: 'TradeAI', icon: Bot },
  { key: 'market', to: '/market', label: 'שוק', icon: Activity, match: ['/polymarket', '/whales'] },
  { key: 'news', to: '/news', label: 'חדשות', icon: Newspaper },
  { key: 'portfolio', to: '/portfolio', label: 'החזקות', icon: Briefcase, match: ['/dca', '/wallets'] },
];

const pathIn = (pathname, to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));
const itemActive = (item, pathname) => pathIn(pathname, item.to) || !!item.match?.some((p) => pathIn(pathname, p));

const rowBase = 'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full cursor-pointer';
const rowIdle = 'border border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60';
const activeBg = { background: 'linear-gradient(90deg, rgba(34,211,238,0.14) 0%, rgba(139,92,246,0.07) 100%)' };

function ActiveBar() {
  return (
    <span
      className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-full"
      style={{ background: 'linear-gradient(180deg,#60a5fa,#2563eb)', boxShadow: '0 0 10px 0 rgba(34,211,238,0.6)' }}
    />
  );
}

// One top-level row: icon + label, gradient + side bar when active.
function RowContent({ icon, label, active, highlight }) {
  const Icon = icon;
  const grad = active || highlight;
  return (
    <>
      {active && <ActiveBar />}
      <Icon
        className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110"
        style={grad ? { stroke: 'url(#ai-grad)' } : undefined}
      />
      <span className={grad ? 'text-gradient font-semibold' : ''}>{label}</span>
    </>
  );
}

function NavRow({ item, active, onClose }) {
  return (
    <Link
      to={item.to}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={`${rowBase} ${active ? 'border border-cyan-400/20' : item.highlight ? 'border border-transparent hover:bg-bg-tertiary/60' : rowIdle}`}
      style={active ? activeBg : undefined}
    >
      <RowContent icon={item.icon} label={item.label} active={active} highlight={item.highlight} />
    </Link>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const [calcOpen, setCalcOpen] = useState(false);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const footerItems = [
    { to: '/premium', label: 'שדרוג Premium', icon: Crown, highlight: true },
    { to: '/profile', label: 'פרופיל', icon: User },
    ...(isAdmin ? [{ to: '/admin', label: 'ניהול', icon: Shield }] : []),
  ];

  return (
    <>
    <AnimatePresence>
      {mobileOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />
          <m.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed right-0 top-[5.5rem] md:top-16 h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-4rem)] w-64 border-l border-border-primary z-50 flex flex-col"
            style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          >

            {/* Navigation */}
            <nav aria-label="תפריט ראשי" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <NavRow key={item.key} item={item} active={itemActive(item, pathname)} onClose={onClose} />
              ))}
            </nav>

            {/* Footer: account + tools */}
            <div
              className="px-3 py-3 border-t border-border-primary shrink-0 space-y-1"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {footerItems.map((item) => (
                <NavRow key={item.to} item={item} active={pathIn(pathname, item.to)} onClose={onClose} />
              ))}
              <button
                type="button"
                onClick={() => { setCalcOpen(true); onClose(); }}
                className={`${rowBase} ${rowIdle}`}
              >
                <Calculator className="w-5 h-5 shrink-0" />
                מחשבון פוזיציה
              </button>
            </div>

          </m.aside>
        </>
      )}
    </AnimatePresence>

    <PositionCalculator isOpen={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}
