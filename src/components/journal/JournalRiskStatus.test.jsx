// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import JournalRiskStatus from './JournalRiskStatus';

const NOW = new Date('2026-01-16T00:30:00Z');
const TODAY = '2026-01-16T10:00:00Z';

const rules = {
  weeklyLoss: { enabled: true, amount: 500 },
  dailyLossPercent: { enabled: true, percent: 3 },
  weeklyLossPercent: { enabled: false, percent: 5 },
  maxTradesPerDay: { enabled: true, count: 2 },
  tradingHours: { enabled: false, start: '09:00', end: '17:00' },
};

const loss = {
  id: 'a',
  status: 'closed',
  journalId: 'j1',
  exitDate: TODAY,
  entryDate: TODAY,
  netPnl: -100,
};

describe('JournalRiskStatus', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function render(node) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(node); });
    return {
      host,
      async unmount() {
        await act(async () => { root.unmount(); });
        host.remove();
      },
    };
  }

  function status(node) {
    return (
      <>
        <button type="button">עסקה חדשה</button>
        {node}
      </>
    );
  }

  it('draws nothing when the journal has no rules, even after a large loss', async () => {
    const view = await render(status(
      <JournalRiskStatus
        rules={undefined}
        trades={[{ ...loss, netPnl: -900 }]}
        journalId="j1"
        balance={10_000}
        now={NOW}
      />,
    ));
    expect(view.host.querySelector('[data-testid="journal-risk-status"]')).toBeNull();
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(view.host.querySelector('button').disabled).toBe(false);
    await view.unmount();
  });

  it('draws nothing when every stored rule is off', async () => {
    const view = await render(status(
      <JournalRiskStatus
        rules={{
          weeklyLoss: { enabled: false, amount: 10 },
          maxTradesPerDay: { enabled: false, count: 1 },
        }}
        trades={[{ ...loss, netPnl: -900 }]}
        journalId="j1"
        balance={10_000}
        now={NOW}
      />,
    ));
    expect(view.host.querySelector('[data-testid="journal-risk-status"]')).toBeNull();
    await view.unmount();
  });

  it('shows a small in-range status and leaves trade entry alone', async () => {
    const view = await render(status(
      <JournalRiskStatus rules={rules} trades={[loss]} journalId="j1" balance={10_000} now={NOW} />,
    ));
    const chip = view.host.querySelector('[data-testid="journal-risk-status"]');
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.getAttribute('data-breached')).toBe('0');
    expect(chip.getAttribute('data-tone')).toBe('ok');
    expect(chip.className).toContain('text-profit');
    expect(chip.className).toContain('bg-profit/10');
    expect(chip.className.split(/\s+/)).toContain('w-fit');
    expect(chip.className.split(/\s+/)).not.toContain('w-full');
    expect(chip.textContent).toBe('כללי הסיכון בטווח');
    const button = view.host.querySelector('button');
    expect(button.textContent).toBe('עסקה חדשה');
    expect(button.disabled).toBe(false);
    await view.unmount();
  });

  it('names the breached rules without becoming an alert', async () => {
    const view = await render(status(
      <JournalRiskStatus
        rules={rules}
        trades={[
          { ...loss, netPnl: -500 },
          { ...loss, id: 'b', netPnl: -20 },
        ]}
        journalId="j1"
        balance={10_000}
        now={NOW}
      />,
    ));
    const chip = view.host.querySelector('[data-testid="journal-risk-status"]');
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.getAttribute('data-breached')).toBe('1');
    expect(chip.getAttribute('data-tone')).toBe('breach');
    expect(chip.className).toContain('text-loss');
    expect(chip.className).toContain('border-loss/30');
    expect(chip.className).toContain('bg-loss/10');
    expect(chip.textContent).toBe('חריגה: הפסד שבועי, הפסד יומי, עסקאות ביום');
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(view.host.querySelector('button').disabled).toBe(false);
    await view.unmount();
  });

  it('says a percent rule cannot be measured without an opening balance', async () => {
    const view = await render(
      <JournalRiskStatus
        rules={{ dailyLossPercent: { enabled: true, percent: 3 } }}
        trades={[{ ...loss, netPnl: -900 }]}
        journalId="j1"
        balance={0}
        now={NOW}
      />,
    );
    const chip = view.host.querySelector('[data-testid="journal-risk-status"]');
    expect(chip.getAttribute('data-breached')).toBe('0');
    expect(chip.getAttribute('data-tone')).toBe('muted');
    expect(chip.className).toContain('text-text-secondary');
    expect(chip.className).toContain('bg-bg-tertiary');
    expect(chip.textContent).toBe('אין יתרת פתיחה למדידת האחוז');
    await view.unmount();
  });
});
