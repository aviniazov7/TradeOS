// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import DailyLossBanner from './DailyLossBanner';

const NOW = new Date('2026-01-16T00:30:00Z');
const alert = { enabled: true, amount: 300 };
const loss = {
  id: 'a',
  status: 'closed',
  journalId: 'j1',
  exitDate: '2026-01-16T00:30:00Z',
  netPnl: -320,
};

describe('DailyLossBanner', () => {
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

  it('renders the loss, the cap, and that recording stays open', async () => {
    const view = await render(
      <DailyLossBanner alert={alert} trades={[loss]} journalId="j1" now={NOW} />,
    );
    const banner = view.host.querySelector('[data-testid="daily-loss-banner"]');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.className).toContain('border-loss/30');
    expect(banner.className).toContain('bg-loss/10');
    expect(banner.querySelector('p').className).toContain('text-loss');
    expect(banner.textContent).toContain('$320.00');
    expect(banner.textContent).toContain('$300.00');
    expect(banner.textContent).toContain('הרישום עדיין פתוח');
    await view.unmount();
  });

  it('renders nothing under the cap and leaves a new-trade button alone', async () => {
    const view = await render(
      <>
        <button type="button">עסקה חדשה</button>
        <DailyLossBanner
          alert={alert}
          trades={[{ ...loss, netPnl: -50 }]}
          journalId="j1"
          now={NOW}
        />
      </>,
    );
    expect(view.host.querySelector('[data-testid="daily-loss-banner"]')).toBeNull();
    const button = view.host.querySelector('button');
    expect(button.textContent).toBe('עסקה חדשה');
    expect(button.disabled).toBe(false);
    await view.unmount();
  });

  it('does not replace the new-trade button when the cap is reached', async () => {
    const view = await render(
      <>
        <button type="button">עסקה חדשה</button>
        <DailyLossBanner alert={alert} trades={[loss]} journalId="j1" now={NOW} />
      </>,
    );
    const button = view.host.querySelector('button');
    expect(button.textContent).toBe('עסקה חדשה');
    expect(button.disabled).toBe(false);
    expect(view.host.querySelector('[data-testid="daily-loss-banner"]')).not.toBeNull();
    await view.unmount();
  });
});
