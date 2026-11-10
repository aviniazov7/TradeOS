// @vitest-environment happy-dom
import { act, useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import PlansPage from './PlansPage';
import PlanBuilderWizard from './PlanBuilderWizard';
import PlanForm from './PlanForm';
import { PLAN_BUILDER_DEMO_BANNER, saveBuiltPlan } from '../../utils/planBuilderDemo';

const auth = vi.hoisted(() => ({ isPremium: false, user: null }));
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
    processes: [], loading: false, addProcess: vi.fn(), updateProcess: vi.fn(), deleteProcess: vi.fn(),
  }),
}));

vi.mock('../../hooks/useProcessCategories', () => ({
  useProcessCategories: () => ({ allCategories: [], addCategory: vi.fn(), removeCategory: vi.fn() }),
}));

vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: ['15m', '1H', '4H'], addTimeframe: vi.fn(), removeTimeframe: vi.fn() }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../services/coinImageCache', () => ({
  getCachedImage: () => null,
  prefetchCoinImages: () => Promise.resolve({}),
  cacheImage: () => {},
}));

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

function shell(node) {
  return <LazyMotion features={domAnimation} strict>{node}</LazyMotion>;
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(node)); });
  return {
    rerender: async (next) => { await act(async () => { root.render(shell(next)); }); },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function planName() {
  return document.querySelector('input[placeholder="לדוגמה: סקאלפינג BTC"]')?.value;
}

function dialogTitle() {
  const input = document.querySelector('input[placeholder="לדוגמה: סקאלפינג BTC"]');
  const dialog = input?.closest('[role="dialog"]');
  return dialog?.querySelector('h2')?.textContent.replace(/\s+/g, ' ').trim() || '';
}

function buttonNamed(name) {
  return [...document.querySelectorAll('button')].find((btn) => btn.textContent.replace(/\s+/g, ' ').trim() === name);
}

async function clickButton(name) {
  const button = buttonNamed(name);
  expect(button, name).toBeTruthy();
  await act(async () => { button.click(); });
}

async function pick(option) {
  const button = document.querySelector(`[data-option="${option}"]`);
  expect(button, option).toBeTruthy();
  await act(async () => { button.click(); });
}

async function fill(id, value) {
  const el = document.querySelector(`[data-question-input="${id}"]`);
  expect(el, id).toBeTruthy();
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const finished = Promise.resolve();
  window.HTMLElement.prototype.animate = () => ({
    cancel() {}, finish() {}, play() {}, pause() {}, addEventListener() {}, removeEventListener() {},
    finished, ready: finished, currentTime: 0, playState: 'finished',
  });
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  auth.isPremium = false;
  auth.user = null;
  plansApi.plans = [];
  plansApi.addPlan.mockClear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('plan builder premium gate', () => {
  it('shows the upgrade prompt to a free user and does not open the wizard', async () => {
    const view = await mount(<PlansPage />);
    await clickButton('בנה תוכנית עם AI');
    expect(document.body.textContent).toContain('בניית תוכנית עם AI היא חלק מ-Premium');
    expect(document.querySelector('[data-testid="plan-builder-wizard"]')).toBeNull();
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    await view.cleanup();
  });

  it('opens the first question for a premium user', async () => {
    auth.isPremium = true;
    const view = await mount(<PlansPage />);
    await clickButton('בנה תוכנית עם AI');
    expect(document.querySelector('[data-testid="plan-builder-wizard"]')?.dataset.question).toBe('style');
    expect(document.body.textContent).not.toContain(PLAN_BUILDER_DEMO_BANNER);
    await view.cleanup();
  });
});

function Flow({ demo = false, requestPlan, onSave }) {
  const [draft, setDraft] = useState(null);
  return (
    <>
      {demo && <div data-testid="plan-builder-demo-banner">{PLAN_BUILDER_DEMO_BANNER}</div>}
      <PlanBuilderWizard
        open={!draft}
        demo={demo}
        onClose={() => {}}
        onDraft={setDraft}
        requestPlan={requestPlan}
      />
      <PlanForm
        isOpen={!!draft}
        plan={draft}
        saveLabel="שמור תוכנית"
        onClose={() => setDraft(null)}
        onSave={onSave}
      />
    </>
  );
}

async function pickSector(key) {
  const button = document.querySelector(`[data-sector="${key}"]`);
  expect(button, key).toBeTruthy();
  await act(async () => { button.click(); });
}

async function finishWizard(style) {
  await pick(style);
  await clickButton('הבא');
  expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe('markets');
  await pickSector('bitcoin');
  await clickButton('הבא');
  expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe('timeframes');
  expect([...document.querySelectorAll('[data-option]')].map((el) => el.dataset.option)).toEqual([
    '1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W',
  ]);
  await pick('15m');
  await clickButton('הבא');
  if (style !== 'swing') {
    expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe('sessions');
    await pick('London');
    await clickButton('הבא');
  } else {
    expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).not.toBe('sessions');
  }
  for (const id of ['description', 'entry', 'exit', 'tradeManagement', 'marketConditions', 'dailyRoutine', 'mistakes', 'goals', 'risk', 'notes']) {
    expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe(id);
    await clickButton('דלג');
  }
  await fill('maxDailyLoss', '2');
  await clickButton('הבא');
  await fill('maxPositions', '1');
  await clickButton('בנה תוכנית');
}

describe('plan builder wizard', () => {
  it('skips sessions for swing and still asks them for a scalp', async () => {
    const requestPlan = vi.fn();
    const view = await mount(<Flow requestPlan={requestPlan} onSave={vi.fn()} />);
    await pick('swing');
    await clickButton('הבא');
    await pickSector('bitcoin');
    await clickButton('הבא');
    expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe('timeframes');
    await clickButton('חזרה');
    await clickButton('חזרה');
    await pick('scalp');
    await clickButton('הבא');
    await clickButton('הבא');
    await pick('15m');
    await clickButton('הבא');
    expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe('sessions');
    expect(requestPlan).not.toHaveBeenCalled();
    await view.cleanup();
  });

  it('shows a quota error and does not save', async () => {
    const requestPlan = vi.fn(async () => {
      const err = new Error('ignored');
      err.status = 429;
      throw err;
    });
    const onSave = vi.fn();
    const view = await mount(<Flow requestPlan={requestPlan} onSave={onSave} />);
    await finishWizard('scalp');
    expect(requestPlan).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('הגעת למכסת בניית התוכניות להיום (3)');
    expect(onSave).not.toHaveBeenCalled();
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    await view.cleanup();
  });

  it('saves only from the form button, and cancel discards', async () => {
    const requestPlan = vi.fn(async () => ({ name: 'תוכנית סינתטית', description: 'טיוטה', isActive: true, pairs: [], timeframes: [], sessions: [], checklist: [], mistakesToAvoid: [], tradeExamples: [] }));
    const onSave = vi.fn(async () => {});
    const view = await mount(<Flow requestPlan={requestPlan} onSave={onSave} />);
    await finishWizard('day');
    expect(requestPlan).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(planName()).toBe('תוכנית סינתטית');
    expect(dialogTitle()).toContain('תוכנית חדשה');
    expect(dialogTitle()).not.toContain('עריכת תוכנית');
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    await clickButton('ביטול');
    expect(onSave).not.toHaveBeenCalled();
    await view.cleanup();
  });

  it('calls addPlan from Save and not before it', async () => {
    const requestPlan = vi.fn(async () => ({
      name: 'תוכנית סינתטית', description: 'טיוטה', isActive: true,
      pairs: [], timeframes: [], sessions: [], checklist: [], mistakesToAvoid: [], tradeExamples: [],
    }));
    const onSave = vi.fn(async (data) => {
      await saveBuiltPlan({ demo: false, addPlan: plansApi.addPlan, data });
    });
    const view = await mount(<Flow requestPlan={requestPlan} onSave={onSave} />);
    await finishWizard('day');
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    await clickButton('שמור תוכנית');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(plansApi.addPlan).toHaveBeenCalledTimes(1);
    expect(plansApi.addPlan.mock.calls[0][0].name).toBe('תוכנית סינתטית');
    await view.cleanup();
  });

  it('shows market conditions, goals, description, and notes, and keeps the typed text', async () => {
    const view = await mount(<Flow demo requestPlan={vi.fn(async () => { throw new Error('worker'); })} onSave={vi.fn()} />);
    await pick('day');
    await clickButton('הבא');
    await pickSector('bitcoin');
    await clickButton('הבא');
    await pick('15m');
    await clickButton('הבא');
    await pick('London');
    await clickButton('הבא');
    const typed = {
      description: 'תיאור שלי',
      entry: 'כניסה שלי',
      exit: 'יציאה שלי',
      tradeManagement: 'ניהול שלי',
      marketConditions: 'שוק שקט',
      dailyRoutine: 'שגרה שלי',
      mistakes: 'בלי נקמה',
      goals: 'היעד שלי',
      risk: 'סיכון שלי',
      notes: 'הערה שלי',
    };
    for (const [id, value] of Object.entries(typed)) {
      expect(document.querySelector('[data-testid="plan-builder-wizard"]').dataset.question).toBe(id);
      expect(document.body.textContent).toMatch(/מתוך\s*16|16/);
      await fill(id, value);
      await clickButton('הבא');
    }
    await fill('maxDailyLoss', '2');
    await clickButton('הבא');
    await fill('maxPositions', '1');
    await clickButton('בנה תוכנית');
    const area = (placeholder) => [...document.querySelectorAll('textarea')].find((el) => el.getAttribute('placeholder')?.includes(placeholder));
    expect(area('על מה התוכנית')?.value).toBe('תיאור שלי');
    expect(area('יעד יומי')?.value).toBe('היעד שלי');
    expect(area('מתי לסחור')?.value).toBe('שוק שקט');
    expect(area('הערות')?.value).toBe('הערה שלי');
    expect(document.body.textContent).not.toContain('שוק לדוגמה');
    expect(document.body.textContent).not.toContain('עקביות בלבד');
    await view.cleanup();
  });

  it('demo mode uses the synthetic plan, shows the banner, and never calls the worker or addPlan', async () => {
    const requestPlan = vi.fn(async () => { throw new Error('worker'); });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onSave = vi.fn(async (data) => saveBuiltPlan({
      demo: true,
      addPlan: plansApi.addPlan,
      data,
    }));
    const view = await mount(<Flow demo requestPlan={requestPlan} onSave={onSave} />);
    expect(document.body.textContent).toContain(PLAN_BUILDER_DEMO_BANNER);
    await finishWizard('swing');
    expect(requestPlan).not.toHaveBeenCalled();
    expect(planName()).toBe('תוכנית דמה');
    expect(dialogTitle()).toContain('תוכנית חדשה');
    expect(dialogTitle()).not.toContain('עריכת תוכנית');
    expect(document.body.textContent).toContain('BTCUSDT');
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => /firestore|googleapis\.com\/firestore|ai-plan-builder|api\.groq\.com/.test(url))).toBe(false);
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    await clickButton('שמור תוכנית');
    expect(plansApi.addPlan).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.map((call) => String(call[0])).some((url) => /firestore|ai-plan-builder|api\.groq\.com/.test(url))).toBe(false);
    fetchSpy.mockRestore();
    await view.cleanup();
  });
});
