import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { JournalProvider } from './contexts/JournalContext';
import { BacktestProvider } from './contexts/BacktestContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import AuthGooglePopup from './components/auth/AuthGooglePopup';
import AuthEmailLink from './components/auth/AuthEmailLink';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/shared/LoadingSpinner';
import Toast from './components/shared/Toast';
import UpdatePrompt from './components/shared/UpdatePrompt';
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
const loadMarketOverview = () => import('./components/market/MarketOverview');
const loadTradeAIPage = () => import('./components/market/TradeAIPage');
const loadNewsPage = () => import('./components/news/NewsPage');
const loadExchangeSettings = () => import('./components/exchange/ExchangeSettings');
const loadWalletsPage = () => import('./components/wallets/WalletsPage');
const loadWatchlistPage = () => import('./components/watchlist/WatchlistPage');
const loadPremiumPage = () => import('./components/premium/PremiumPage');
const loadCheckoutPage = () => import('./components/premium/CheckoutPage');
const loadCouponLanding = () => import('./components/premium/CouponLandingPage');
const loadRefundPolicy = () => import('./components/legal/RefundPolicyPage');
const loadAdminPanel = () => import('./components/admin/AdminPanel');

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
const MarketOverview = lazy(loadMarketOverview);
const TradeAIPage = lazy(loadTradeAIPage);
const NewsPage = lazy(loadNewsPage);
const ExchangeSettings = lazy(loadExchangeSettings);
const WalletsPage = lazy(loadWalletsPage);
const WatchlistPage = lazy(loadWatchlistPage);
const PremiumPage = lazy(loadPremiumPage);
const CheckoutPage = lazy(loadCheckoutPage);
const CouponLandingPage = lazy(loadCouponLanding);
const RefundPolicyPage = lazy(loadRefundPolicy);
const AdminPanel = lazy(loadAdminPanel);

// Preload all routes during idle time so tab switches feel instant
if (typeof window !== 'undefined') {
  const idle =
    window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
  idle(() => {
    loadDashboard();
    loadTradeJournal();
    loadBacktestTracker();
    loadDCATracker();
    loadMentalityZone();
    loadMentalStats();
    loadMorningJournal();
    loadEveningJournal();
    loadPsychologicalJourney();
    loadPlansPage();
    loadProfilePage();
    loadMarketOverview();
    loadTradeAIPage();
    loadNewsPage();
    loadExchangeSettings();
    loadWalletsPage();
    loadWatchlistPage();
    loadPremiumPage();
    loadCheckoutPage();
  });
}

function MainApp() {
  return (
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
                <Route path="mentality" element={<MentalityZone />} />
                <Route path="mentality/morning" element={<MorningJournal />} />
                <Route path="mentality/evening" element={<EveningJournal />} />
                <Route path="mentality/journey" element={<PsychologicalJourney />} />
                <Route path="mentality/stats" element={<MentalStats />} />
                {/* <Route path="leaderboard" element={<LeaderboardPage />} /> */}
                <Route path="market" element={<MarketOverview />} />
                <Route path="trade-ai" element={<TradeAIPage />} />
                <Route path="news" element={<NewsPage />} />
                <Route path="exchange" element={<ExchangeSettings />} />
                <Route path="wallets" element={<WalletsPage />} />
                <Route path="watchlist" element={<WatchlistPage />} />
                <Route path="premium" element={<PremiumPage />} />
                <Route path="premium/checkout" element={<CheckoutPage />} />
                <Route path="refund-policy" element={<RefundPolicyPage />} />
                <Route path="admin" element={<AdminPanel />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
            </Routes>
          </Suspense>
          <Toast />
          <UpdatePrompt />
        </BacktestProvider>
      </JournalProvider>
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
          {/* Cyan-dominant (more turquoise than violet) to match the gradient
              text — violet only as a hint at the end. */}
          <linearGradient id="ai-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <BrowserRouter>
        <Routes>
          {/* Standalone popup page — outside AuthProvider so getRedirectResult isn't consumed by AuthContext */}
          <Route path="/auth-google" element={<AuthGooglePopup />} />
          <Route path="/auth-email-link" element={<AuthEmailLink />} />
          {/* Main app with all providers */}
          <Route path="*" element={<MainApp />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
