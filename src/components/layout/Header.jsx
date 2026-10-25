import BrandMark from '../shared/BrandMark';
import { Link } from 'react-router-dom';
import PriceTicker from './PriceTicker';
import GlobalSearch from './GlobalSearch';
import TopNav from './TopNav';
import AccountMenu from './AccountMenu';

export default function Header() {
  return (
    <header
      className="border-b border-border-primary fixed top-0 left-0 right-0 z-[60]"
      style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="relative h-14 md:h-16 flex items-center px-3 md:px-6 gap-2 md:gap-3">
      <Link to="/" aria-label="TradeOS" className="hidden md:flex shrink-0 items-center">
        <BrandMark size="sm" />
      </Link>

      {/* Four sections. On a phone they get their own scrolling row below,
          so the wordmark stays centered between search and the account. */}
      <div className="hidden md:block shrink-0 max-w-[60%]">
        <TopNav />
      </div>

      <div className="relative z-20 shrink-0">
        <GlobalSearch />
      </div>

      <div className="hidden md:block flex-1 overflow-hidden min-w-0 h-full">
        <PriceTicker />
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

      <AccountMenu />
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
