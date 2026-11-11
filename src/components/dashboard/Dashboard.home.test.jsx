// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LazyMotion, domAnimation } from 'framer-motion';

const DAY = 86400000;

function closed(partial) {
  const pnl = partial.pnl;
  const exitDate = new Date(Date.now() - partial.days * DAY);
  return {
    id: partial.id,
    pair: partial.pair,
    direction: partial.direction || 'long',
    status: 'closed',
    result: pnl >= 0 ? 'win' : 'loss',
    pnl,
    netPnl: pnl,
    quantity: 1,
    entryPrice: 100,
    exitPrice: 110,
    stopLoss: 90,
    journalId: partial.journalId || 'j1',
    entryDate: new Date(exitDate.getTime() - 3600000),
    exitDate,
  };
}

const TRADES = [
  closed({ id: 'a', pair: 'BTCUSDT', pnl: 200, days: 1 }),
  closed({ id: 'b', pair: 'ETHUSDT', pnl: -50, days: 3, direction: 'short' }),
  closed({ id: 'c', pair: 'SOLUSDT', pnl: 80, days: 8 }),
  closed({ id: 'd', pair: 'BTCUSDT', pnl: 40, days: 12, direction: 'short' }),
  closed({ id: 'e', pair: 'ETHUSDT', pnl: -20, days: 20 }),
  closed({ id: 'f', pair: 'SOLUSDT', pnl: 30, days: 30 }),
];

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Avi', emailVerified: true },
    profile: { displayName: 'Avi', onboardingCompleted: true },
    isPremium: true,
    loading: false,
  }),
}));

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    journals: [
      { id: 'j1', name: 'יומן ראשי', exchange: 'binance', initialBalance: 8000 },
      { id: 'j2', name: 'מניות', exchange: '', initialBalance: 2000 },
    ],
    activeJournalId: 'j1',
    setActiveJournalId: () => {},
    loading: false,
  }),
}));

vi.mock('../../hooks/useTrades', () => ({
  useTrades: () => ({ trades: TRADES, loading: false }),
}));

vi.mock('../../hooks/useBacktests', () => ({
  useBacktests: () => ({ backtests: [{ id: 'b1', result: 'win', rResult: 1, pair: 'BTCUSDT', strategy: 'Breakout', backtestJournalId: 'j1' }], loading: false }),
}));

vi.mock('../../hooks/useTradingPlans', () => ({
  useTradingPlans: () => ({ plans: [{ id: 'p1', isActive: true }], loading: false }),
}));

vi.mock('../../hooks/useDCA', () => ({
  useDCA: () => ({ dcaPlans: [], loading: false }),
}));

vi.mock('../../hooks/useMentalityJournals', () => ({
  useMentalityJournals: () => ({ todayMorning: { id: 'm' }, todayEvening: null, morningEntries: [{ id: 'm' }], eveningEntries: [] }),
}));

vi.mock('../../hooks/useLinkedExchangeBalance', () => ({
  useLinkedJournals: () => ({ balances: { j1: 9000 }, problems: {} }),
  useLinkedExchangeBalance: () => null,
}));

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ active: false, enter() {}, exit() {} }),
}));

vi.mock('../../hooks/useExchangeConnected', () => ({
  useExchangeConnected: () => true,
}));

vi.mock('../../hooks/useTerminalData', () => ({
  HOME_POLL_MS: 60000,
  useTerminalData: () => ({ connected: [], snapshots: {}, marks: {}, openTrades: [], loading: false, refresh() {} }),
}));

vi.mock('../../services/globalMarket', () => ({
  fetchGlobalMarket: vi.fn(async () => ({
    total_market_cap: { usd: 2.1e12 },
    total_volume: { usd: 8e10 },
    market_cap_change_percentage_24h_usd: 1.2,
    market_cap_percentage: { btc: 54 },
  })),
}));

vi.mock('../../services/newsService', () => ({
  fetchNewsFeed: vi.fn(async () => ([
    { title: 'כותרת בדיקה', link: 'https://example.com/n', pubDate: new Date().toISOString(), sourceLabel: 'Example' },
  ])),
  translateNews: vi.fn(async () => null),
  unpackNewsTranslations: () => ({ items: null, quotaExceeded: false }),
}));

function Location() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>;
}

async function mount() {
  const { default: Dashboard } = await import('./Dashboard');
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <LazyMotion features={domAnimation} strict>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/journal" element={<Location />} />
            <Route path="/news" element={<Location />} />
          </Routes>
        </LazyMotion>
      </MemoryRouter>,
    );
  });
  return {
    el,
    text: () => el.textContent,
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('home dashboard', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ value: '40', value_classification: 'Fear' }] }) })));
  });

  it('renders the book from real trade data and not the prototype sample', async () => {
    localStorage.removeItem('tradeos_hideBalances');
    const view = await mount();
    const text = view.text();
    expect(text).toMatch(/בוקר טוב|צהריים טובים|ערב טוב|לילה טוב/);
    expect(text).toContain('Avi');
    expect(text).toContain('עסקה חדשה');
    expect(text).toContain('הסתר סכומים');
    expect(text).toContain('מסונכרן מהבורסה');
    expect(text).toContain('Binance');
    expect(text).toContain('6 עסקאות סגורות');
    expect(text).toContain('יומן ראשי');
    expect(text).toContain('BTCUSDT');
    expect(text).toContain('קיצורי דרך');
    expect(text).toContain('השוק עכשיו');
    expect(text).not.toContain('$52,480');
    expect(text).not.toContain('47 עסקאות');
    expect(view.el.querySelector('[dir="ltr"]')).toBeTruthy();
    expect(view.el.querySelector('.home-dash')).toBeTruthy();
    await view.unmount();
  });

  it('persists hidden balances and still opens the existing new-trade flow', async () => {
    localStorage.setItem('tradeos_hideBalances', 'false');
    const view = await mount();
    const hide = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('הסתר סכומים'));
    await act(async () => { hide.click(); });
    expect(localStorage.getItem('tradeos_hideBalances')).toBe('true');
    expect(view.text()).toContain('••••');
    expect(view.text()).not.toContain('+$200.00');
    const add = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('עסקה חדשה'));
    await act(async () => { add.click(); });
    expect(view.el.querySelector('[data-testid="loc"]').textContent).toBe('/journal?new=1');
    await view.unmount();
  });
});
