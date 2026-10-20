// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import WeeklySummary from './WeeklySummary';

// Monday (or the Monday of this Sunday-start week) so the fixture stays in
// the week the screen opens on, whatever weekday the test runs.
function inCurrentWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}
function weeksBefore(n) {
  const d = inCurrentWeek();
  d.setDate(d.getDate() - (7 * n));
  return d;
}

const trade = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  pair: 'BTCUSDT',
  entryPrice: 100,
  stopLoss: 90,
  originalStopLoss: 90,
  positionSize: 100,
  quantity: 1,
  netPnl: 20,
  exitPrice: 120,
  exitDate: inCurrentWeek(),
  entryDate: inCurrentWeek(),
  setups: ['LPS'],
  ...over,
});

describe('WeeklySummary', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows this week and moves to an older week', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <WeeklySummary
          trades={[
            trade({ id: 'now', pair: 'BTCUSDT' }),
            trade({
              id: 'old',
              pair: 'ETHUSDT',
              exitDate: weeksBefore(2),
              entryDate: weeksBefore(2),
              netPnl: -10,
              result: 'loss',
              setups: ['Spring'],
            }),
          ]}
        />,
      );
    });

    expect(host.textContent).toContain('השבוע');
    expect(host.textContent).toContain('BTCUSDT');
    expect(host.textContent).toContain('LPS');

    const prev = host.querySelector('[aria-label="השבוע הקודם"]');
    expect(prev).toBeTruthy();
    await act(async () => { prev.click(); });
    expect(host.textContent).toContain('ETHUSDT');
    expect(host.textContent).toContain('Spring');

    const next = host.querySelector('[aria-label="השבוע הבא"]');
    await act(async () => { next.click(); });
    expect(host.textContent).toContain('BTCUSDT');

    await act(async () => { root.unmount(); });
    host.remove();
  });
});
