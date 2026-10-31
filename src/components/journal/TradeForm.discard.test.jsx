// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TradeForm from './TradeForm';

vi.mock('../../hooks/useUserStrategies', () => ({
  useUserStrategies: () => ({ allStrategies: ['Order Block'], addStrategy: () => {}, removeStrategy: () => {} }),
}));
vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['4H'], addTimeframe: () => {}, removeTimeframe: () => {} }),
}));
vi.mock('../../hooks/useUserTriggers', () => ({
  useUserTriggers: () => ({ allTriggers: ['Spring'], addTrigger: () => {}, removeTrigger: () => {} }),
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
vi.mock('../../services/coinImageCache', () => ({
  cacheImage: vi.fn(),
  clearCachedImage: vi.fn(),
}));
vi.mock('../shared/CoinIcon', () => ({ default: () => null }));

function buttonByText(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function typeInput(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function escape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

describe('trade form discard confirm', () => {
  let view;
  let onClose;

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => {
    localStorage.clear();
    onClose = vi.fn();
  });

  afterEach(async () => {
    if (view) {
      await act(async () => { view.unmount(); });
      view = null;
    }
  });

  function render(ui) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(ui); });
    view = {
      rerender(next) { act(() => { root.render(next); }); },
      unmount() { root.unmount(); el.remove(); },
    };
  }

  function form(prefill = null) {
    return (
      <TradeForm isOpen onClose={onClose} onSave={() => {}} prefill={prefill} />
    );
  }

  it('closes a clean futures ticket without asking', async () => {
    render(<TradeForm isOpen onClose={onClose} onSave={() => {}} journalAssetClass="futures_cme" />);
    await click(buttonByText('ביטול'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
  });

  it('closes a clean form without asking', async () => {
    render(form());
    await click(buttonByText('ביטול'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
  });

  it('asks before discarding typed data, and keeps it when the user stays', async () => {
    render(form());
    await typeInput(document.getElementById('tt-entry'), '42150');
    await click(buttonByText('ביטול'));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
    expect(document.getElementById('tt-entry').value).toBe('42150');

    await click(buttonByText('המשך עריכה'));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('לסגור בלי לשמור?');
    expect(document.getElementById('tt-entry').value).toBe('42150');

    escape();
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
    await click(buttonByText('סגור בלי לשמור'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes an open menu on Escape and leaves the dialog up', async () => {
    render(form());
    const strategy = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'בחר...');
    await click(strategy);
    expect(document.querySelector('[data-popover]')).toBeTruthy();
    escape();
    expect(document.querySelector('[data-popover]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('does not wipe typed fields when the same ticket re-renders', async () => {
    render(form({ direction: 'long' }));
    await typeInput(document.getElementById('tt-entry'), '100');
    view.rerender(form({ direction: 'long' }));
    expect(document.getElementById('tt-entry').value).toBe('100');
    await click(buttonByText('ביטול'));
    expect(document.body.textContent).toContain('לסגור בלי לשמור?');
  });
});
