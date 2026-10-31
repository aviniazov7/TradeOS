// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TradeForm from './TradeForm';
import { inlineFlagSrc } from '../../utils/inlineFlags';

vi.mock('../../hooks/useUserStrategies', () => ({
  useUserStrategies: () => ({ allStrategies: [], addStrategy: () => {}, removeStrategy: () => {} }),
}));
vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['4H'], addTimeframe: () => {}, removeTimeframe: () => {} }),
}));
vi.mock('../../hooks/useUserTriggers', () => ({
  useUserTriggers: () => ({ allTriggers: [], addTrigger: () => {}, removeTrigger: () => {} }),
}));
vi.mock('../../hooks/useUserTags', () => ({
  useUserTags: () => ({ allTags: [], addTag: () => {}, removeTag: () => {} }),
}));
vi.mock('../../hooks/useUserSetups', () => ({
  useUserSetups: () => ({ allSetups: [], addSetup: () => {}, removeSetup: () => {} }),
}));
vi.mock('../../hooks/useUserMistakes', () => ({
  useUserMistakes: () => ({ allMistakes: [], addMistake: () => {}, removeMistake: () => {} }),
}));
vi.mock('../../hooks/useTradingPlans', () => ({
  useTradingPlans: () => ({ plans: [] }),
}));
vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    activeJournal: { id: 'j1', assetClass: 'crypto' },
    activeJournalId: 'j1',
  }),
}));
vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));

describe('live journal pair picker', () => {
  let view;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  afterEach(() => {
    if (!view) return;
    act(() => { view.unmount(); });
    view = null;
  });

  it('offers Metals, Forex and Indices and reuses the shared symbol icon', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<TradeForm isOpen onClose={() => {}} onSave={() => {}} />); });
    view = { unmount() { root.unmount(); el.remove(); } };

    const chip = [...document.querySelectorAll('div')].find((d) => (
      d.textContent.trim() === 'BTCUSDT' && d.className.includes('cursor-pointer')
    ));
    act(() => { chip.click(); });

    expect(document.body.textContent).toContain('Metals');
    expect(document.body.textContent).toContain('Forex');
    expect(document.body.textContent).toContain('Indices');
    const gold = document.querySelector('[data-pair="XAUUSD"] img');
    expect(gold?.getAttribute('src')).toBe('/logos/symbols/gold-coin.svg');
    const euro = document.querySelector('[data-pair="EURUSD"] img');
    expect(euro?.getAttribute('src')).toBe(inlineFlagSrc('EURUSD'));
    const nasdaq = document.querySelector('[data-pair="NAS100"] img');
    expect(nasdaq?.getAttribute('src')).toBe(inlineFlagSrc('NAS100'));

    act(() => { document.querySelector('[data-pair="XAUUSD"]').click(); });
    expect(document.body.textContent).toContain('Metals');
    expect(document.body.textContent).not.toContain('קריפטו ·');
  });
});
