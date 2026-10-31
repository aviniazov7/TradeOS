// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const state = vi.hoisted(() => ({
  journal: {
    id: 'j1',
    name: 'יומן פורקס',
    description: '',
    pairs: ['EURUSD'],
    timeframes: [],
    sessions: [],
    checklist: [],
    tradeExamples: [],
  },
}));

vi.mock('../../contexts/BacktestContext', () => ({
  useBacktestContext: () => ({
    activeJournal: state.journal,
    activeJournalId: 'j1',
    updateJournal: vi.fn(async () => {}),
    deleteJournal: vi.fn(async () => {}),
  }),
}));

vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({
    allTimeframes: ['4H'],
    addTimeframe: () => {},
    removeTimeframe: () => {},
  }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));

import BacktestSettingsModal from './BacktestSettingsModal';

function typeInto(input, value) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  act(() => {
    proto.set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function escape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

describe('backtest settings discard confirm', () => {
  let view;
  let onClose;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  afterEach(() => {
    if (!view) return;
    act(() => { view.unmount(); });
    view = null;
  });

  function render() {
    onClose = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<BacktestSettingsModal isOpen onClose={onClose} />); });
    view = {
      unmount() { root.unmount(); el.remove(); },
    };
  }

  function nameInput() {
    return document.querySelector('input[placeholder="למשל: אסטרטגיית Wyckoff"]');
  }

  it('closes a clean dialog without asking', () => {
    render();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
  });

  it('asks before Esc, the X, or cancel discards typed settings', async () => {
    render();
    typeInto(nameInput(), 'שם חדש');
    escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
    expect(document.body.textContent).toContain('המשך עריכה');

    const stay = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('המשך עריכה'));
    act(() => { stay.click(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput().value).toBe('שם חדש');
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');

    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ביטול');
    act(() => { cancel.click(); });
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');

    const close = document.querySelector('button[aria-label="סגור"]');
    act(() => { close.click(); });
    expect(document.querySelectorAll('[role="dialog"]').length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();

    const discard = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('סגור בלי לשמור'));
    await act(async () => { discard.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
