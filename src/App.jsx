import { lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { JournalProvider } from './contexts/JournalContext';
import { BacktestProvider } from './contexts/BacktestContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PremiumRoute from './components/auth/PremiumRoute';
import AdminRoute from './components/auth/AdminRoute';
import LoginPage from './components/auth/LoginPage';
import AuthGooglePopup from './components/auth/AuthGooglePopup';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/shared/LoadingSpinner';
import Toast from './components/shared/Toast';
import AccessibilityWidget from './components/shared/AccessibilityWidget';
import ErrorBoundary from './components/shared/ErrorBoundary';

// Lazy-loaded pages — factory refs kept so we can preload them at idle
const loadDashboard = () => import('./components/dashboard/Dashboard');
const loadTradeJournal = () => import('./components/journal/TradeJournal');
const loadBacktestTracker = () => import('./components/backtest/BacktestTracker');
const loadDCATracker = () => import('./components/dca/DCATracker');
const loadPlansPage = () => import('./components/plans/PlansPage');
const loadProfilePage = () => import('./components/profile/ProfilePage');
const loadMentalityZone = () => import('./components/mentality/MentalityZone');
const loadMorningJournal = () => import('./components/mentality/MorningJournal');
const loadEveningJournal = () => import('./components/mentality/EveningJournal');
const loadPsychologicalJourney = () => import('./components/mentality/PsychologicalJourney');
const loadMentalStats = () => import('./components/mentality/MentalStats');
const loadAnalystPage = () => import('./components/analyst/AnalystPage');
const loadMarketOverview = () => import('./components/market/MarketOverview');
const loadTradeAIPage = () => import('./components/market/TradeAIPage');
const loadNewsPage = () => import('./components/news/NewsPage');
const loadExchangeSettings = () => import('./components/exchange/ExchangeSettings');
const loadWalletsPage = () => import('./components/wallets/WalletsPage');
const loadPremiumPage = () => import('./components/premium/PremiumPage');
const loadCheckoutPage = () => import('./components/premium/CheckoutPage');
const loadCouponLanding = () => import('./components/premium/CouponLandingPage');
const loadRefundPolicy = () => import('./components/legal/RefundPolicyPage');
const loadAccessibility = () => import('./components/legal/AccessibilityStatement');
const loadScannerPage = () => import('./components/signals/SignalsPage');
const loadPolymarketPage = () => import('./components/polymarket/PolymarketPage');
const loadWalletDetailPage = () => import('./components/polymarket/WalletDetailPage');
const loadMarketDetailPage = () => import('./components/polymarket/MarketDetailPage');
const loadAdminPanel = () => import('./components/admin/AdminPanel');
// Redesign preview — new "Daily Briefing" home screen (blue + bilingual).
// Lives at /briefing so we can review the direction without touching the
// current home. Not linked from the nav yet.
const loadDailyBriefing = () => import('./components/redesign/DailyBriefing');

const Dashboard = lazy(loadDashboard);
const TradeJournal = lazy(loadTradeJournal);
const BacktestTracker = lazy(loadBacktestTracker);
const DCATracker = lazy(loadDCATracker);
const PlansPage = lazy(loadPlansPage);
const ProfilePage = lazy(loadProfilePage);
const MentalityZone = lazy(loadMentalityZone);
const MorningJournal = lazy(loadMorningJournal);
const EveningJournal = lazy(loadEveningJournal);
const PsychologicalJourney = lazy(loadPsychologicalJourney);
const MentalStats = lazy(loadMentalStats);
const AnalystPage = lazy(loadAnalystPage);
const MarketOverview = lazy(loadMarketOverview);
const TradeAIPage = lazy(loadTradeAIPage);
const NewsPage = lazy(loadNewsPage);
const ExchangeSettings = lazy(loadExchangeSettings);
const WalletsPage = lazy(loadWalletsPage);
const PremiumPage = lazy(loadPremiumPage);
const CheckoutPage = lazy(loadCheckoutPage);
const CouponLandingPage = lazy(loadCouponLanding);
const RefundPolicyPage = lazy(loadRefundPolicy);
const AccessibilityStatement = lazy(loadAccessibility);
const ScannerPage = lazy(loadScannerPage);
const PolymarketPage = lazy(loadPolymarketPage);
const WalletDetailPage = lazy(loadWalletDetailPage);
const MarketDetailPage = lazy(loadMarketDetailPage);
const AdminPanel = lazy(loadAdminPanel);
const DailyBriefing = lazy(loadDailyBriefing);

// Preload only the two most-likely-next routes during idle — and skip entirely
// on Save-Data / slow connections. This is an installable PWA, so eagerly
// pulling all ~19 route chunks (incl. the 400KB charts + 130KB datepicker)
// burned mobile data for pages a user might never open. Everything else still
// lazy-loads on demand when its route is actually visited.
if (typeof window !== 'undefined') {
  const conn = navigator.connection;
  const saveData = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
  if (!saveData) {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => {
      loadDashboard();
      loadTradeJournal();
    });
  }
}

function MainApp() {
  return (
    // reducedMotion="user" makes every framer-motion animation respect the OS
    // "reduce motion" setting (the CSS block in index.css can't reach JS-driven
    // motion). Transforms/opacity are dropped; layout is preserved.
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      <JournalProvider>
        <BacktestProvider>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Public coupon share landing — accessible without auth so a
                  shared link works for logged-out friends; redeeming itself
                  sends them through /login and back. */}
              <Route path="/redeem/:code" element={<CouponLandingPage />} />
              {/* Accessibility statement — public (reachable without login, as
                  required for an Israeli-standard accessibility statement). */}
              <Route path="/accessibility" element={<AccessibilityStatement />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="journal" element={<TradeJournal />} />
                <Route path="backtest" element={<BacktestTracker />} />
                <Route path="dca" element={<DCATracker />} />
                <Route path="plans" element={<PlansPage />} />
                <Route path="analyst" element={<ErrorBoundary><AnalystPage /></ErrorBoundary>} />
                <Route path="mentality" element={<MentalityZone />} />
                <Route path="mentality/morning" element={<MorningJournal />} />
                <Route path="mentality/evening" element={<EveningJournal />} />
                <Route path="mentality/journey" element={<PsychologicalJourney />} />
                <Route path="mentality/stats" element={<MentalStats />} />
                {/* <Route path="leaderboard" element={<LeaderboardPage />} /> */}
                <Route path="market" element={<MarketOverview />} />
                {/* Whales moved into Market Overview; keep the path as a redirect
                    so old links/bookmarks still land somewhere sensible. */}
                <Route path="whales" element={<Navigate to="/market" replace />} />
                {/* Wyckoff setup scanner — owner-only while it's being calibrated. */}
                <Route path="scanner" element={<AdminRoute><ScannerPage /></AdminRoute>} />
                {/* Visible to all in the menu; the page shows a locked teaser to non-premium (no PremiumRoute redirect). */}
                {/* Own boundary: this section streams live third-party data, so a
                    throw here should degrade the page, not blank the whole app. */}
                <Route path="polymarket" element={<ErrorBoundary><PolymarketPage /></ErrorBoundary>} />
                <Route path="polymarket/wallet/:address" element={<ErrorBoundary><WalletDetailPage /></ErrorBoundary>} />
                <Route path="polymarket/market/:conditionId" element={<ErrorBoundary><MarketDetailPage /></ErrorBoundary>} />
                <Route path="trade-ai" element={<TradeAIPage />} />
                <Route path="news" element={<NewsPage />} />
                <Route path="exchange" element={<ExchangeSettings />} />
                <Route path="wallets" element={<WalletsPage />} />
                {/* Watchlist is now folded into the scanner page (tag coins there);
                    keep the path as a redirect so old links still land right. */}
                <Route path="watchlist" element={<Navigate to="/scanner" replace />} />
                <Route path="premium" element={<PremiumPage />} />
                <Route path="premium/checkout" element={<CheckoutPage />} />
                <Route path="refund-policy" element={<RefundPolicyPage />} />
                <Route path="admin" element={<AdminPanel />} />
                <Route path="briefing" element={<DailyBriefing />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
            </Routes>
          </Suspense>
          <Toast />
          {/* Site-wide accessibility menu — present on every route. */}
          <AccessibilityWidget />
        </BacktestProvider>
      </JournalProvider>
    </AuthProvider>
    </MotionConfig>
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
