// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';

const { getUserSetting, setUserSetting, watch } = vi.hoisted(() => ({
  getUserSetting: vi.fn(async () => null),
  setUserSetting: vi.fn(async () => {}),
  watch: { items: [], loading: false },
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'owner' } }),
}));

vi.mock('../../hooks/useSignals', () => ({
  useSignals: () => ({
    signals: [], loading: false,
    addSignal: vi.fn(), updateSignal: vi.fn(), deleteSignal: vi.fn(),
  }),
}));

vi.mock('../../hooks/useWyckoffSetups', () => ({
  useWyckoffSetups: () => ({
    setups: [], loading: false,
    addSetup: vi.fn(), updateSetup: vi.fn(), deleteSetup: vi.fn(),
  }),
}));

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    items: watch.items,
    loading: watch.loading,
    addItem: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCryptoPrices', () => ({
  useCryptoPrices: () => ({ prices: {} }),
}));

vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['30m'], addTimeframe: vi.fn(), removeTimeframe: vi.fn(), loading: false }),
}));

vi.mock('../../services/firestoreService', () => ({
  getUserSetting: (...args) => getUserSetting(...args),
  setUserSetting: (...args) => setUserSetting(...args),
}));

vi.mock('../../services/coingeckoApi', () => ({
  searchCoins: vi.fn(async () => []),
  fetchPrices: vi.fn(async () => ({})),
  fetchKlines: vi.fn(async () => []),
}));

import SignalsPage from './SignalsPage';

function shell() {
  return (
    <LazyMotion features={domAnimation}>
      <MemoryRouter>
        <SignalsPage />
      </MemoryRouter>
    </LazyMotion>
  );
}

function rowValue(root, label) {
  const dt = [...root.querySelectorAll('dt')].find((n) => n.textContent === label);
  return dt?.nextElementSibling?.textContent || '';
}

function tileText(root, label) {
  const span = [...root.querySelectorAll('span')].find((n) => n.textContent === label);
  return span?.parentElement?.parentElement?.textContent || '';
}

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell()); });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    el,
    async unmount() {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const finished = Promise.resolve();
  const animation = {
    cancel() {}, finish() {}, play() {}, pause() {},
    addEventListener() {}, removeEventListener() {},
    finished, ready: finished, currentTime: 0, playState: 'finished',
  };
  window.HTMLElement.prototype.animate = () => animation;
});

it('shows a paused engine and a dash countdown when the watchlist is empty', async () => {
  watch.items = [];
  watch.loading = false;
  getUserSetting.mockResolvedValue(null);
  const view = await mount();
  const badge = view.el.querySelector('[title="המנוע מושהה ולא סורק"]');
  expect(badge?.textContent).toContain('מושהה');
  expect(badge?.className).toContain('text-text-muted');
  expect(view.el.textContent).toContain('הפעל מנוע');
  expect(view.el.textContent).not.toContain('השהה מנוע');
  expect(rowValue(view.el, 'סריקה הבאה')).toBe('—');
  expect(tileText(view.el, 'סריקה הבאה')).toContain('—');
  expect(tileText(view.el, 'סריקה הבאה')).toContain('המנוע מושהה');
  await view.unmount();
});

it('shows the engine as running when coins are tagged and no choice is saved', async () => {
  watch.items = [{ id: '1', symbol: 'BTC', bias: 'long' }];
  watch.loading = false;
  getUserSetting.mockResolvedValue(null);
  const view = await mount();
  const badge = view.el.querySelector('[title="המנוע רץ בצד השרת כל 10 דקות"]');
  expect(badge?.textContent).toContain('פעיל');
  expect(view.el.textContent).toContain('השהה מנוע');
  expect(rowValue(view.el, 'סריקה הבאה')).toMatch(/דק׳/);
  expect(tileText(view.el, 'סריקה הבאה')).toMatch(/דק׳/);
  await view.unmount();
});

it('persists a pause and switches the badge', async () => {
  watch.items = [{ id: '1', symbol: 'BTC', bias: 'long' }];
  watch.loading = false;
  getUserSetting.mockResolvedValue({ minConfidence: 60, stopBufferPct: 0 });
  setUserSetting.mockClear();
  const view = await mount();
  const button = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('השהה מנוע'));
  expect(button).toBeTruthy();
  expect(button.disabled).toBe(false);
  await act(async () => { button.click(); });
  await act(async () => { await Promise.resolve(); });
  expect(setUserSetting).toHaveBeenCalledWith(
    'owner',
    'scanner',
    expect.objectContaining({ enabled: false }),
    true,
  );
  expect(view.el.querySelector('[title="המנוע מושהה ולא סורק"]')?.textContent).toContain('מושהה');
  expect(view.el.textContent).toContain('הפעל מנוע');
  expect(rowValue(view.el, 'סריקה הבאה')).toBe('—');
  await view.unmount();
});
