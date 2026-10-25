import BrandMark from '../shared/BrandMark';
import { Link } from 'react-router-dom';
import { Bell, Moon, Settings, Sun } from 'lucide-react';
import PriceTicker from './PriceTicker';
import GlobalSearch from './GlobalSearch';
import TopNav from './TopNav';
import AccountMenu from './AccountMenu';
import { useTheme } from '../../hooks/useTheme';

export default function Header() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <header
      className="border-b border-border-primary fixed top-0 left-0 right-0 z-[60]"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="relative h-14 md:h-16 flex items-center px-3 md:px-6 gap-2 md:gap-3">
        <Link to="/" aria-label="TradeOS" className="hidden md:flex shrink-0 items-center z-20">
          <BrandMark size="sm" />
        </Link>

        {/* Centered on the desktop bar. Phones get a scrolling row under this. */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 max-w-[min(36rem,56%)]">
          <TopNav />
        </div>

        <div className="relative z-20 shrink-0">
          <GlobalSearch />
        </div>

        <Link
          to="/"
          data-testid="header-brand"
          aria-label="TradeOS"
          className="md:hidden absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
        >
          <BrandMark size="sm" />
        </Link>
        <div className="flex-1 md:hidden" aria-hidden />

        <div className="ms-auto flex items-center gap-1.5 z-20">
          <Link to="/profile" aria-label="הגדרות" title="הגדרות" className="header-icon-btn hidden sm:grid">
            <Settings className="w-4 h-4" />
          </Link>
          <button type="button" onClick={toggleTheme} aria-label="החלפת ערכת נושא" title="החלפת ערכת נושא" className="header-icon-btn grid">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link to="/profile" aria-label="התראות" title="התראות" className="header-icon-btn hidden sm:grid">
            <Bell className="w-4 h-4" />
          </Link>
          <AccountMenu />
        </div>
      </div>
      <div className="hidden md:block h-8 border-t border-border-primary/70 overflow-hidden px-4">
        <PriceTicker />
      </div>
      <div className="md:hidden overflow-x-auto no-scrollbar border-t border-border-primary/70">
        <TopNav />
      </div>
      <div data-testid="mobile-ticker" className="md:hidden h-8 border-t border-border-primary/70 overflow-hidden px-2">
        <PriceTicker />
      </div>
    </header>
  );
}
