// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TradeForm from './TradeForm';

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
  useJournalContext: () => ({ activeJournal: { id: 'j1', assetClass: 'crypto' }, activeJournalId: 'j1' }),
}));
vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));
vi.mock('../../services/coinImageCache', () => ({ cacheImage: vi.fn(), clearCachedImage: vi.fn() }));
vi.mock('../shared/CoinIcon', () => ({ default: () => null }));

const WARNING = 'חריגה מכללי הסיכון: הפסד שבועי. הרישום עדיין פתוח.';

describe('new trade risk warning', () => {
  let view;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  afterEach(() => {
    if (!view) return;
    act(() => { view.unmount(); });
    view = null;
  });

  function render(props = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => {
      root.render(<TradeForm isOpen onClose={() => {}} onSave={() => {}} {...props} />);
    });
    view = {
      host: el,
      rerender(next) {
        act(() => { root.render(<TradeForm isOpen onClose={() => {}} onSave={() => {}} {...next} />); });
      },
      unmount() { root.unmount(); el.remove(); },
    };
  }

  function saveButton() {
    return [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'שמור עסקה');
  }

  it('warns on a new trade and leaves save enabled', () => {
    const onDismissBreach = vi.fn();
    render({ breachWarning: WARNING, onDismissBreach });
    const warning = document.querySelector('[data-testid="trade-risk-warning"]');
    expect(warning.getAttribute('role')).toBe('status');
    expect(warning.getAttribute('dir')).toBe('rtl');
    expect(warning.className).toContain('border-loss/30');
    expect(warning.className).toContain('bg-loss/10');
    expect(warning.className).toContain('text-loss');
    expect(warning.textContent).toContain('הרישום עדיין פתוח');
    expect(saveButton().disabled).toBe(false);
    act(() => { document.querySelector('[data-testid="trade-risk-warning-dismiss"]').click(); });
    expect(onDismissBreach).toHaveBeenCalledOnce();
    expect(saveButton().disabled).toBe(false);
  });

  it('draws nothing when the journal is inside its rules', () => {
    render();
    expect(document.querySelector('[data-testid="trade-risk-warning"]')).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it('hides the warning after it is dismissed for the day', () => {
    render({ breachWarning: WARNING, onDismissBreach: () => {} });
    view.rerender({ breachWarning: null, onDismissBreach: () => {} });
    expect(document.querySelector('[data-testid="trade-risk-warning"]')).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });
});
