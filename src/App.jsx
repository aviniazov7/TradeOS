import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PremiumRoute from './components/auth/PremiumRoute';
import AdminRoute from './components/auth/AdminRoute';
import LoginPage from './components/auth/LoginPage';
import AuthGooglePopup from './components/auth/AuthGooglePopup';
import LoadingSpinner from './components/shared/LoadingSpinner';
import Toast from './components/shared/Toast';
import AccessibilityWidget from './components/shared/AccessibilityWidget';
import ErrorBoundary from './components/shared/ErrorBoundary';
import NotFoundPage from './components/shared/NotFoundPage';

// Lazy-loaded pages — factory refs kept so we can preload them at idle
// The signed-in shell (sidebar, header, search, price ticker, calculator…) is
// its own chunk, so the login page — the first paint for every new visitor —
// doesn't download the whole app around it.
const Layout = lazy(() => import('./components/layout/Layout'));
const MotionShell = lazy(() => import('./components/shared/MotionShell'));
const AuthedProviders = lazy(() => import('./components/layout/AuthedProviders'));
const loadDashboard = () => import('./components/dashboard/Dashboard');
const loadTradeJournal = () => import('./components/journal/TradeJournal');
const loadBacktestTracker = () => import('./components/backtest/BacktestTracker');
const loadPortfolioPage = () => import('./components/portfolio/PortfolioPage');
const loadPlansPage = () => import('./components/plans/PlansPage');
const loadProfilePage = () => import('./components/profile/ProfilePage');
const loadMentalityZone = () => import('./components/mentality/MentalityZone');
const loadMorningJournal = () => import('./components/mentality/MorningJournal');
const loadEveningJournal = () => import('./components/mentality/EveningJournal');
const loadPsychologicalJourney = () => import('./components/mentality/PsychologicalJourney');
const loadMentalStats = () => import('./components/mentality/MentalStats');
const loadMarketOverview = () => import('./components/market/MarketOverview');
const loadTradeAIPage = () => import('./components/market/TradeAIPage');
const loadNewsPage = () => import('./components/news/NewsPage');
const loadPremiumPage = () => import('./components/premium/PremiumPage');
const loadCheckoutPage = () => import('./components/premium/CheckoutPage');
const loadCouponLanding = () => import('./components/premium/CouponLandingPage');
const loadRefundPolicy = () => import('./components/legal/RefundPolicyPage');
const loadAccessibility = () => import('./components/legal/AccessibilityStatement');
const loadScannerPage = () => import('./components/signals/SignalsPage');
const loadWalletDetailPage = () => import('./components/polymarket/WalletDetailPage');
const loadMarketDetailPage = () => import('./components/polymarket/MarketDetailPage');
const loadAdminPanel = () => import('./components/admin/AdminPanel');
const loadTaxReport = () => import('./components/tax/TaxReportPage');
const loadTerminal = () => import('./components/terminal/TerminalPage');

const Dashboard = lazy(loadDashboard);
const TradeJournal = lazy(loadTradeJournal);
const BacktestTracker = lazy(loadBacktestTracker);
const PortfolioPage = lazy(loadPortfolioPage);
const PlansPage = lazy(loadPlansPage);
const ProfilePage = lazy(loadProfilePage);
const MentalityZone = lazy(loadMentalityZone);
const MorningJournal = lazy(loadMorningJournal);
const EveningJournal = lazy(loadEveningJournal);
const PsychologicalJourney = lazy(loadPsychologicalJourney);
const MentalStats = lazy(loadMentalStats);
const MarketOverview = lazy(loadMarketOverview);
const TradeAIPage = lazy(loadTradeAIPage);
const NewsPage = lazy(loadNewsPage);
const PremiumPage = lazy(loadPremiumPage);
const CheckoutPage = lazy(loadCheckoutPage);
const CouponLandingPage = lazy(loadCouponLanding);
const RefundPolicyPage = lazy(loadRefundPolicy);
const AccessibilityStatement = lazy(loadAccessibility);
const ScannerPage = lazy(loadScannerPage);
const WalletDetailPage = lazy(loadWalletDetailPage);
const MarketDetailPage = lazy(loadMarketDetailPage);
const AdminPanel = lazy(loadAdminPanel);
const TaxReportPage = lazy(loadTaxReport);
const TerminalPage = lazy(loadTerminal);
const DesignPreview = lazy(() => import('./design-preview/DesignPreview'));

// Preload the two most-likely-next routes during idle, and only once someone
// is signed in. Doing this on /login downloaded Firestore, charts, and the
// journal during Lighthouse (about 59 scripts) and competed with first paint.
function IdleRoutePreload() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user) return undefined;
    const conn = navigator.connection;
    const saveData = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    if (saveData) return undefined;
    const run = () => {
      loadDashboard();
      loadTradeJournal();
    };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 1500);
    return () => clearTimeout(id);
  }, [user, loading]);
  return null;
}

// Polymarket now lives as a tab of the Market page. Old links may carry the
// board's sub-tab as ?tab=markets — carry it over as ?pm= so they still land
// on the same view.
function PolymarketRedirect() {
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('tab');
  const to = sub ? `/market?tab=polymarket&pm=${encodeURIComponent(sub)}` : '/market?tab=polymarket';
  return <Navigate to={to} replace />;
}

function MainApp() {
  return (
    <AuthProvider>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Login stays outside MotionShell and the Firestore providers.
                  Those chunks download when a visitor leaves this page. */}
              <Route path="/login" element={<LoginPage />} />
              {/* Design exploration only — public, not linked from the nav. */}
              <Route path="/design-preview" element={<DesignPreview />} />
              <Route element={<MotionShell />}>
              {/* Public coupon share landing — accessible without auth so a
                  shared link works for logged-out friends; redeeming itself
                  sends them through /login and back. */}
              <Route path="/redeem/:code" element={<CouponLandingPage />} />
              {/* Accessibility statement — public (reachable without login, as
                  required for an Israeli-standard accessibility statement). */}
              <Route path="/accessibility" element={<AccessibilityStatement />} />
              <Route element={<ProtectedRoute><AuthedProviders /></ProtectedRoute>}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="journal" element={<TradeJournal />} />
                {/* Live trading terminal: positions, open orders and multi-timeframe
                    charts from the connected exchanges (read-only). Its own boundary:
                    it embeds third-party chart iframes and polls exchanges. */}
                <Route path="terminal" element={<ErrorBoundary><TerminalPage /></ErrorBoundary>} />
                <Route path="backtest" element={<BacktestTracker />} />
                {/* DCA + wallets are the two tabs of the Portfolio page; the old
                    paths stay as redirects so links/bookmarks land right. */}
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="dca" element={<Navigate to="/portfolio?tab=dca" replace />} />
                <Route path="wallets" element={<Navigate to="/portfolio?tab=wallets" replace />} />
                <Route path="plans" element={<PlansPage />} />
                <Route path="tax" element={<TaxReportPage />} />
                <Route path="mentality" element={<MentalityZone />} />
                <Route path="mentality/morning" element={<MorningJournal />} />
                <Route path="mentality/evening" element={<EveningJournal />} />
                <Route path="mentality/journey" element={<PsychologicalJourney />} />
                <Route path="mentality/stats" element={<MentalStats />} />
                <Route path="market" element={<MarketOverview />} />
                {/* Whales live in their own tab of Market Overview; keep the old
                    path so links/bookmarks land on that tab. */}
                <Route path="whales" element={<Navigate to="/market?tab=whales" replace />} />
                {/* Wyckoff setup scanner — owner-only while it's being calibrated. */}
                <Route path="scanner" element={<AdminRoute><ScannerPage /></AdminRoute>} />
                {/* Polymarket is a tab of the Market page (locked teaser for
                    non-premium there); its detail pages keep their own routes
                    with their own boundary, since they stream live third-party data. */}
                <Route path="polymarket" element={<PolymarketRedirect />} />
                <Route path="polymarket/wallet/:address" element={<ErrorBoundary><WalletDetailPage /></ErrorBoundary>} />
                <Route path="polymarket/market/:conditionId" element={<ErrorBoundary><MarketDetailPage /></ErrorBoundary>} />
                <Route path="trade-ai" element={<TradeAIPage />} />
                <Route path="news" element={<NewsPage />} />
                {/* Exchange connections live in the journal's "exchange" tab. */}
                <Route path="exchange" element={<Navigate to="/journal?tab=exchange" replace />} />
                {/* Watchlist is now folded into the scanner page (tag coins there);
                    keep the path as a redirect so old links still land right. */}
                <Route path="watchlist" element={<Navigate to="/scanner" replace />} />
                <Route path="premium" element={<PremiumPage />} />
                <Route path="premium/checkout" element={<CheckoutPage />} />
                <Route path="refund-policy" element={<RefundPolicyPage />} />
                <Route path="admin" element={<AdminPanel />} />
                <Route path="profile" element={<ProfilePage />} />
                {/* Unknown URLs get a real "not found" page with a way home
                    (they used to bounce to the dashboard without a word). */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              </Route>
              </Route>
            </Routes>
          </Suspense>
          <IdleRoutePreload />
          <Toast />
          {/* Site-wide accessibility menu — present on every route, including
              login, so it must not import framer-motion. */}
          <AccessibilityWidget />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* Global gradient def — lets lucide icons render in the violet→cyan accent
          gradient via stroke="url(#ai-grad)" (SVG can't use CSS background-clip). */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          {/* Electric-blue brand gradient — deep blue → sky, matching the
              redesign accent (--accent-gradient). */}
          <linearGradient id="ai-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
      <BrowserRouter>
        <Routes>
          {/* Standalone popup page — outside AuthProvider so getRedirectResult isn't consumed by AuthContext */}
          <Route path="/auth-google" element={<AuthGooglePopup />} />
          {/* Main app with all providers */}
          <Route path="*" element={<MainApp />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
