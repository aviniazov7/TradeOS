import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';
import BackgroundIcons from '../shared/BackgroundIcons';
import PullToRefresh from '../shared/PullToRefresh';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import { useTheme } from '../../hooks/useTheme';
// import { useLeaderboardSync } from '../../hooks/useLeaderboardSync';
import { useDailySummarySync } from '../../hooks/useDailySummarySync';
import { WifiOff } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useTheme();

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
  // useLeaderboardSync();
  useDailySummarySync();

  return (
    <div className="min-h-screen overflow-x-hidden relative">
      <BackgroundIcons />
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-loss/90 text-white text-xs font-semibold py-1.5" dir="rtl">
          <WifiOff className="w-3.5 h-3.5" /> אין חיבור לאינטרנט
        </div>
      )}

      {/* Main content */}
      <div>
        <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />
        <main className="p-3 md:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] lg:pb-6 mt-14 md:mt-16">
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
        </main>
      </div>

      <MobileNav />
      <OnboardingWizard />
    </div>
  );
}
