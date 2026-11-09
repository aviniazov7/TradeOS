// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TagMistakeStatsPanel from './TagMistakeStatsPanel';
import JournalAnalyticsTab from './JournalAnalyticsTab';

vi.mock('./JournalCharts', () => ({ default: () => null }));
vi.mock('../analytics/SessionAnalysisChart', () => ({ default: () => null }));
vi.mock('../analytics/DayOfWeekChart', () => ({ default: () => null }));
vi.mock('../dashboard/TradeHeatmap', () => ({ default: () => null }));

const closed = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  pair: 'BTCUSDT',
  entryPrice: 100,
  exitPrice: 120,
  netPnl: 40,
  entryDate: '2026-09-01T10:00:00Z',
  exitDate: '2026-09-01T12:00:00Z',
  ...over,
});

const stats = {
  currentStreak: { count: 0, type: null },
  totalPnL: 40,
  partialRealizedPnL: 0,
  totalTrades: 1,
  winRate: 100,
  winCount: 1,
  lossCount: 0,
  expectancy: 40,
  avgRR: 1,
  profitFactor: 2,
  sharpeRatio: 0,
  calmarRatio: null,
  sortinoRatio: 0,
  recoveryFactor: 1,
  maxDrawdown: null,
  maxDrawdownAbsolute: 0,
  tradingDays: 1,
  tradesPerDay: 1,
  avgDurationHours: 1,
  totalFees: 0,
  sessionPerformance: [],
  dayOfWeekPerformance: [],
  monthlyPerformance: [],
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

function click(node) {
  return act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('tag and mistake sub-tabs', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows an empty state when closed trades have no tags or mistakes', async () => {
    const view = await mount(<TagMistakeStatsPanel trades={[closed({ tags: [], mistakes: 'not-a-list' })]} onFilterJump={() => {}} />);
    expect(view.el.textContent).toContain('אין תגיות על העסקאות הסגורות בתקופה הזו.');
    const mistakes = [...view.el.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes('טעויות'));
    await click(mistakes);
    expect(view.el.textContent).toContain('אין טעויות על העסקאות הסגורות בתקופה הזו.');
    expect(view.el.textContent).not.toContain('Premium');
    await view.cleanup();
  });

  it('shows an unknown tag as its raw id and filters the row like the tag table', async () => {
    const jump = vi.fn();
    const view = await mount(
      <TagMistakeStatsPanel
        trades={[closed({ tags: ['retired_tag', 'breakout'], netPnl: 40 })]}
        onFilterJump={jump}
      />,
    );
    const unknown = view.el.querySelector('[data-testid="stat-row-retired_tag"]');
    expect(unknown.textContent).toContain('retired_tag');
    expect(view.el.textContent).toContain('פריצה');
    await click(unknown);
    expect(jump).toHaveBeenCalledWith({ tag: 'retired_tag' });
    await view.cleanup();
  });

  it('filters a mistake row and scrolls when there are many tags', async () => {
    const jump = vi.fn();
    const many = Array.from({ length: 24 }, (_, i) => closed({
      id: `t${i}`,
      tags: [`tag_${i}`],
      mistakes: i === 0 ? ['early_exit'] : [],
      netPnl: 10 + i,
    }));
    const view = await mount(<TagMistakeStatsPanel trades={many} onFilterJump={jump} />);
    const scroll = view.el.querySelector('[data-testid="tag-mistake-scroll"]');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(scroll.className).toContain('max-h-80');
    expect(scroll.querySelectorAll('tbody tr')).toHaveLength(24);
    const mistakes = [...view.el.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes('טעויות'));
    await click(mistakes);
    await click(view.el.querySelector('[data-testid="stat-row-early_exit"]'));
    expect(jump).toHaveBeenCalledWith({ mistake: 'early_exit' });
    await view.cleanup();
  });

  it('breaks closed trades down by a custom field value', async () => {
    const jump = vi.fn();
    const fields = [{ id: 'f1', name: 'סשן', type: 'text' }];
    const view = await mount(
      <TagMistakeStatsPanel
        trades={[
          closed({ custom: { f1: 'לונדון' }, netPnl: 40 }),
          closed({ status: 'open', exitPrice: 0, custom: { f1: 'לונדון' }, netPnl: 80 }),
          closed({}),
        ]}
        customFields={fields}
        onFilterJump={jump}
      />,
    );
    const tab = [...view.el.querySelectorAll('[role="tab"]')].find((node) => node.textContent.includes('שדות'));
    await click(tab);
    const row = view.el.querySelector('[data-testid="custom-row-f1-0"]');
    expect(row.textContent).toContain('לונדון');
    expect(row.textContent).toContain('1');
    await click(row);
    expect(jump).toHaveBeenCalledWith({
      customField: 'f1',
      customValue: 'לונדון',
      customLabel: 'סשן: לונדון',
    });
    await view.cleanup();
  });
});

describe('analytics tag table stays in place', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('keeps the existing by-tag table and its row filter', async () => {
    const jump = vi.fn();
    const view = await mount(
      <JournalAnalyticsTab
        trades={[closed({ tags: ['breakout'], strategy: 'SOW', timeframe: '1H' })]}
        period="all"
        onPeriodChange={() => {}}
        stats={stats}
        activeJournal={{ initialBalance: 1000, exchange: '' }}
        balanceIsLive={false}
        displayedCurrentBalance={1040}
        onFilterJump={jump}
        onAddFirstTrade={() => {}}
      />,
    );
    expect(view.el.textContent).toContain('ביצועים לפי תגית');
    expect(view.el.textContent).toContain('לפי תגיות וטעויות');
    const heading = [...view.el.querySelectorAll('h3')].find((el) => el.textContent.includes('ביצועים לפי תגית'));
    const row = heading.parentElement.querySelector('tbody tr');
    expect(row.textContent).toContain('פריצה');
    await click(row);
    expect(jump).toHaveBeenCalledWith({ tag: 'breakout' });
    await view.cleanup();
  });
});
