// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import OpenPositionsSummary from './OpenPositionsSummary';
import { chipsThatFit } from '../../utils/chipsThatFit';

const terminal = {
  connected: ['mexc'],
  snapshots: {},
  marks: {},
  openTrades: [],
  loading: false,
  refreshing: false,
  lastUpdated: 0,
  refresh: () => {},
};

const terminalCalls = vi.hoisted(() => []);

vi.mock('../../hooks/useTerminalData', () => ({
  HOME_POLL_MS: 60_000,
  useTerminalData: (...args) => {
    terminalCalls.push(args);
    return terminal;
  },
}));

vi.mock('../shared/CoinIcon', () => ({
  default: ({ pair }) => <span data-coin={pair} />,
}));

function pos(partial) {
  return {
    pair: 'BTCUSDT', direction: 'long', entryPrice: 100, quantity: 1, leverage: 1,
    stopLoss: 90, tps: [], source: 'mexc', externalId: '1', markPrice: 100,
    unrealizedPnl: 0, margin: 100, liquidationPrice: null, ...partial,
  };
}

// Notional desc: BTC 220, ETH 160, SOL 90, XRP 12. Totals include the hidden one.
const BOOK = [
  pos({ pair: 'BTCUSDT', externalId: 'a', quantity: 2, leverage: 2, markPrice: 110, unrealizedPnl: 20, margin: 100, stopLoss: 90 }),
  pos({ pair: 'ETHUSDT', externalId: 'b', direction: 'short', entryPrice: 50, quantity: 4, leverage: 2, markPrice: 40, unrealizedPnl: 40, margin: 100, stopLoss: 55 }),
  pos({ pair: 'SOLUSDT', externalId: 'c', entryPrice: 10, quantity: 10, leverage: 1, markPrice: 9, unrealizedPnl: -10, margin: 100, stopLoss: 8 }),
  pos({ pair: 'XRPUSDT', externalId: 'd', entryPrice: 1, quantity: 10, leverage: 1, markPrice: 1.2, unrealizedPnl: 2, margin: 10, stopLoss: 0.5 }),
];

function Destination() {
  const [params] = useSearchParams();
  return <div>arrived:{params.get('tab')}</div>;
}

function tree(props) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OpenPositionsSummary {...props} />} />
        <Route path="/journal" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}

async function mount(props) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(tree(props)); });
  return {
    html: () => el.innerHTML,
    click: async (label) => {
      const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes(label));
      await act(async () => { btn.click(); });
    },
    clickTestId: async (id) => {
      await act(async () => { el.querySelector(`[data-testid="${id}"]`).click(); });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('open positions summary', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => { terminalCalls.length = 0; });

  it('hides when no exchange is connected', async () => {
    terminal.connected = [];
    terminal.snapshots = {};
    terminal.loading = false;
    const view = await mount();
    expect(terminalCalls.at(-1)).toEqual([{ pollMs: 60_000 }]);
    expect(view.html()).not.toContain('לכל הפוזיציות');
    expect(view.html()).not.toContain('פוזיציות פתוחות');
    await view.unmount();
  });

  it('hides entirely when the book is flat', async () => {
    terminal.connected = ['mexc'];
    terminal.snapshots = { mexc: { positions: [], orders: [] } };
    terminal.loading = false;
    const view = await mount();
    expect(view.html()).not.toContain('פוזיציות פתוחות');
    expect(view.html()).not.toContain('לכל הפוזיציות');
    expect(view.html()).not.toContain('אין פוזיציות פתוחות כרגע.');
    await view.unmount();
  });

  it('summarizes count, unrealized P&L, open risk, and up to three chips', async () => {
    terminal.connected = ['mexc'];
    terminal.loading = false;
    terminal.snapshots = { mexc: { positions: BOOK, orders: [] } };
    const view = await mount();
    const html = view.html();
    expect(html).toContain('open-positions-strip');
    expect(html).toContain('positions');
    expect(html).not.toContain('grid-cols-3');
    expect(html).toContain('>4<');
    expect(html).toContain('לא ממומש');
    expect(html).toContain('+$52.00');
    expect(html).toContain('+16.77%');
    expect(html).toContain('$65.00');
    expect(html).toContain('BTCUSDT');
    expect(html).toContain('ETHUSDT');
    expect(html).toContain('SOLUSDT');
    expect(html).not.toContain('XRPUSDT');
    expect(html).toContain('LONG');
    expect(html).toContain('SHORT');
    expect(html).toContain('>+1<');
    expect(html).toContain('text-text-secondary');
    expect(html).not.toContain('ועוד 1');
    const overflow = html.match(/data-testid="open-positions-overflow"/g) || [];
    expect(overflow).toHaveLength(1);
    await view.clickTestId('open-positions-overflow');
    expect(view.html()).toContain('arrived:exchange');
    await view.unmount();
  });

  it('opens the exchange tab from לכל הפוזיציות', async () => {
    terminal.connected = ['mexc'];
    terminal.loading = false;
    terminal.snapshots = { mexc: { positions: BOOK, orders: [] } };
    const view = await mount();
    await view.click('לכל הפוזיציות');
    expect(view.html()).toContain('arrived:exchange');
    await view.unmount();
  });

  it('masks dollar amounts when balances are hidden', async () => {
    terminal.connected = ['mexc'];
    terminal.loading = false;
    terminal.snapshots = { mexc: { positions: BOOK, orders: [] } };
    const view = await mount({ hidden: true });
    const html = view.html();
    expect(html).toContain('••••');
    expect(html).not.toContain('$52.00');
    expect(html).not.toContain('$65.00');
    expect(html).toContain('BTCUSDT');
    await view.unmount();
  });
});

describe('chipsThatFit', () => {
  const widths = [100, 100, 100];
  const gap = 6;
  const overflow = 32;

  it('keeps every chip when the row is wide enough', () => {
    expect(chipsThatFit({ chipWidths: widths.slice(0, 2), overflowWidth: overflow, gap, available: 400, total: 2 })).toBe(2);
  });

  it('reserves a +N chip once another position would be clipped', () => {
    expect(chipsThatFit({ chipWidths: widths, overflowWidth: overflow, gap, available: 150, total: 4 })).toBe(1);
    expect(chipsThatFit({ chipWidths: widths, overflowWidth: overflow, gap, available: 250, total: 4 })).toBe(2);
    expect(chipsThatFit({ chipWidths: widths, overflowWidth: overflow, gap, available: 400, total: 4 })).toBe(3);
  });

  it('drops to the overflow chip alone when even one position chip cannot sit beside it', () => {
    expect(chipsThatFit({ chipWidths: widths, overflowWidth: overflow, gap, available: 40, total: 4 })).toBe(0);
  });

  it('keeps one squeezed chip when the slot is only a little shorter than the full chip plus +N', () => {
    expect(chipsThatFit({ chipWidths: [144, 150, 141], overflowWidth: 28, gap: 6, available: 158, total: 4 })).toBe(1);
  });

  it('falls back to the cap when the row has not been measured', () => {
    expect(chipsThatFit({ chipWidths: [0, 0, 0], overflowWidth: 0, gap: 0, available: 0, total: 4 })).toBe(3);
  });
});
