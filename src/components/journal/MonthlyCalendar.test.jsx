// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import MonthlyCalendar from './MonthlyCalendar';

vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, title, children }) => (isOpen ? (
    <div role="dialog">
      <h2>{title}</h2>
      {children}
    </div>
  ) : null),
}));

vi.mock('./MonthlyShareModal', () => ({ default: () => null }));

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const trades = [
  { id: 'a', status: 'closed', exitDate: new Date(2026, 10, 3, 12), netPnl: 120, result: 'win', pair: 'BTCUSDT', direction: 'long' },
  { id: 'b', status: 'closed', exitDate: new Date(2026, 10, 3, 15), netPnl: 30, result: 'win', pair: 'ETHUSDT', direction: 'short', strategy: 'breakout' },
  { id: 'c', status: 'closed', exitDate: new Date(2026, 10, 10, 12), pnl: -40, result: 'loss', pair: 'SOLUSDT', direction: 'long' },
  { id: 'd', status: 'closed', exitDate: new Date(2026, 10, 18, 12), netPnl: 10, result: 'win', pair: 'BNBUSDT', direction: 'long' },
  { id: 'open', status: 'open', exitDate: new Date(2026, 10, 5, 12), netPnl: 999, result: 'win', pair: 'OPENUSDT', direction: 'long' },
  { id: 'oct', status: 'closed', exitDate: new Date(2026, 9, 15, 12), netPnl: 200, result: 'win', pair: 'OCTUSDT', direction: 'long' },
];

async function mount(dir) {
  const el = document.createElement('div');
  el.setAttribute('dir', dir);
  el.style.width = dir === 'ltr' ? '390px' : '960px';
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<MonthlyCalendar trades={trades} journalName="Fixture journal" />);
  });
  return {
    el,
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function headerCells(el) {
  return [...el.querySelectorAll('[data-testid="calendar-weekday-header"] > *')];
}

function weekRows(el) {
  return [...el.querySelectorAll('[data-testid="calendar-week"]')];
}

describe('monthly journal calendar', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['rtl', 'ltr'])('keeps seven equal day columns and drops the week column in %s', async (dir) => {
    const view = await mount(dir);
    const headers = headerCells(view.el);
    expect(headers.map((cell) => cell.textContent)).toEqual(DAYS);
    expect(view.el.textContent).not.toContain('שבוע');

    const header = view.el.querySelector('[data-testid="calendar-weekday-header"]');
    expect(header.className).toContain('grid-cols-7');
    expect(header.className).toContain('w-full');
    expect(header.className).not.toContain('_auto');

    const rows = weekRows(view.el);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toContain('grid-cols-7');
      expect(row.className).not.toContain('min-w-[4.5rem]');
      expect(row.children).toHaveLength(7);
    }
    expect(view.el.querySelector('.min-w-\\[4\\.5rem\\]')).toBeNull();

    expect(view.el.textContent).toContain('נובמבר 2026');
    expect(view.el.textContent).toContain('רווח:');
    expect(view.el.textContent).toContain('ימי רווח:');
    expect(view.el.textContent).toContain('ימי הפסד:');
    expect(view.el.textContent).toContain('+$120.00');
    expect(view.el.textContent).not.toContain('OPENUSDT');
    expect(view.el.textContent).not.toContain('+$200.00');

    const today = view.el.querySelector('[aria-current="date"]');
    expect(today?.getAttribute('aria-label')).toContain('8');
    expect(today?.getAttribute('aria-label')).toContain('היום');

    const nov3 = [...view.el.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === '3, 2 עסקאות');
    expect(nov3).toBeTruthy();
    expect(nov3.textContent).toContain('2');
    expect(nov3.textContent).toContain('+$150.00');

    await view.cleanup();
  });

  it('keeps Sunday-first alignment when the month changes', async () => {
    const view = await mount('rtl');
    const november = weekRows(view.el)[0];
    expect(november.children[0].tagName).toBe('BUTTON');
    expect(november.children[0].textContent).toContain('1');

    const prev = view.el.querySelector('[aria-label="חודש קודם"]');
    await act(async () => { prev.click(); });
    expect(view.el.textContent).toContain('אוקטובר 2026');
    const october = weekRows(view.el)[0];
    expect([...october.children].slice(0, 4).every((cell) => cell.tagName === 'DIV')).toBe(true);
    expect(october.children[4].tagName).toBe('BUTTON');
    expect(october.children[4].textContent).toContain('1');
    expect(view.el.textContent).toContain('+$200.00');
    expect(view.el.textContent).not.toContain('שבוע');

    const next = view.el.querySelector('[aria-label="חודש הבא"]');
    await act(async () => { next.click(); });
    expect(view.el.textContent).toContain('נובמבר 2026');
    await view.cleanup();
  });

  it('still opens the day trades without a weekly total', async () => {
    const view = await mount('rtl');
    const nov3 = [...view.el.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === '3, 2 עסקאות');
    await act(async () => { nov3.click(); });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('BTCUSDT');
    expect(dialog.textContent).toContain('ETHUSDT');
    expect(dialog.textContent).toContain('breakout');
    expect(dialog.textContent).toContain('+$150.00');
    expect(dialog.textContent).not.toContain('OPENUSDT');
    expect(dialog.textContent).not.toContain('שבוע');
    await view.cleanup();
  });
});
