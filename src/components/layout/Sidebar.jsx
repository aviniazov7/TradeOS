import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  ClipboardList,
  Activity,
  Calculator,
  Shield,
  Lock,
  Crown,
  Bot,
  Briefcase,
  ChevronDown,
  User,
} from 'lucide-react';
import PositionCalculator from '../calculator/PositionCalculator';
import { useAuth } from '../../contexts/AuthContext';

// Seven top-level destinations. Pages that used to be their own menu rows now
// live as tabs (?tab=…) or sub-links under a group, so everything is still one
// or two taps away without a 13-row menu.
//   tab        — the ?tab= value a sub-link opens (matched against the URL)
//   defaultTab — the group page's tab when the URL has none
//   match      — extra path prefixes that count as "inside" the item
const navItems = [
  { key: 'home', to: '/', label: 'בית', icon: LayoutDashboard },
  { key: 'journal', to: '/journal', label: 'יומן מסחר', icon: BookOpen },
  { key: 'backtest', to: '/backtest', label: 'בקטסט', icon: FlaskConical },
  {
    key: 'discipline', label: 'תוכניות ומשמעת', icon: ClipboardList,
    children: [
      { to: '/plans', label: 'תוכניות מסחר' },
      { to: '/mentality', label: 'האזור המנטלי' },
    ],
  },
  { key: 'ai', to: '/trade-ai', label: 'TradeAI', icon: Bot },
  {
    key: 'market', label: 'שוק', icon: Activity, defaultTab: 'overview',
    children: [
      { to: '/market', tab: 'overview', label: 'סקירת שוק' },
      { to: '/market', tab: 'analysis', label: 'ניתוח מטבע' },
      { to: '/market', tab: 'whales', label: 'מעקב לווייתנים' },
      { to: '/news', label: 'חדשות' },
      // Visible to everyone; the tab shows a locked teaser to non-premium.
      { to: '/market', tab: 'polymarket', label: 'Polymarket', premiumBadge: true, match: ['/polymarket'] },
      // Owner-only while the engine is being calibrated — hidden from everyone else.
      { to: '/scanner', label: 'מנוע ויקוף', admin: true, adminBadge: true },
    ],
  },
  {
    key: 'portfolio', label: 'תיק', icon: Briefcase, defaultTab: 'dca',
    children: [
      { to: '/portfolio', tab: 'dca', label: 'מעקב DCA' },
      { to: '/portfolio', tab: 'wallets', label: 'ארנקים' },
    ],
  },
];

const pathIn = (pathname, to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));

// A sub-link that targets a tab is active only on that tab; the page's default
// tab also matches the bare URL (no ?tab=).
function childActive(child, group, pathname, search) {
  if (child.match?.some((p) => pathIn(pathname, p))) return true;
  if (!pathIn(pathname, child.to)) return false;
  if (!child.tab) return true;
  const current = new URLSearchParams(search).get('tab') || group.defaultTab;
  return current === child.tab;
}

const childHref = (child, group) => (
  child.tab && child.tab !== group.defaultTab ? `${child.to}?tab=${child.tab}` : child.to
);

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

// A collapsible group of sub-links. Mounted with the drawer, so its open state
// starts fresh on every open: open while one of its pages is the current page,
// until the user toggles it by hand.
function NavGroup({ group, isAdmin, pathname, search, onClose }) {
  const [toggled, setToggled] = useState(null);
  const children = group.children.filter((c) => !c.admin || isAdmin);
  const groupActive = children.some((c) => childActive(c, group, pathname, search));
  const open = toggled ?? groupActive;
  const listId = `nav-group-${group.key}`;
  return (
    <div>
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        aria-controls={listId}
        className={`${rowBase} ${groupActive ? 'border border-cyan-400/20' : rowIdle}`}
        style={groupActive ? activeBg : undefined}
      >
        <RowContent icon={group.icon} label={group.label} active={groupActive} />
        <ChevronDown className={`w-4 h-4 ms-auto shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden ms-[1.4rem] ps-3 border-s border-border-primary space-y-0.5 my-1"
          >
            {children.map((child) => {
              const active = childActive(child, group, pathname, search);
              return (
                <li key={`${child.to}-${child.tab || ''}`}>
                  <Link
                    to={childHref(child, group)}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                      active
                        ? 'text-accent-primary font-semibold bg-accent-primary/10'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60'
                    }`}
                  >
                    <span>{child.label}</span>
                    {child.premiumBadge && <Crown className="w-3.5 h-3.5 text-amber-400 ms-auto shrink-0" aria-label="Premium" />}
                    {child.adminBadge && (
                      <Lock className="w-3.5 h-3.5 text-accent-primary ms-auto shrink-0" aria-label="גלוי רק לך" />
                    )}
                  </Link>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  const { isAdmin } = useAuth();
  const { pathname, search } = useLocation();
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed right-0 top-14 md:top-16 h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] w-64 border-l border-border-primary z-50 flex flex-col"
            style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          >

            {/* Navigation */}
            <nav aria-label="תפריט ראשי" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (item.children
                ? <NavGroup key={item.key} group={item} isAdmin={isAdmin} pathname={pathname} search={search} onClose={onClose} />
                : <NavRow key={item.key} item={item} active={pathIn(pathname, item.to)} onClose={onClose} />
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

          </motion.aside>
        </>
      )}
    </AnimatePresence>

    <PositionCalculator isOpen={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}
