import UserAvatar from '../shared/UserAvatar';
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
      <div className="h-14 md:h-16 flex items-center px-4 md:px-6 gap-3">
      {/* Burger - rightmost in RTL */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'סגירת התפריט' : 'פתיחת התפריט'}
        aria-expanded={sidebarOpen}
        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
      >
        <m.div
          animate={{ rotate: sidebarOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </m.div>
      </button>

      {/* Global Search */}
      <GlobalSearch />

      {/* Price ticker sits in the bar from md up. On a phone the same strip
          is a full-width row under the controls, so symbols are not sliced
          between the search button and the avatar. */}
      <div className="hidden md:block flex-1 overflow-hidden min-w-0 h-full">
        <PriceTicker />
      </div>
      <div className="flex-1 md:hidden" aria-hidden />

      {/* User avatar - leftmost in RTL, links to profile */}
      <Link to="/profile" className="shrink-0">
        <span className="block rounded-full border border-border-primary hover:border-accent-primary transition-colors">
          <UserAvatar className="w-8 h-8" />
        </span>
      </Link>
      </div>
      <div className="md:hidden h-8 border-t border-border-primary/70 overflow-hidden px-2">
        <PriceTicker />
      </div>
    </header>
  );
}
