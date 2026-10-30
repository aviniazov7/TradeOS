// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalAnalyticsTab from './JournalAnalyticsTab';

const blown = {
  id: 'a', pair: 'BTCUSDT', direction: 'long', status: 'closed', result: 'loss',
  netPnl: -1500, pnl: -1500, fees: 0,
  entryDate: '2026-01-01T00:00:00Z', exitDate: '2026-01-01T00:00:00Z',
};
const after = {
  id: 'b', pair: 'ETHUSDT', direction: 'long', status: 'closed', result: 'win',
  netPnl: 50, pnl: 50, fees: 0,
  entryDate: '2026-01-02T00:00:00Z', exitDate: '2026-01-02T00:00:00Z',
};

// Enough of the dashboard stats object for the tab to render. The stale
// balanceChangePercent is the old formula (every dollar, including the +50
// booked after the wipe). The subtitle must ignore it.
const stats = {
  balanceChangePercent: -145,
  currentStreak: { count: 1, type: 'win' },
  totalPnL: -1450,
  partialRealizedPnL: 0,
  totalTrades: 2,
  winRate: 50,
  winCount: 1,
  lossCount: 1,
  expectancy: -725,
  avgRR: 0,
  profitFactor: 0,
  sharpeRatio: 0,
  calmarRatio: null,
  sortinoRatio: 0,
  recoveryFactor: 0,
  maxDrawdown: null,
  maxDrawdownAbsolute: 1500,
  tradingDays: 2,
  tradesPerDay: 1,
  avgDurationHours: 0,
  totalFees: 0,
};

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  return {
    text: () => (el.textContent || '').replace(/[\u200E\u2066\u2069]/g, ''),
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('analytics tab return percent', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows the account return, not P&L over the raw opening after a wipe', async () => {
    const view = await mount(
      <JournalAnalyticsTab
        trades={[blown, after]}
        period="all"
        onPeriodChange={() => {}}
        stats={stats}
        activeJournal={{ initialBalance: 1000, exchange: '' }}
        balanceIsLive={false}
        displayedCurrentBalance={-450}
        onFilterJump={() => {}}
        onAddFirstTrade={() => {}}
      />,
    );
    expect(view.text()).toContain('-150.00%');
    expect(view.text()).not.toContain('-145.00%');
    await view.cleanup();
  });

  it('does not print a percent when the opening balance is dust', async () => {
    const view = await mount(
      <JournalAnalyticsTab
        trades={[blown]}
        period="all"
        onPeriodChange={() => {}}
        stats={{ ...stats, totalPnL: -1500, totalTrades: 1, winCount: 0, lossCount: 1, balanceChangePercent: null }}
        activeJournal={{ initialBalance: 1e-8, exchange: '' }}
        balanceIsLive={false}
        displayedCurrentBalance={1e-8}
        onFilterJump={() => {}}
        onAddFirstTrade={() => {}}
      />,
    );
    expect(view.text()).toContain('1 עסקאות');
    expect(view.text()).not.toContain('% מההתחלה');
    await view.cleanup();
  });
});
