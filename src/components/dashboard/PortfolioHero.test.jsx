// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import PortfolioHero from './PortfolioHero';

const PERIOD_KEY = 'tradeos_home_period';
const DAY = 86400000;

function plain(node) {
  return (node?.textContent || '').replace(/[\u200E\u2066\u2069]/g, '');
}

async function mount(props) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<PortfolioHero {...props} />); });
  return {
    badge: () => el.querySelector('[data-testid="portfolio-return"]'),
    click: async (label) => {
      const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes(label));
      await act(async () => { btn.click(); });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('portfolio hero return', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    localStorage.setItem(PERIOD_KEY, 'all');
  });

  it('shows trading return, not the drop from the opening balance to the wallet', async () => {
    // $2,589.34 opened, $393.58 left after withdrawals, $20 lost trading.
    // (393.58 − 2589.34) / 2589.34 = −84.8% is the wallet gap.
    const view = await mount({
      balance: 393.58,
      declaredStart: 2589.34,
      series: [{ t: Date.now() - 40 * DAY, pnl: -20, value: -20 }],
    });
    expect(plain(view.badge())).toBe('-0.8%');
    expect(plain(view.badge())).not.toContain('84.8');
    await view.unmount();
  });

  it('changes the badge with the period and uses that period\'s P&L', async () => {
    const now = Date.now();
    const view = await mount({
      balance: 400,
      declaredStart: 1000,
      series: [
        { t: now - 40 * DAY, pnl: -200, value: -200 },
        { t: now - 2 * DAY, pnl: 10, value: -190 },
      ],
    });
    expect(plain(view.badge())).toBe('-19.0%');
    await view.click('השבוע');
    // +$10 on 1000 + (−200) already booked → +1.25% → +1.3%
    expect(plain(view.badge())).toBe('+1.3%');
    expect(view.badge().className).toContain('text-profit');
    await view.unmount();
  });

  it('keeps withdrawals in the base when no opening balance was saved', async () => {
    const view = await mount({
      balance: 393.58,
      declaredStart: 0,
      series: [{ t: Date.now() - 40 * DAY, pnl: -20, value: -20 }],
    });
    // −20 / (393.58 − (−20)) = −4.8%, not −84.8%.
    expect(plain(view.badge())).toBe('-4.8%');
    await view.unmount();
  });

  it('hides the badge when there is no return to show', async () => {
    const view = await mount({ balance: 100, declaredStart: 0, series: [] });
    expect(view.badge()).toBeNull();
    await view.unmount();
  });

  it('asks for a starting balance instead of $0 when P&L exists without one', async () => {
    const view = await mount({
      balance: 0,
      declaredStart: 0,
      series: [{ t: Date.now() - 40 * DAY, pnl: 120, value: 120 }],
    });
    const prompt = document.querySelector('[data-testid="set-opening-balance"]');
    expect(plain(prompt)).toBe('הגדר יתרה התחלתית');
    expect(plain(document.body)).not.toContain('$0.00');
    await view.unmount();
  });

  it('hides the badge for a zero or dust wallet', async () => {
    const series = [{ t: Date.now() - 40 * DAY, pnl: -20, value: -20 }];
    const zero = await mount({ balance: 0, declaredStart: 0, series });
    expect(zero.badge()).toBeNull();
    await zero.unmount();
    const dust = await mount({ balance: 1e-8, declaredStart: 0, series });
    expect(dust.badge()).toBeNull();
    await dust.unmount();
  });

  it('drops P&L booked after the account is wiped out', async () => {
    const view = await mount({
      balance: 0,
      declaredStart: 1000,
      series: [
        { t: Date.parse('2026-01-01T00:00:00Z'), pnl: -1500, value: -1500 },
        { t: Date.parse('2026-01-02T00:00:00Z'), pnl: 50, value: -1450 },
      ],
    });
    expect(plain(view.badge())).toBe('-150.0%');
    expect(plain(view.badge())).not.toContain('145');
    await view.unmount();
  });
});
