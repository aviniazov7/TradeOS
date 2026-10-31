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

describe('backtest trade form discard confirm', () => {
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
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.includes('עסקה חדשה') || b.textContent.includes('הוסף עסקה ראשונה'),
    );
    act(() => { button.click(); });
  }

  function pressEsc() {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
  }

  function setTextarea(placeholder, value) {
    const el = document.querySelector(`textarea[placeholder="${placeholder}"]`);
    const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    act(() => {
      proto.set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('closes a pristine form immediately on Esc — no confirm', () => {
    render();
    openNew();
    expect(document.body.textContent).toContain('עסקת בקטסט חדשה');
    pressEsc();
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).not.toContain('עסקת בקטסט חדשה');
  });

  it('closes a pristine form immediately when X is clicked — no confirm', () => {
    render();
    openNew();
    const xBtn = document.querySelector('button[aria-label="סגור"]');
    act(() => { xBtn.click(); });
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).not.toContain('עסקת בקטסט חדשה');
  });

  it('asks for confirm on Esc when notes have been typed', () => {
    render();
    openNew();
    setTextarea('תובנות...', 'some notes');
    pressEsc();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).toContain('עסקת בקטסט חדשה');
  });

  it('asks for confirm when X is clicked and form is dirty', () => {
    render();
    openNew();
    setTextarea('תובנות...', 'changed');
    const xBtn = document.querySelector('button[aria-label="סגור"]');
    act(() => { xBtn.click(); });
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).toContain('עסקת בקטסט חדשה');
  });

  it('asks for confirm when desktop Cancel is clicked and form is dirty', () => {
    render();
    openNew();
    setTextarea('תובנות...', 'edited');
    const cancelBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'ביטול',
    );
    act(() => { cancelBtn.click(); });
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
  });

  it('"המשך עריכה" dismisses the confirm and keeps the form open with content', () => {
    render();
    openNew();
    setTextarea('תובנות...', 'my notes');
    pressEsc();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');

    const stayBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.includes('המשך עריכה'),
    );
    act(() => { stayBtn.click(); });

    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).toContain('עסקת בקטסט חדשה');
    expect(document.querySelector('textarea[placeholder="תובנות..."]').value).toBe('my notes');
  });

  it('confirming "סגור בלי לשמור" closes the form', async () => {
    render();
    openNew();
    setTextarea('תובנות...', 'something');
    pressEsc();

    const discardBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.includes('סגור בלי לשמור'),
    );
    await act(async () => { discardBtn.click(); });

    expect(document.body.textContent).not.toContain('עסקת בקטסט חדשה');
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
  });

  it('direction change counts as dirty', () => {
    render();
    openNew();
    // Click "Short" button
    const shortBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Short',
    );
    act(() => { shortBtn.click(); });
    pressEsc();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
  });
});
