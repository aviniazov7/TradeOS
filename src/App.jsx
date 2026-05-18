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
const loadNewsPage = () => import('./components/news/NewsPage');
const loadExchangeSettings = () => import('./components/exchange/ExchangeSettings');
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
const NewsPage = lazy(loadNewsPage);
const ExchangeSettings = lazy(loadExchangeSettings);
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
    loadNewsPage();
    loadExchangeSettings();
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
                <Route path="news" element={<NewsPage />} />
                <Route path="exchange" element={<ExchangeSettings />} />
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
