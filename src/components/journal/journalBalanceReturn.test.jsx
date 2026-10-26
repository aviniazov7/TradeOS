// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalSummaryBar from './JournalSummaryBar';
import TradeTable from './TradeTable';
import TradeShareCard from './TradeShareCard';

const trade = {
  id: 't1',
  pair: 'BTCUSDT',
  direction: 'long',
  status: 'closed',
  result: 'win',
  entryPrice: 100,
  exitPrice: 110,
  quantity: 1,
  positionSize: 100,
  leverage: 10,
  pnl: 10,
  netPnl: 10,
  fees: 0,
  entryDate: '2026-01-15T12:00:00Z',
};

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  return {
    el,
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('journal return on balance', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('keeps header stats on one row and shows the account return', async () => {
    const view = await mount(
      <JournalSummaryBar trades={[trade]} accountBalance={1000} />,
    );
    const bar = document.querySelector('[data-testid="journal-header-stats"]');
    expect(bar.className).toContain('flex');
    expect(bar.className).toContain('flex-nowrap');
    expect(bar.className).not.toContain('grid-cols-2');
    expect(bar.textContent).toContain('על היתרה');
    expect(bar.textContent).toContain('+1.00%');
    expect(bar.textContent).not.toContain('+100.00%');
    await view.cleanup();
  });

  it('omits the account return when the journal has no balance', async () => {
    const view = await mount(<JournalSummaryBar trades={[trade]} />);
    const bar = document.querySelector('[data-testid="journal-header-stats"]');
    expect(bar.textContent).not.toContain('על היתרה');
    await view.cleanup();
  });

  it('shows the account return in the trade list when a balance is set', async () => {
    const view = await mount(
      <TradeTable trades={[trade]} accountBalance={1000} onEdit={() => {}} onDelete={() => {}} />,
    );
    const headers = [...document.querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toContain('על היתרה');
    expect(headers).not.toContain('% נטו');
    expect(view.el.textContent).toContain('+1.00%');
    expect(view.el.textContent).not.toContain('+100.00%');
    await view.cleanup();
  });

  it('keeps the position return in the list when no balance is set', async () => {
    const view = await mount(
      <TradeTable trades={[trade]} onEdit={() => {}} onDelete={() => {}} />,
    );
    const headers = [...document.querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toContain('% נטו');
    expect(view.el.textContent).toContain('+100.00%');
    await view.cleanup();
  });

  it('prints the account return on the share card', async () => {
    const view = await mount(<TradeShareCard trade={trade} accountBalance={1000} />);
    expect(view.el.textContent).toContain('+1.00%');
    expect(view.el.textContent).not.toContain('+100.00%');
    await view.cleanup();
  });
});
