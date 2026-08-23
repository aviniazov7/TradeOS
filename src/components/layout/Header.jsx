import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Menu, X } from 'lucide-react';
import PriceTicker from './PriceTicker';
import GlobalSearch from './GlobalSearch';

export default function Header({ onToggleSidebar, sidebarOpen }) {
  const { user } = useAuth();

  return (
    <header
      className="h-14 md:h-16 border-b border-border-primary flex items-center px-4 md:px-6 gap-3 fixed top-0 left-0 right-0 z-[60] box-content"
      style={{
        background: 'var(--color-bg-solid)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        // index.html sets viewport-fit=cover, so the layout runs under the
        // notch. The bottom inset was padded everywhere but the top was not,
        // leaving the burger, search and avatar partly under the status bar in
        // the installed iOS PWA. box-content keeps the bar's own height intact
        // while the inset is added on top of it.
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Burger - rightmost in RTL */}
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
      >
        <motion.div
          animate={{ rotate: sidebarOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </motion.div>
      </button>

      {/* Global Search */}
      <GlobalSearch />

      {/* Price Ticker - center */}
      <div className="flex-1 overflow-hidden min-w-0">
        <PriceTicker />
      </div>

      {/* User avatar - leftmost in RTL, links to profile */}
      <Link to="/profile" className="shrink-0">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName}
            className="w-8 h-8 rounded-full border border-border-primary hover:border-accent-primary transition-colors cursor-pointer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary text-sm font-semibold hover:bg-accent-primary/30 transition-colors cursor-pointer">
            {user?.displayName?.[0] || user?.email?.[0] || '?'}
          </div>
        )}
      </Link>
    </header>
  );
}
