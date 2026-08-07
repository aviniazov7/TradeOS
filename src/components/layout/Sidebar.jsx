import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  Coins,
  ClipboardList,
  Brain,
  Activity,
  Newspaper,
  Calculator,
  Shield,
  Wallet,
  Crown,
  Bot,
  Radar,
} from 'lucide-react';
import PositionCalculator from '../calculator/PositionCalculator';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'דשבורד', icon: LayoutDashboard },
  { to: '/journal', label: 'יומן מסחר', icon: BookOpen },
  { to: '/mentality', label: 'האזור המנטלי', icon: Brain },
  { to: '/backtest', label: 'בקטסט', icon: FlaskConical },
  { to: '/dca', label: 'מעקב DCA', icon: Coins },
  { to: '/wallets', label: 'ארנקים', icon: Wallet },
  { to: '/plans', label: 'תוכניות מסחר', icon: ClipboardList },
  { to: '/market', label: 'סקירת שוק', icon: Activity },
  { to: '/scanner', label: 'סורק סטאפים', icon: Radar, admin: true },
  { to: '/trade-ai', label: 'TradeAI', icon: Bot },
  { to: '/news', label: 'חדשות', icon: Newspaper },
  { to: '/premium', label: 'שדרוג Premium', icon: Crown, highlight: true },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { isAdmin, isPremium } = useAuth();
  const [calcOpen, setCalcOpen] = useState(false);
  // Most items are Premium-gated; the scanner is admin-only for now (owner-only
  // while it's being calibrated). Route guards enforce this too.
  const base = navItems.filter((i) => (!i.premium || isPremium) && (!i.admin || isAdmin));
  const items = isAdmin
    ? [...base, { to: '/admin', label: 'ניהול', icon: Shield }]
    : base;
  const handleNavClick = () => {
    onClose();
  };

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

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
            className="fixed right-0 top-14 md:top-16 h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] w-64 border-l border-border-primary z-50 flex flex-col"
            style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          >

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'border border-cyan-400/20'
                          : item.highlight
                            ? 'border border-transparent hover:bg-bg-tertiary/60'
                            : 'border border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? { background: 'linear-gradient(90deg, rgba(34,211,238,0.14) 0%, rgba(139,92,246,0.07) 100%)' }
                        : undefined
                    }
                  >
                    {({ isActive }) => {
                      const grad = isActive || item.highlight;
                      return (
                        <>
                          {isActive && (
                            <span
                              className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-full"
                              style={{ background: 'linear-gradient(180deg,#60a5fa,#2563eb)', boxShadow: '0 0 10px 0 rgba(34,211,238,0.6)' }}
                            />
                          )}
                          <item.icon
                            className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110"
                            style={grad ? { stroke: 'url(#ai-grad)' } : undefined}
                          />
                          <span className={grad ? 'text-gradient font-semibold' : ''}>{item.label}</span>
                        </>
                      );
                    }}
                  </NavLink>
              ))}
            </nav>

            {/* Calculator button */}
            <div className="px-3 py-3 border-t border-border-primary">
              <button
                onClick={() => { setCalcOpen(true); onClose(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-tertiary w-full cursor-pointer"
              >
                <Calculator className="w-5 h-5" />
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
