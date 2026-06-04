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
  { to: '/news', label: 'חדשות', icon: Newspaper },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { isAdmin } = useAuth();
  const [calcOpen, setCalcOpen] = useState(false);
  const items = isAdmin
    ? [...navItems, { to: '/admin', label: 'ניהול', icon: Shield }]
    : navItems;
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
            style={{ background: 'var(--color-bg-overlay)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
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
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent-primary/10 text-accent-primary'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
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
