import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';
import BackgroundIcons from '../shared/BackgroundIcons';
import PullToRefresh from '../shared/PullToRefresh';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import PushNudge from '../shared/PushNudge';
import EmailVerifyBanner from './EmailVerifyBanner';
import DemoBanner from '../demo/DemoBanner';
import { useDemoMode } from '../../hooks/useDemoMode';
import { useTrades } from '../../hooks/useTrades';
import { isDemoTrade } from '../../utils/demoData';
import { useTheme } from '../../hooks/useTheme';
import { usePushAutoRegister } from '../../hooks/usePushAutoRegister';
import { WifiOff } from 'lucide-react';

function DemoChrome() {
  const { active, exit } = useDemoMode();
  const { trades, loading } = useTrades();
  useEffect(() => {
    if (!loading && active && trades.some((t) => !isDemoTrade(t))) exit();
  }, [loading, active, exit, trades]);
  if (!active) return null;
  return <DemoBanner onExit={exit} />;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { pathname } = useLocation();
  useTheme();

  // The page scrolls inside #app-scroll (not the window), so the browser's own
  // scroll restoration never resets it: moving to another page kept the old
  // scroll offset. Back to the top on every page change (tab/query changes
  // within a page keep their position).
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const handler = () => setSidebarOpen(false);
    window.addEventListener('closeSidebar', handler);
    return () => window.removeEventListener('closeSidebar', handler);
  }, []);
  // Keep granted devices registered for push on every app open (admins can then
  // reach installed users), and nudge un-granted installed users to enable it.
  usePushAutoRegister();

  return (
    <div className="fixed inset-0 overflow-hidden">
      <BackgroundIcons />
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-loss/90 text-white text-xs font-semibold py-1.5" dir="rtl">
          <WifiOff className="w-3.5 h-3.5" /> אין חיבור לאינטרנט
        </div>
      )}

      <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />

      {/* Scrollable content — independent scroll context so iOS fixed nav never jumps */}
      <div
        id="app-scroll"
        className="absolute inset-0 mt-[5.5rem] md:mt-16 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <main className="p-3 md:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+10.5rem)] lg:pb-6">
          <EmailVerifyBanner />
          <DemoChrome />
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
        </main>
      </div>

      <MobileNav />
      <OnboardingWizard />
      <PushNudge />
    </div>
  );
}
