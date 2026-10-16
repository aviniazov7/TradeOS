// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { HOME_POLL_MS, JOURNAL_POLL_MS, useTerminalData } from './useTerminalData';

const user = { uid: 'u1' };

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user }),
}));

const getConnectedExchanges = vi.fn(async () => ['mexc']);
const fetchTerminalSnapshot = vi.fn(async () => ({
  positions: [{ pair: 'BTCUSDT', quantity: 1 }],
  orders: [],
}));
const fetchPerpMarks = vi.fn(async () => ({ BTCUSDT: 100 }));
const getOpenTrades = vi.fn(async () => []);

vi.mock('../services/exchangeService', () => ({
  getConnectedExchanges: (...args) => getConnectedExchanges(...args),
  fetchTerminalSnapshot: (...args) => fetchTerminalSnapshot(...args),
}));

vi.mock('../services/bybitDirect', () => ({
  fetchPerpMarks: (...args) => fetchPerpMarks(...args),
}));

vi.mock('../services/firestoreService', () => ({
  getOpenTrades: (...args) => getOpenTrades(...args),
}));

function Probe({ pollMs }) {
  useTerminalData({ pollMs });
  return null;
}

function setVisible(on) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (on ? 'visible' : 'hidden'),
  });
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function advance(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useTerminalData polling', () => {
  let el;
  let root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    setVisible(true);
    getConnectedExchanges.mockClear();
    fetchTerminalSnapshot.mockReset();
    fetchTerminalSnapshot.mockResolvedValue({
      positions: [{ pair: 'BTCUSDT', quantity: 1 }],
      orders: [],
    });
    fetchPerpMarks.mockClear();
    getOpenTrades.mockClear();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    el.remove();
    setVisible(true);
    vi.useRealTimers();
  });

  async function mount(pollMs) {
    await act(async () => { root.render(<Probe pollMs={pollMs} />); });
    await settle();
  }

  it('keeps a 60s private poll on the home interval and 15s on the journal interval', async () => {
    expect(HOME_POLL_MS).toBe(60_000);
    expect(JOURNAL_POLL_MS).toBe(15_000);

    await mount(HOME_POLL_MS);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(1);

    await advance(15_000);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(1);

    await advance(45_000);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(2);

    await act(async () => { root.unmount(); });
    fetchTerminalSnapshot.mockClear();
    root = createRoot(el);

    await mount(JOURNAL_POLL_MS);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(1);

    await advance(15_000);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(2);
  });

  it('pauses the private poll while the tab is hidden and catches up on return', async () => {
    await mount(JOURNAL_POLL_MS);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(1);

    setVisible(false);
    await advance(20_000);
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisible(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(fetchTerminalSnapshot).toHaveBeenCalledTimes(2);
  });

  it('ticks public marks every 5s only while a position is open and the tab is visible', async () => {
    fetchTerminalSnapshot.mockResolvedValue({ positions: [], orders: [] });
    await mount(HOME_POLL_MS);
    await advance(5_000);
    expect(fetchPerpMarks).not.toHaveBeenCalled();

    fetchTerminalSnapshot.mockResolvedValue({
      positions: [{ pair: 'BTCUSDT', quantity: 1 }],
      orders: [],
    });
    await act(async () => { root.unmount(); });
    fetchPerpMarks.mockClear();
    root = createRoot(el);
    await mount(HOME_POLL_MS);
    expect(fetchPerpMarks).toHaveBeenCalledTimes(1);
    expect(fetchPerpMarks).toHaveBeenCalledWith(['BTCUSDT']);

    await advance(5_000);
    expect(fetchPerpMarks).toHaveBeenCalledTimes(2);

    setVisible(false);
    await advance(5_000);
    expect(fetchPerpMarks).toHaveBeenCalledTimes(2);
  });
});
