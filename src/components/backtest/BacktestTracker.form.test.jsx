// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const state = vi.hoisted(() => ({
  journal: { id: 'j1', name: 'יומן', pairs: ['EURUSD', 'GBPUSD'] },
  backtests: [],
}));

vi.mock('../../contexts/BacktestContext', () => ({
  useBacktestContext: () => ({
    activeJournal: state.journal,
    activeJournalId: state.journal?.id || null,
    loading: false,
    journals: state.journal ? [state.journal] : [],
    setActiveJournalId: () => {},
    addJournal: async () => {},
  }),
}));

vi.mock('../../hooks/useBacktests', () => ({
  useBacktests: () => ({
    backtests: state.backtests,
    loading: false,
    addBacktest: async () => {},
    updateBacktest: async () => {},
    deleteBacktest: async () => {},
  }),
}));

vi.mock('../../hooks/useUserStrategies', () => ({
  useUserStrategies: () => ({ allStrategies: [], addStrategy: () => {}, removeStrategy: () => {} }),
}));
vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['4H'], addTimeframe: () => {}, removeTimeframe: () => {} }),
}));
vi.mock('../../hooks/useUserTriggers', () => ({
  useUserTriggers: () => ({ allTriggers: [], addTrigger: () => {}, removeTrigger: () => {} }),
}));
vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false }),
}));

import BacktestTracker from './BacktestTracker';
import { inlineFlagSrc } from '../../utils/inlineFlags';

describe('new backtest trade form', () => {
  let view;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  afterEach(() => {
    if (!view) return;
    act(() => { view.unmount(); });
    view = null;
    state.journal = { id: 'j1', name: 'יומן', pairs: ['EURUSD', 'GBPUSD'] };
    state.backtests = [];
  });

  function render() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<BacktestTracker />); });
    view = { unmount() { root.unmount(); el.remove(); } };
  }

  function openNew() {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('עסקה חדשה') || b.textContent.includes('הוסף עסקה ראשונה'));
    act(() => { button.click(); });
  }

  function closedSymbol(symbol) {
    return [...document.querySelectorAll('div')].find((d) => (
      d.className.includes('cursor-pointer') && d.textContent.trim() === symbol
    ));
  }

  it('defaults to the journal\'s first symbol and shows its icon', () => {
    render();
    openNew();
    const chip = closedSymbol('EURUSD');
    expect(chip).toBeTruthy();
    expect(chip.querySelector('img')?.getAttribute('src')).toBe(inlineFlagSrc('EURUSD'));
    expect(closedSymbol('BTCUSDT')).toBeFalsy();
    expect(document.body.textContent).toContain('חובה טריגר או אסטרטגיה');
    const labels = [...document.querySelectorAll('label')].map((el) => el.textContent);
    expect(labels.some((text) => text.includes('אסטרטגיה') && text.includes('*'))).toBe(true);
    expect(labels.some((text) => text.includes('טריגר כניסה') && text.includes('*'))).toBe(true);
  });

  it('defaults to the last symbol used in the journal when none are selected', () => {
    state.journal = { id: 'j2', name: 'ריק', pairs: [] };
    state.backtests = [
      { id: 'a', pair: 'EURUSD', date: '2026-01-01' },
      { id: 'b', pair: 'NAS100', date: '2026-08-01' },
    ];
    render();
    openNew();
    const chip = closedSymbol('NAS100');
    expect(chip?.querySelector('img')?.getAttribute('src')).toBe(inlineFlagSrc('NAS100'));
    expect(closedSymbol('BTCUSDT')).toBeFalsy();
  });
});
