// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import JournalRiskBanner from './JournalRiskBanner';

const notice = {
  title: 'חריגה מכללי הסיכון. הרישום עדיין פתוח.',
  summary: 'חריגה מכללי הסיכון: הפסד שבועי. הרישום עדיין פתוח.',
  lines: [{ id: 'weeklyLoss', text: 'הפסד השבוע $520.00 מתוך $500.00' }],
};

describe('JournalRiskBanner', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

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

  it('draws nothing without a breach', async () => {
    const view = await render(
      <>
        <button type="button">עסקה חדשה</button>
        <JournalRiskBanner notice={null} onDismiss={() => {}} />
      </>,
    );
    expect(view.host.querySelector('[data-testid="journal-risk-banner"]')).toBeNull();
    expect(view.host.querySelector('button').disabled).toBe(false);
    await view.unmount();
  });

  it('shows a Hebrew RTL banner in the loss colors and can be dismissed', async () => {
    const onDismiss = vi.fn();
    const view = await render(
      <>
        <button type="button">עסקה חדשה</button>
        <JournalRiskBanner notice={notice} onDismiss={onDismiss} />
      </>,
    );
    const banner = view.host.querySelector('[data-testid="journal-risk-banner"]');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('dir')).toBe('rtl');
    expect(banner.className).toContain('border-loss/30');
    expect(banner.className).toContain('bg-loss/10');
    expect(banner.className).toContain('text-loss');
    expect(banner.textContent).toContain('הרישום עדיין פתוח');
    expect(banner.textContent).toContain('$520.00');
    expect(banner.textContent).toContain('$500.00');
    const dismiss = view.host.querySelector('[data-testid="journal-risk-banner-dismiss"]');
    expect(dismiss.getAttribute('aria-label')).toBe('הסתר להיום');
    expect(dismiss.className).toContain('h-11');
    await act(async () => { dismiss.click(); });
    expect(onDismiss).toHaveBeenCalledOnce();
    const open = [...view.host.querySelectorAll('button')].find((button) => button.textContent === 'עסקה חדשה');
    expect(open.disabled).toBe(false);
    await view.unmount();
  });
});
