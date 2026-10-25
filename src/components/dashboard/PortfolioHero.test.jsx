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
    const line = document.querySelector('.chart-draw');
    expect(line).toBeTruthy();
    expect(line.getAttribute('pathLength')).toBe('1');
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
});
