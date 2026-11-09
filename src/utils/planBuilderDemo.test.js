import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLAN_BUILDER_DEMO_BANNER, demoPlanFromAnswers, planBuilderDemoEnabled,
  planBuilderErrorMessage, saveBuiltPlan,
} from './planBuilderDemo';
import { planQuestionError, visiblePlanQuestions } from './planBuilderFlow';

describe('plan builder demo gate', () => {
  it('stays off in a production build even with the query flag', () => {
    const prod = { DEV: false, VITE_PLAN_BUILDER_DEMO: '' };
    expect(planBuilderDemoEnabled('?planBuilderDemo=1', prod)).toBe(false);
    expect(planBuilderDemoEnabled('https://tradeoslive.web.app/plans?planBuilderDemo=1', prod)).toBe(false);
  });

  it('turns on only for a dev or preview build that also has the flag', () => {
    expect(planBuilderDemoEnabled('?planBuilderDemo=1', { DEV: true })).toBe(true);
    expect(planBuilderDemoEnabled('', { DEV: true })).toBe(false);
    expect(planBuilderDemoEnabled('?planBuilderDemo=1', { DEV: false, VITE_PLAN_BUILDER_DEMO: '1' })).toBe(true);
    expect(planBuilderDemoEnabled('?other=1', { DEV: false, VITE_PLAN_BUILDER_DEMO: '1' })).toBe(false);
  });

  it('keeps the public demo route out of production builds and outside auth', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const main = app.slice(app.indexOf('function MainApp'), app.indexOf('export default function App'));
    const outer = app.slice(app.indexOf('export default function App'));
    expect(app).toContain("import.meta.env.DEV || import.meta.env.VITE_PLAN_BUILDER_DEMO === '1'");
    expect(main).not.toContain('path="/plan-builder-demo"');
    expect(outer).toContain('path="/plan-builder-demo"');
    const auth = readFileSync(new URL('../contexts/AuthContext.jsx', import.meta.url), 'utf8');
    const stub = auth.slice(auth.indexOf('const LOGGED_OUT_AUTH'), auth.indexOf('export function useAuth'));
    expect(stub).toContain('user: null');
    expect(stub).not.toContain('onAuthChange');
  });
});

describe('plan builder answers', () => {
  it('skips sessions only after swing is chosen', () => {
    expect(visiblePlanQuestions({}).map((question) => question.id)).toContain('sessions');
    expect(visiblePlanQuestions({ style: 'scalp' }).map((question) => question.id)).toContain('sessions');
    expect(visiblePlanQuestions({ style: 'swing' }).map((question) => question.id)).not.toContain('sessions');
  });

  it('rejects an empty coin list and accepts a catalog symbol', () => {
    const markets = visiblePlanQuestions({}).find((question) => question.id === 'markets');
    expect(planQuestionError(markets, [])).toMatch(/מטבע/);
    expect(planQuestionError(markets, ['NOTACOIN'])).toMatch(/תקינה/);
    expect(planQuestionError(markets, ['BTCUSDT'])).toBe('');
    const entry = visiblePlanQuestions({}).find((question) => question.id === 'entry');
    expect(planQuestionError(entry, '  ')).toBe('השלימו את התשובה');
    expect(planQuestionError(entry, 'A'.repeat(entry.maxLength + 1))).toMatch(/תווים/);
  });
});

describe('plan builder errors and save', () => {
  it('maps quota, premium, validation, and provider failures to Hebrew', () => {
    expect(planBuilderErrorMessage(403, {})).toMatch(/Premium/);
    expect(planBuilderErrorMessage(429, { quotaExceeded: true })).toMatch(/3/);
    expect(planBuilderErrorMessage(400, { error: 'stack trace' })).toBe('התשובות אינן תקינות. חזרו אחורה ובדקו אותן.');
    expect(planBuilderErrorMessage(502, { error: 'groq 429 openai/gpt-oss-120b' })).toBe('לא הצלחנו לבנות את התוכנית כרגע. נסה שוב.');
    expect(planBuilderErrorMessage(503)).toBe('לא הצלחנו לבנות את התוכנית כרגע. נסה שוב.');
    expect(planBuilderErrorMessage(502)).not.toMatch(/groq|gpt-oss/i);
  });

  it('calls addPlan only when demo is off', async () => {
    const addPlan = vi.fn(async () => {});
    const demo = await saveBuiltPlan({ demo: true, addPlan, data: { name: 'תוכנית דמה' } });
    expect(demo).toEqual({ saved: false });
    expect(addPlan).not.toHaveBeenCalled();

    const live = await saveBuiltPlan({ demo: false, addPlan, data: { name: 'תוכנית דמה' } });
    expect(live).toEqual({ saved: true });
    expect(addPlan).toHaveBeenCalledTimes(1);
    expect(addPlan).toHaveBeenCalledWith({ name: 'תוכנית דמה' });
  });

  it('builds a synthetic plan and drops sessions for swing', () => {
    const plan = demoPlanFromAnswers({ style: 'swing', entry: 'כניסה סינתטית', markets: ['Bitcoin'] });
    expect(plan.name).toBe('תוכנית דמה');
    expect(plan.notes).toBe(PLAN_BUILDER_DEMO_BANNER);
    expect(plan.sessions).toEqual([]);
    expect(plan.entryRules).toBe('כניסה סינתטית');
    expect(plan.pairs).toEqual(['BTCUSDT']);
  });
});
