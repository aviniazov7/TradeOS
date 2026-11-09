// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Avi', emailVerified: true },
    profile: { displayName: 'Avi' },
    isPremium: true,
    loading: false,
    needsEmailVerification: false,
  }),
}));

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ journals: [], setActiveJournalId: () => {} }),
}));

vi.mock('../../hooks/useTrades', () => ({
  useTrades: () => ({ trades: [], loading: false }),
}));

vi.mock('../../hooks/useBacktests', () => ({
  useBacktests: () => ({ backtests: [], loading: false }),
}));

vi.mock('../../hooks/useTradingPlans', () => ({
  useTradingPlans: () => ({ plans: [], loading: false }),
}));

vi.mock('../../hooks/useDCA', () => ({
  useDCA: () => ({ dcaPlans: [], loading: false }),
}));

vi.mock('../../hooks/useMentalityJournals', () => ({
  useMentalityJournals: () => ({ todayMorning: null, todayEvening: null, morningEntries: [], eveningEntries: [] }),
}));

vi.mock('../../hooks/useLinkedExchangeBalance', () => ({
  useLinkedJournals: () => ({ balances: {}, problems: {} }),
  useLinkedExchangeBalance: () => null,
}));

vi.mock('../../services/firestoreService', () => ({
  getUserProfile: vi.fn(async () => ({ exists: true, data: { onboardingCompleted: true } })),
  setUserProfile: vi.fn(async () => {}),
  getUserSetting: vi.fn(async () => null),
  setUserSetting: vi.fn(async () => {}),
  getUserCollectionDocs: vi.fn(async () => []),
  subscribeToUserProfile: vi.fn(() => () => {}),
  subscribeToUserSetting: vi.fn(() => () => {}),
  subscribeToUserCollection: vi.fn(() => () => {}),
  peekUserCollection: vi.fn(() => undefined),
  seedUserCollection: vi.fn(() => ({ data: [], loading: false })),
  getOpenTrades: vi.fn(async () => []),
}));

vi.mock('../../services/exchangeService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getConnectedExchanges: vi.fn(async () => []),
  };
});

vi.mock('../../hooks/usePolymarkets', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usePolymarkets: () => ({
      markets: [{
        conditionId: 'c1',
        question: 'Will it rain?',
        prices: [0.6, 0.4],
        outcomes: ['Yes', 'No'],
        priceSum: 1,
        volume24hr: 10,
        liquidity: 20,
        isNew: false,
      }],
      loading: false,
      error: null,
      refetch: () => {},
    }),
  };
});

function isUndefinedElement(err) {
  const msg = String(err?.message || err);
  return msg.includes('Element type is invalid') || msg.includes('Minified React error #130');
}

function renderTree(node) {
  return renderToString(node);
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  const html = document.body.innerHTML;
  await act(async () => { root.unmount(); });
  el.remove();
  return html;
}

// The signed-in shell, in the same order App.jsx mounts it.
const LAZY_ROUTES = [
  ['Layout', () => import('../../components/layout/Layout')],
  ['MotionShell', () => import('../../components/shared/MotionShell')],
  ['AuthedProviders', () => import('../../components/layout/AuthedProviders')],
  ['Dashboard', () => import('../../components/dashboard/Dashboard')],
  ['TradeJournal', () => import('../../components/journal/TradeJournal')],
  ['BacktestTracker', () => import('../../components/backtest/BacktestTracker')],
  ['PortfolioPage', () => import('../../components/portfolio/PortfolioPage')],
  ['PlansPage', () => import('../../components/plans/PlansPage')],
  ['ProfilePage', () => import('../../components/profile/ProfilePage')],
  ['MentalityZone', () => import('../../components/mentality/MentalityZone')],
  ['MorningJournal', () => import('../../components/mentality/MorningJournal')],
  ['EveningJournal', () => import('../../components/mentality/EveningJournal')],
  ['PsychologicalJourney', () => import('../../components/mentality/PsychologicalJourney')],
  ['MentalStats', () => import('../../components/mentality/MentalStats')],
  ['MarketOverview', () => import('../../components/market/MarketOverview')],
  ['TradeAIPage', () => import('../../components/market/TradeAIPage')],
  ['NewsPage', () => import('../../components/news/NewsPage')],
  ['PremiumPage', () => import('../../components/premium/PremiumPage')],
  ['CheckoutPage', () => import('../../components/premium/CheckoutPage')],
  ['CouponLandingPage', () => import('../../components/premium/CouponLandingPage')],
  ['RefundPolicyPage', () => import('../../components/legal/RefundPolicyPage')],
  ['AccessibilityStatement', () => import('../../components/legal/AccessibilityStatement')],
  ['WalletDetailPage', () => import('../../components/polymarket/WalletDetailPage')],
  ['MarketDetailPage', () => import('../../components/polymarket/MarketDetailPage')],
  ['AdminPanel', () => import('../../components/admin/AdminPanel')],
  ['TaxReportPage', () => import('../../components/tax/TaxReportPage')],
  ['BusinessLedgerPage', () => import('../../components/business/BusinessLedgerPage')],
  ['NotebookPage', () => import('../../components/notebook/NotebookPage')],
  ['OpenPositionsTab', () => import('../../components/journal/OpenPositionsTab')],
  ['MarketsExplorer', () => import('../../components/polymarket/MarketsExplorer')],
  ['StrategyTab', () => import('../../components/polymarket/StrategyTab')],
];

describe('signed-in home renders', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    const animation = {
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
      finished,
      ready: finished,
      currentTime: 0,
      playState: 'finished',
    };
    window.HTMLElement.prototype.animate = () => animation;
  });

  it('mounts the dashboard route tree with real motion elements', async () => {
    const { default: MotionShell } = await import('../../components/shared/MotionShell');
    const { default: Layout } = await import('../../components/layout/Layout');
    const { default: Dashboard } = await import('../../components/dashboard/Dashboard');
    const html = await mount(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<MotionShell />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toContain('עסקה חדשה');
    expect(html).toContain('חבר בורסה');
    expect(html).toMatch(/בוקר טוב|צהריים טובים|ערב טוב|לילה טוב/);
  });

  it('renders a loaded polymarket detail without an undefined element', async () => {
    const { default: MarketDetailPage } = await import('../../components/polymarket/MarketDetailPage');
    const market = {
      conditionId: 'abc',
      question: 'Will it rain?',
      outcomes: ['Yes', 'No'],
      prices: [0.7, 0.3],
      volume24hr: 5,
      liquidity: 8,
      spread: 0.01,
      eventSlug: 'evt',
      slug: 'abc',
    };
    const html = renderTree(
      <MemoryRouter initialEntries={[{ pathname: '/polymarket/market/abc', state: { market } }]}>
        <LazyMotion features={domAnimation} strict>
          <Routes>
            <Route path="/polymarket/market/:conditionId" element={<MarketDetailPage />} />
          </Routes>
        </LazyMotion>
      </MemoryRouter>,
    );
    expect(html).toContain('Will it rain?');
  });

  it('renders the markets list rows as motion elements', async () => {
    const { default: MarketsExplorer } = await import('../../components/polymarket/MarketsExplorer');
    const html = renderTree(
      <MemoryRouter>
        <LazyMotion features={domAnimation} strict>
          <MarketsExplorer />
        </LazyMotion>
      </MemoryRouter>,
    );
    expect(html).toContain('Will it rain?');
  });

  it('every lazy route is a component and does not render an undefined type', async () => {
    for (const [name, load] of LAZY_ROUTES) {
      const mod = await load();
      expect(typeof mod.default, name).toBe('function');
      const Page = mod.default;
      try {
        renderTree(
          <MemoryRouter>
            <LazyMotion features={domAnimation} strict>
              <Page />
            </LazyMotion>
          </MemoryRouter>,
        );
      } catch (err) {
        if (isUndefinedElement(err)) throw new Error(`${name} rendered an undefined component: ${err.message}`);
      }
    }
  });
});
