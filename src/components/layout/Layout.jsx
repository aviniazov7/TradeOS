import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';
import BackgroundIcons from '../shared/BackgroundIcons';
import PullToRefresh from '../shared/PullToRefresh';
import OnboardingWizard from '../onboarding/OnboardingWizard';
import PushNudge from '../shared/PushNudge';
import { useTheme } from '../../hooks/useTheme';
// import { useLeaderboardSync } from '../../hooks/useLeaderboardSync';
import { usePushAutoRegister } from '../../hooks/usePushAutoRegister';
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
  // Keep granted devices registered for push on every app open (admins can then
  // reach installed users), and nudge un-granted installed users to enable it.
  usePushAutoRegister();

  return (
    <div className="fixed inset-0 overflow-hidden">
      <BackgroundIcons />
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Always mounted so it is a LIVE region whose CONTENT changes — a region
          inserted together with its text is a documented VoiceOver/Safari
          miss, and the installed iOS PWA is exactly the target here. Sits
          BELOW the header rather than over it: both are fixed to the top, and
          the banner (z-[100]) used to paint across the header's controls. */}
      <div
        role="status"
        className={isOnline
          ? 'sr-only'
          : 'fixed left-0 right-0 z-[55] flex items-center justify-center gap-2 bg-loss/90 text-white text-xs font-semibold py-1.5'}
        style={isOnline ? undefined : { top: 'var(--app-header-h)' }}
        dir="rtl"
      >
        {!isOnline && (<><WifiOff className="w-3.5 h-3.5" /> אין חיבור לאינטרנט</>)}
      </div>

      <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />

      {/* Scrollable content — independent scroll context so iOS fixed nav never jumps */}
      <div
        id="app-scroll"
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
        style={{ marginTop: 'var(--app-header-h)' }}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <main className="p-3 md:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] lg:pb-6">
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
