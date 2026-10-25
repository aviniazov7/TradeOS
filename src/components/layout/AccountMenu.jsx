import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calculator, Radar, Shield } from 'lucide-react';
import UserAvatar from '../shared/UserAvatar';
import PositionCalculator from '../calculator/PositionCalculator';
import { useAuth } from '../../contexts/AuthContext';
import { MORE_LINKS } from './primaryNav';

// The old hamburger list. The four top tabs are not repeated here.
export default function AccountMenu() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const links = [
    ...MORE_LINKS,
    ...(isAdmin ? [
      { to: '/scanner', label: 'מנוע ויקוף', icon: Radar },
      { to: '/admin', label: 'ניהול', icon: Shield },
    ] : []),
  ];

  return (
    <>
      <div ref={rootRef} className="relative z-20 shrink-0">
        <button
          type="button"
          aria-label="חשבון ותפריט"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
          className="block rounded-full border border-border-primary hover:border-accent-primary transition-colors cursor-pointer"
        >
          <UserAvatar className="w-8 h-8" />
        </button>
        {open && (
          <nav
            aria-label="תפריט ראשי"
            className="absolute end-0 top-full mt-2 w-60 max-h-[70dvh] overflow-y-auto rounded-2xl border border-border-primary bg-bg-overlay p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
          >
            {links.map((item) => {
              const Icon = item.icon;
              const hit = (path) => pathname === path || pathname.startsWith(`${path}/`);
              const on = hit(item.to) || !!item.match?.some(hit);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${on ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}
                >
                  {Icon ? <Icon className="w-4 h-4 shrink-0" /> : null}
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => { setCalcOpen(true); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary cursor-pointer"
            >
              <Calculator className="w-4 h-4 shrink-0" />
              מחשבון פוזיציה
            </button>
          </nav>
        )}
      </div>
      <PositionCalculator isOpen={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}
