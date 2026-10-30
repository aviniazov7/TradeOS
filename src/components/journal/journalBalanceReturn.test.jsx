// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { buildAccountReturnBook } from '../../utils/accountReturn';
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
    expect(bar.className).not.toContain('flex-wrap');
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

  it('shows an em dash instead of a percent when the balance is dust', async () => {
    // -11.2239 / 1e-8 * 100 = -112,239,000,000%. The withdrawn MEXC wallet.
    const dustTrade = { ...trade, netPnl: -11.2239, pnl: -11.2239, result: 'loss' };
    const book = buildAccountReturnBook([dustTrade], { openingBalance: 0, fallbackBalance: 1e-8 });
    const bar = await mount(<JournalSummaryBar trades={[dustTrade]} returnBook={book} />);
    const header = document.querySelector('[data-testid="journal-header-stats"]');
    expect(header.textContent).toContain('על היתרה');
    expect(header.textContent).toContain('—');
    expect(header.textContent).not.toContain('112239000000');
    await bar.cleanup();

    const table = await mount(
      <TradeTable trades={[dustTrade]} accountBalance={1e-8} onEdit={() => {}} onDelete={() => {}} />,
    );
    const headers = [...document.querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toContain('על היתרה');
    expect(headers).not.toContain('% נטו');
    expect(table.el.textContent).toContain('—');
    expect(table.el.textContent).not.toContain('112239000000');
    expect(table.el.textContent).not.toContain('+100.00%');
    await table.cleanup();

    const card = await mount(<TradeShareCard trade={dustTrade} accountBalance={1e-8} />);
    expect(card.el.textContent).toContain('—');
    expect(card.el.textContent).not.toContain('112239000000');
    await card.cleanup();
  });

  it('measures each row against the balance before that trade and skips a wiped account', async () => {
    const first = {
      ...trade, id: 'a', netPnl: 100, pnl: 100,
      entryDate: '2026-01-01T00:00:00Z', exitDate: '2026-01-01T01:00:00Z',
    };
    const second = {
      ...trade, id: 'b', netPnl: -40, pnl: -40, result: 'loss',
      entryDate: '2026-01-02T00:00:00Z', exitDate: '2026-01-02T01:00:00Z',
    };
    const view = await mount(
      <TradeTable trades={[second, first]} accountBalance={1000} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(view.el.textContent).toContain('+10.00%');
    expect(view.el.textContent).toContain('-3.64%');
    expect(view.el.textContent).not.toContain('-4.00%');
    await view.cleanup();

    const wiped = {
      ...trade, id: 'c', netPnl: 50, pnl: 50,
      entryDate: '2026-01-03T00:00:00Z', exitDate: '2026-01-03T01:00:00Z',
    };
    const blown = { ...first, netPnl: -1500, pnl: -1500, result: 'loss' };
    const book = buildAccountReturnBook([blown, wiped], { openingBalance: 1000 });
    const bar = await mount(<JournalSummaryBar trades={[blown, wiped]} returnBook={book} />);
    const header = document.querySelector('[data-testid="journal-header-stats"]');
    expect(header.textContent).toContain('-150.00%');
    expect(header.textContent).not.toContain('-145.00%');
    await bar.cleanup();
  });
});
