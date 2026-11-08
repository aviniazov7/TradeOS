// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import PlansPage from './PlansPage';
import StrategyView from '../backtest/StrategyView';
import { SYNTHETIC_PLANS } from './planOverviewFixtures';
import { filterPlans, resolveSelection } from './planFields';

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

function setDesktop(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
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

function option(id) {
  return document.querySelector(`[data-plan-id="${id}"]`);
}

function panel() {
  return document.querySelector('#plan-section-panel');
}

function sectionTabs() {
  return [...document.querySelectorAll('[aria-label="סעיפי התוכנית"] [role="tab"]')];
}

async function typeSearch(value) {
  const input = document.querySelector('[aria-label="חיפוש תוכנית"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openSection(label) {
  const tab = sectionTabs().find((item) => item.textContent.trim() === label);
  await act(async () => { tab.click(); });
}

describe('trading plans workspace', () => {
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
    setDesktop(true);
    plansApi.plans = SYNTHETIC_PLANS;
    plansApi.loading = false;
    plansApi.addPlan.mockClear();
    plansApi.updatePlan.mockClear();
    plansApi.deletePlan.mockClear();
    document.body.innerHTML = '';
  });

  it('selects the first plan and keeps every saved section reachable once', async () => {
    const view = await mount(<PlansPage />);
    const detail = document.querySelector('[data-testid="plan-detail"]');
    expect(detail.dataset.open).toBe('true');
    expect(detail.querySelector('#plan-detail-title').textContent.replace(/\s+/g, ' ').trim()).toBe('דמו — דיי טריידינג');
    expect(option('demo-day').getAttribute('aria-current')).toBe('true');
    expect([...option('demo-day').querySelectorAll('[data-meta="timeframes"] [dir="ltr"]')].map((el) => el.textContent)).toEqual(['15m', '1H', '4H']);
    expect(buttonNamed('הכל').textContent.trim()).toBe('הכל');
    expect(sectionTabs().map((tab) => tab.textContent.trim())[0]).toBe('סקירה');
    expect(sectionTabs().filter((tab) => tab.textContent.trim() === 'צ׳קליסט')).toHaveLength(1);
    expect(text(panel())).toContain('עסקאות תוך-יומיות לדוגמה');
    expect(text(panel())).not.toContain('בדיקת חדשות');
    expect(panel().querySelector('[role="checkbox"]')).toBeNull();

    const saved = [
      ['כללי כניסה', 'ירידה ל-15m רק אחרי אישור מבנה'],
      ['כללי יציאה', 'חצי פוזיציה'],
      ['ניהול סיכונים', 'סיכון לדוגמה בלבד'],
      ['ניהול עסקה', 'הזזת סטופ'],
      ['צ׳קליסט', 'בדיקת חדשות'],
      ['תנאי שוק', 'מגמה ברורה'],
      ['שגרה יומית', 'רמות מהיום הקודם'],
      ['יעדים', 'ביצוע לפי התוכנית'],
      ['טעויות נפוצות', 'כניסה בלי אישור מבנה'],
      ['דוגמאות כניסה', 'דוגמה סינתטית'],
      ['הערות', 'דמו סינתטי'],
    ];
    for (const [label, snippet] of saved) {
      await openSection(label);
      expect(panel().dataset.section).not.toBe('overview');
      expect(text(panel())).toContain(snippet);
    }
    expect(text(detail)).toContain('הפסד יומי');
    expect(text(detail)).toContain('3%');
    expect(text(detail)).toContain('מקסימום עסקאות');
    expect(buttonNamed('עריכת דמו — דיי טריידינג')).toBeTruthy();
    expect(buttonNamed('ייצוא PDF')).toBeTruthy();
    expect(buttonNamed('מחיקת דמו — דיי טריידינג')).toBeTruthy();
    expect(text()).not.toMatch(/אחוז הצלחה|win rate|Premium|שדרג/);
    const names = [...document.querySelectorAll('button')].map((btn) => btn.getAttribute('aria-label') || btn.textContent);
    expect(names.join(' ')).not.toMatch(/AI|מאמן/);

    await view.cleanup();
  });

  it('filters by search and status, and selects a visible plan', async () => {
    const view = await mount(<PlansPage />);

    await typeSearch('סווינג');
    expect([...document.querySelectorAll('[data-testid="plan-option"]')].map((el) => el.dataset.planId)).toEqual(['demo-swing']);
    expect(text(document.querySelector('#plan-detail-title'))).toContain('סווינג');

    await typeSearch('אין-תוכנית-כזו');
    expect(document.querySelector('[data-testid="plan-option"]')).toBeNull();
    expect(text(document.querySelector('[data-testid="plan-detail"]'))).toContain('אין תוכניות תואמות');
    expect(text(document.querySelector('[data-testid="plan-detail"]'))).not.toContain('דיי טריידינג');

    await typeSearch('');
    await act(async () => { buttonNamed('לא פעילות').click(); });
    expect([...document.querySelectorAll('[data-testid="plan-option"]')].map((el) => el.dataset.planId)).toEqual(['demo-sparse']);
    expect(text(document.querySelector('#plan-detail-title'))).toContain('טיוטה');
    expect(sectionTabs().map((tab) => tab.textContent.trim())).toEqual(['סקירה']);
    expect(text(panel())).toContain('אין תקציר שמור');
    expect(text(document.querySelector('[data-testid="plan-detail"]'))).not.toContain('הפסד יומי');

    await act(async () => { buttonNamed('פעילות').click(); });
    expect(option('demo-sparse')).toBeNull();
    expect(option('demo-day')).toBeTruthy();

    option('demo-day').focus();
    await act(async () => {
      option('demo-day').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(option('demo-swing').getAttribute('aria-current')).toBe('true');
    expect(text(document.querySelector('#plan-detail-title'))).toContain('סווינג');

    await view.cleanup();
  });

  it('keeps edit and delete, and returns from the mobile detail', async () => {
    const view = await mount(<PlansPage />);
    await act(async () => { buttonNamed('עריכת דמו — דיי טריידינג').click(); });
    expect(text()).toContain('עריכת תוכנית');
    expect(text()).not.toContain('בחר טמפלייט מוכן');
    await act(async () => { buttonNamed('סגור').click(); });

    await act(async () => { option('demo-sparse').click(); });
    await act(async () => { buttonNamed('מחיקת דמו — טיוטה').click(); });
    expect(text()).toContain('למחוק את "דמו — טיוטה"');
    await act(async () => { buttonNamed('מחק').click(); });
    expect(plansApi.deletePlan).toHaveBeenCalledWith('demo-sparse');
    await view.cleanup();

    setDesktop(false);
    const mobile = await mount(<PlansPage />);
    const detail = document.querySelector('[data-testid="plan-detail"]');
    expect(detail.dataset.open).toBe('false');
    expect(detail.className).toContain('hidden');
    await act(async () => { option('demo-supply').click(); });
    expect(detail.dataset.open).toBe('true');
    expect(document.querySelector('[data-testid="plans-list"]').className).toContain('hidden');
    expect(text(document.querySelector('#plan-detail-title'))).toContain('היצע וביקוש');

    await act(async () => { buttonNamed('חזרה לרשימה').click(); });
    expect(detail.dataset.open).toBe('false');
    expect(document.querySelector('[data-testid="plans-list"]').className).not.toContain('hidden');

    await act(async () => { option('demo-supply').click(); });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(detail.dataset.open).toBe('false');
    await mobile.cleanup();
  });

  it('preserves the empty state, the create form, and the analytics tab', async () => {
    plansApi.plans = [];
    const view = await mount(<PlansPage />);
    expect(text()).toContain('אין תוכניות מסחר עדיין');
    expect(document.querySelector('[data-testid="plans-workspace"]')).toBeNull();

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

describe('plan selection helpers', () => {
  it('drops a deleted id and keeps the next visible plan', () => {
    const active = filterPlans(SYNTHETIC_PLANS, '', 'active');
    expect(active.map((plan) => plan.id)).not.toContain('demo-sparse');
    expect(resolveSelection(active, 'demo-sparse').id).toBe('demo-day');
    expect(resolveSelection(active, 'demo-swing').id).toBe('demo-swing');
    expect(resolveSelection([], 'demo-day')).toBeNull();
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
