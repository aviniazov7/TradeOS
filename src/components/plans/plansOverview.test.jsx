// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import PlansPage from './PlansPage';
import StrategyView from '../backtest/StrategyView';
import { SYNTHETIC_PLANS } from './planOverviewFixtures';

const plansApi = vi.hoisted(() => ({
  plans: [],
  loading: false,
  addPlan: vi.fn(async () => {}),
  updatePlan: vi.fn(async () => {}),
  deletePlan: vi.fn(async () => {}),
}));

vi.mock('../../hooks/useTradingPlans', () => ({
  useTradingPlans: () => plansApi,
}));

vi.mock('../../hooks/useProcesses', () => ({
  useProcesses: () => ({
    processes: [],
    loading: false,
    addProcess: vi.fn(async () => {}),
    updateProcess: vi.fn(async () => {}),
    deleteProcess: vi.fn(async () => {}),
  }),
}));

vi.mock('../../hooks/useProcessCategories', () => ({
  useProcessCategories: () => ({ allCategories: [], addCategory: vi.fn(), removeCategory: vi.fn() }),
}));

vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['15m', '1H', '4H'], addTimeframe: vi.fn(), removeTimeframe: vi.fn() }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../../services/coinImageCache', () => ({
  getCachedImage: () => null,
  prefetchCoinImages: () => Promise.resolve({}),
  cacheImage: () => {},
}));

function shell(node) {
  return (
    <LazyMotion features={domAnimation} strict>
      {node}
    </LazyMotion>
  );
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(node)); });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function text(el = document.body) {
  return el.textContent.replace(/\s+/g, ' ').trim();
}

function buttonNamed(name, root = document) {
  return [...root.querySelectorAll('button')].find((btn) => (
    btn.getAttribute('aria-label') === name || btn.textContent.replace(/\s+/g, ' ').trim() === name
  ));
}

function card(name) {
  return [...document.querySelectorAll('[data-testid="plan-card"]')].find((el) => el.textContent.includes(name));
}

describe('trading plans overview', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
      finished,
      ready: finished,
      currentTime: 0,
      playState: 'finished',
    });
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  beforeEach(() => {
    plansApi.plans = SYNTHETIC_PLANS;
    plansApi.loading = false;
    plansApi.addPlan.mockClear();
    plansApi.updatePlan.mockClear();
    plansApi.deletePlan.mockClear();
    document.body.innerHTML = '';
  });

  it('shows the three-up card grid, real metadata, and the active count', async () => {
    const view = await mount(<PlansPage />);
    const summary = document.querySelector('[data-testid="plans-summary"]');
    expect(text(summary)).toBe('3 פעילות מתוך 4');
    expect(document.querySelector('[aria-label="חיפוש תוכנית"]')).toBeNull();
    expect(document.querySelector('[data-testid="plans-workspace"]')).toBeNull();

    const grid = summary.nextElementSibling;
    expect(grid.className).toContain('xl:grid-cols-3');

    const cards = [...document.querySelectorAll('[data-testid="plan-card"]')];
    expect(cards.map((el) => el.querySelector('h3').textContent.trim())).toEqual(SYNTHETIC_PLANS.map((plan) => plan.name));

    const day = card('דיי טריידינג');
    expect(day.dataset.active).toBe('true');
    expect(text(day)).toContain('פעילה');
    expect(text(day)).toContain('ניתוח כיוון ב-4H לפני חיפוש אזור');
    expect(text(day)).not.toContain('ירידה ל-15m');
    expect(text(day)).toContain('BTCUSDT');
    expect(text(day)).toContain('+2');
    const timeframeRow = [...day.querySelectorAll('p')].find((row) => row.textContent.includes('טיימפריים'));
    expect([...timeframeRow.querySelectorAll('[dir="ltr"]')].map((el) => el.textContent)).toEqual(['15m', '1H', '4H', '1D']);
    expect(text(day)).toContain('London');
    expect(text(day)).toContain('הפסד יומי');
    expect(text(day)).toContain('3%');
    expect(text(day)).toContain('עסקאות במקביל');
    expect(text(day)).toContain("צ'קליסט 4");
    expect(day.querySelector('[data-accent]').dataset.accent).toBe('#38bdf8');
    expect(buttonNamed('צפייה בדמו — דיי טריידינג', day).textContent).toContain('צפה בתוכנית');
    expect(buttonNamed('עריכת דמו — דיי טריידינג', day)).toBeTruthy();
    expect(buttonNamed('מחיקת דמו — דיי טריידינג', day)).toBeTruthy();

    const sparse = card('טיוטה');
    expect(sparse.dataset.active).toBe('false');
    expect(text(sparse)).toContain('לא פעילה');
    expect(text(sparse)).not.toContain('הפסד יומי');
    expect(text(sparse)).not.toContain("צ'קליסט");
    expect(text(sparse)).not.toContain('כניסה');
    expect(text(sparse)).not.toContain('טיימפריים');
    expect(sparse.querySelector('[data-accent]').dataset.accent).toBe('#3b82f6');
    expect(buttonNamed('צפייה בדמו — טיוטה', sparse)).toBeTruthy();

    expect(text()).not.toMatch(/אחוז הצלחה|win rate|Premium|שדרג/);
    const names = [...document.querySelectorAll('button')].map((btn) => btn.getAttribute('aria-label') || btn.textContent);
    expect(names.join(' ')).not.toMatch(/AI|מאמן/);
    expect(buttonNamed('תוכנית חדשה')).toBeTruthy();

    await view.cleanup();
  });

  it('opens the saved plan in the existing dialog and keeps edit and delete', async () => {
    const view = await mount(<PlansPage />);
    const day = card('דיי טריידינג');

    await act(async () => { buttonNamed('צפייה בדמו — דיי טריידינג', day).click(); });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(text(dialog)).toContain('Strategy Journal');
    expect(dialog.querySelector('#strategy-journal-title').textContent.replace(/\s+/g, ' ').trim()).toContain('דמו — דיי טריידינג');
    expect(text(dialog)).toContain('כללי כניסה');
    expect(text(dialog)).toContain('ירידה ל-15m רק אחרי אישור מבנה');
    expect(text(dialog)).toContain('כללי יציאה');
    expect(text(dialog)).toContain('ניהול סיכונים');
    expect(text(dialog)).toContain('בדיקת חדשות');
    expect(dialog.querySelector('[aria-label="ייצוא PDF"]')).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('#strategy-journal-title')).toBeNull();
    expect(document.querySelector('[data-testid="plans-workspace"]')).toBeNull();

    await act(async () => { buttonNamed('עריכת דמו — דיי טריידינג', day).click(); });
    expect(text()).toContain('עריכת תוכנית');
    const nameInput = [...document.querySelectorAll('input')].find((input) => input.value === 'דמו — דיי טריידינג');
    expect(nameInput).toBeTruthy();
    expect(text()).not.toContain('בחר טמפלייט מוכן');
    await act(async () => { buttonNamed('סגור').click(); });

    await act(async () => { buttonNamed('מחיקת דמו — טיוטה').click(); });
    expect(text()).toContain('למחוק את "דמו — טיוטה"');
    await act(async () => { buttonNamed('מחק').click(); });
    expect(plansApi.deletePlan).toHaveBeenCalledWith('demo-sparse');

    await view.cleanup();
  });

  it('preserves the empty state, the create form, and the analytics tab', async () => {
    plansApi.plans = [];
    const view = await mount(<PlansPage />);
    expect(text()).toContain('אין תוכניות מסחר עדיין');
    expect(document.querySelector('[data-testid="plan-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="plans-summary"]')).toBeNull();

    await act(async () => { buttonNamed('צור את התוכנית הראשונה').click(); });
    expect(text()).toContain('תוכנית מסחר חדשה');
    expect(text()).toContain('בחר טמפלייט מוכן');
    await act(async () => { buttonNamed('סגור').click(); });

    const analytics = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes('אנליטיקה'));
    await act(async () => { analytics.click(); });
    expect(text()).toContain('אין אנליטיקה עדיין');
    expect(buttonNamed('הוסף ניתוח')).toBeTruthy();
    expect(buttonNamed('תוכנית חדשה')).toBeFalsy();

    await view.cleanup();
  });
});

describe('strategy reader', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
      finished,
      ready: finished,
      currentTime: 0,
      playState: 'finished',
    });
  });

  it('keeps the backtest journal title treatment and omits plan-only facts', async () => {
    const onClose = vi.fn();
    const view = await mount(
      <StrategyView
        isOpen
        onClose={onClose}
        journal={{ name: 'ORB London', description: 'Opening range', maxDailyLoss: 4, entryRules: 'Wait for the range' }}
      />,
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(text(dialog)).toContain('Strategy Journal');
    expect(text(dialog)).not.toContain('תוכנית מסחר');
    expect(text(dialog)).not.toContain('הפסד יומי');
    expect(dialog.querySelector('#strategy-journal-title').textContent.replace(/\s+/g, ' ').trim()).toBe('ORB London');
    expect(text(dialog)).toContain('Wait for the range');
    await view.cleanup();
  });
});
