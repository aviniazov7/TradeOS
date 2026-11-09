import UserAvatar from '../shared/UserAvatar';
import BrandMark from '../shared/BrandMark';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import PriceTicker from './PriceTicker';
import GlobalSearch from './GlobalSearch';

export default function Header({ onToggleSidebar, sidebarOpen }) {
  return (
    <header
      className="border-b border-border-primary fixed top-0 left-0 right-0 z-[60]"
      style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="relative h-14 md:h-16 flex items-center px-4 md:px-6 gap-3">
      {/* Burger - rightmost in RTL. z-20 keeps it above the centered wordmark. */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'סגירת התפריט' : 'פתיחת התפריט'}
        aria-expanded={sidebarOpen}
        data-tour="menu"
        className="relative z-20 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
      >
        <m.div
          animate={{ rotate: sidebarOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </m.div>
      </button>

      {/* Global Search */}
      <div className="relative z-20 shrink-0">
        <GlobalSearch />
      </div>

      {/* Price ticker sits in the bar from md up. On a phone the same strip
          is a full-width row under the controls, so symbols are not sliced
          between the search button and the avatar. */}
      <div className="hidden md:block flex-1 overflow-hidden min-w-0 h-full">
        <PriceTicker />
      </div>
      {/* Centered on the phone row only. Absolute so the avatar and the
          burger stay on the edges; the link sits above the empty flex gap. */}
      <Link
        to="/"
        data-testid="header-brand"
        aria-label="TradeOS"
        className="md:hidden absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <BrandMark size="sm" />
      </Link>
      <div className="flex-1 md:hidden" aria-hidden />

      {/* User avatar - leftmost in RTL, links to profile */}
      <Link to="/profile" data-tour="settings" className="relative z-20 shrink-0">
        <span className="block rounded-full border border-border-primary hover:border-accent-primary transition-colors">
          <UserAvatar className="w-8 h-8" />
        </span>
      </Link>
      </div>
      <div data-testid="mobile-ticker" className="md:hidden h-8 border-t border-border-primary/70 overflow-hidden px-2">
        <PriceTicker />
      </div>
    </header>
  );
}
