// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TradeForm from './TradeForm';

vi.mock('../../hooks/useUserStrategies', () => ({
  useUserStrategies: () => ({
    allStrategies: ['Wyckoff', 'Order Block', 'AMD'],
    addStrategy: () => {},
    removeStrategy: () => {},
  }),
}));
vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['15m', '4H'], addTimeframe: () => {}, removeTimeframe: () => {} }),
}));
vi.mock('../../hooks/useUserTriggers', () => ({
  useUserTriggers: () => ({
    allTriggers: ['Spring', 'LPSY', 'SOS', 'Upthrust', 'BU/LPS', 'BOS'],
    addTrigger: () => {},
    removeTrigger: () => {},
  }),
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
vi.mock('../../services/coinImageCache', () => ({ cacheImage: vi.fn(), clearCachedImage: vi.fn() }));
vi.mock('../shared/CoinIcon', () => ({ default: () => null }));

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function buttonNamed(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
}

function radio(label) {
  return [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes(label));
}

describe('new trade defaults', () => {
  let view;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => { localStorage.clear(); });

  afterEach(() => {
    if (!view) return;
    act(() => { view.unmount(); });
    view = null;
  });

  function render() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => {
      root.render(<TradeForm isOpen onClose={() => {}} onSave={() => {}} />);
    });
    view = { unmount() { root.unmount(); el.remove(); } };
  }

  it('does not reuse the previous direction, strategy, or trigger', () => {
    localStorage.setItem('tradeos_tradeForm_last_j1', JSON.stringify({
      strategy: 'Order Block',
      timeframe: '15m',
      trigger: 'Spring',
      instrument: '',
      direction: 'short',
      broker: '',
    }));
    render();
    expect(radio('Long').getAttribute('aria-checked')).toBe('true');
    expect(radio('Short').getAttribute('aria-checked')).toBe('false');
    expect(buttonNamed('בחר...')).toBeTruthy();
    expect(buttonNamed('Order Block')).toBeFalsy();
    expect(buttonNamed('בחר טריגר...')).toBeTruthy();
    expect(buttonNamed('15m')).toBeTruthy();
  });

  it('clears a Wyckoff trigger when the strategy changes to Order Block', () => {
    render();
    click(buttonNamed('בחר...'));
    click(buttonNamed('Wyckoff'));
    click(buttonNamed('בחר טריגר...'));
    expect(buttonNamed('Spring')).toBeTruthy();
    click(buttonNamed('Spring'));
    expect(buttonNamed('Spring')).toBeTruthy();

    click(buttonNamed('Wyckoff'));
    click(buttonNamed('Order Block'));
    expect(buttonNamed('Spring')).toBeFalsy();
    expect(buttonNamed('בחר טריגר...')).toBeTruthy();

    click(buttonNamed('בחר טריגר...'));
    expect(buttonNamed('Spring')).toBeFalsy();
    expect(buttonNamed('BOS')).toBeTruthy();
  });

  it('keeps your own fields on the ticket and opens the editor from the header', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const field = { id: 'f1', name: 'סשן', type: 'text' };
    act(() => {
      root.render(
        <TradeForm
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          customFieldsReady
          customFields={[field]}
          customFieldsDoc={{ fields: [field], seq: 1 }}
          onSaveCustomFields={() => {}}
        />,
      );
    });
    view = { unmount() { root.unmount(); el.remove(); } };
    expect(buttonNamed('+ שדה משלך')).toBeTruthy();
    expect(document.getElementById('custom-f1')).toBeNull();
    expect(document.body.textContent).not.toContain('למשל: סטאפ — Breakout / Pullback');
    click(buttonNamed('+ שדה משלך'));
    expect(document.body.textContent).toContain('למשל: סטאפ — Breakout / Pullback');
    expect(document.getElementById('custom-f1')).toBeTruthy();
    expect(document.querySelector('[aria-label="עריכת סשן"]')).toBeTruthy();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});
