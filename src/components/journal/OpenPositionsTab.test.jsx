// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import OpenPositionsTab from './OpenPositionsTab';
import { JOURNAL_POLL_MS } from '../../hooks/useTerminalData';

const terminal = {
  connected: null,
  snapshots: {},
  marks: {},
  openTrades: [],
  loading: false,
  refreshing: false,
  lastUpdated: 1_700_000_000_000,
  refresh: vi.fn(),
};

const calls = vi.hoisted(() => []);

vi.mock('../../hooks/useTerminalData', async () => {
  const actual = await vi.importActual('../../hooks/useTerminalData');
  return {
    ...actual,
    useTerminalData: (...args) => {
      calls.push(args);
      return terminal;
    },
  };
});

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ journals: [{ id: 'j1', exchange: 'mexc', name: 'MEXC' }], activeJournalId: 'j1' }),
}));

vi.mock('../terminal/terminalHooks', () => ({
  useNow: () => 1_700_000_060_000,
  useMedia: () => true,
}));

vi.mock('../terminal/TerminalPositions', () => ({
  default: ({ rows }) => <div data-testid="positions-list">{rows.length}</div>,
}));

vi.mock('../terminal/TerminalOrders', () => ({
  default: ({ rows }) => <div data-testid="orders-list">{rows.length}</div>,
}));

vi.mock('../exchange/ExchangeSettings', () => ({
  default: ({ bare, journalId }) => (
    <div data-testid="exchange-settings" data-bare={bare ? '1' : '0'} data-journal={journalId}>חיבור</div>
  ),
}));

vi.mock('../shared/ExchangeLogo', () => ({
  default: ({ exchange }) => <span data-testid="exchange-logo">{exchange}</span>,
}));

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<OpenPositionsTab />); });
  return {
    html: () => el.innerHTML,
    click: async (label) => {
      const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes(label) || b.getAttribute('aria-label') === label);
      await act(async () => { btn.click(); });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('בורסה tab', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => { calls.length = 0; terminal.refresh.mockClear(); });

  it('polls every 15s and shows the connect UI when nothing is linked', async () => {
    terminal.connected = [];
    terminal.snapshots = {};
    terminal.loading = false;
    const view = await mount();
    expect(JOURNAL_POLL_MS).toBe(15_000);
    expect(calls.at(-1)).toEqual([{ pollMs: 15_000 }]);
    expect(view.html()).toContain('data-testid="exchange-settings"');
    expect(view.html()).toContain('data-bare="0"');
    expect(view.html()).not.toContain('פוזיציות פתוחות');
    expect(view.html()).not.toContain('פקודות פתוחות');
    await view.unmount();
  });

  it('stacks connection, positions, then orders, and expands management inline', async () => {
    terminal.connected = ['mexc'];
    terminal.loading = false;
    terminal.lastUpdated = 1_700_000_000_000;
    terminal.snapshots = {
      mexc: {
        positions: [{ pair: 'BTCUSDT', direction: 'long', entryPrice: 100, quantity: 1, leverage: 1, stopLoss: 90, source: 'mexc', externalId: 'a', markPrice: 110, unrealizedPnl: 10, margin: 50 }],
        orders: [{ id: 'o1', exchange: 'mexc', pair: 'ETHUSDT', createdAt: 1 }],
      },
    };
    const view = await mount();
    const html = view.html();
    expect(html).toContain('data-testid="exchange-logo"');
    expect(html).toContain('MEXC');
    expect(html).toContain('ניהול חיבור');
    expect(html).toContain('aria-label="רענון"');
    const positionsAt = html.indexOf('data-testid="open-positions-section"');
    const ordersAt = html.indexOf('data-testid="open-orders-section"');
    const headerAt = html.indexOf('data-testid="exchange-connection"');
    expect(headerAt).toBeGreaterThan(-1);
    expect(positionsAt).toBeGreaterThan(headerAt);
    expect(ordersAt).toBeGreaterThan(positionsAt);
    expect(html).toContain('data-testid="positions-list"');
    expect(html).toContain('data-testid="orders-list"');
    expect(html).not.toContain('data-testid="exchange-settings"');
    await view.click('ניהול חיבור');
    expect(view.html()).toContain('data-testid="exchange-settings"');
    expect(view.html()).toContain('data-bare="1"');
    expect(view.html()).toContain('data-journal="j1"');
    expect(view.html()).toContain('aria-expanded="true"');
    await view.click('רענון');
    expect(terminal.refresh).toHaveBeenCalled();
    await view.unmount();
  });

  it('opens connection management from a key problem', async () => {
    terminal.connected = ['mexc'];
    terminal.loading = false;
    terminal.snapshots = { mexc: { positions: [], orders: [], error: 'מפתח לא תקין', reason: 'key_invalid' } };
    const view = await mount();
    expect(view.html()).toContain('עדכון מפתחות');
    expect(view.html()).not.toContain('data-testid="exchange-settings"');
    await view.click('עדכון מפתחות');
    expect(view.html()).toContain('data-bare="1"');
    await view.unmount();
  });
});
