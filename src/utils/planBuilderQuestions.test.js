import { describe, expect, it } from 'vitest';
import { SESSIONS } from './constants';
import {
  PLAN_BUILDER_VERSION, PLAN_QUESTIONS, activeQuestionIds, validatePlanBuilderAnswers,
} from './planBuilderQuestions';

// Synthetic answers. Not a user's journal and not a saved plan.

function answer(id, value) {
  return { id, value };
}

function scalpAnswers(overrides = {}) {
  const values = {
    style: 'scalp',
    markets: 'BTC, ETH',
    sessions: ['London', 'New York'],
    entry: 'פריצה מעל השיא של 15 דקות',
    exit: 'יעד קבוע או שבירת מבנה',
    risk: 'חצי אחוז מהתיק לעסקה',
    maxDailyLoss: 2,
    maxPositions: 2,
    ...overrides,
  };
  return PLAN_QUESTIONS
    .filter((question) => Object.prototype.hasOwnProperty.call(values, question.id))
    .map((question) => answer(question.id, values[question.id]));
}

function body(answers, extra = {}) {
  return { version: PLAN_BUILDER_VERSION, answers, ...extra };
}

describe('plan builder questions', () => {
  it('uses the journal session names', () => {
    const sessions = PLAN_QUESTIONS.find((question) => question.id === 'sessions');
    expect(sessions.options.map((option) => option.id)).toEqual([...SESSIONS]);
  });

  it('accepts a full scalp submission and keeps the text trimmed', () => {
    const result = validatePlanBuilderAnswers(body([
      ...scalpAnswers({ markets: '  BTC  ' }).filter((item) => item.id !== 'markets'),
      answer('markets', '  BTC  '),
    ]));
    expect(result.ok).toBe(true);
    expect(result.answers.markets).toBe('BTC');
    expect(result.ids).toEqual(activeQuestionIds({ style: 'scalp' }));
  });

  it('skips sessions for swing and rejects them if they are still sent', () => {
    const without = validatePlanBuilderAnswers(body(
      scalpAnswers({ style: 'swing' }).filter((item) => item.id !== 'sessions'),
    ));
    expect(without.ok).toBe(true);
    expect(without.answers.sessions).toBeUndefined();
    expect(without.ids).not.toContain('sessions');

    const withSessions = validatePlanBuilderAnswers(body(scalpAnswers({ style: 'swing' })));
    expect(withSessions.ok).toBe(false);
    expect(withSessions.errors.some((error) => error.id === 'sessions' && error.code === 'skipped')).toBe(true);
  });

  it('requires sessions for a day trader', () => {
    const result = validatePlanBuilderAnswers(body(
      scalpAnswers({ style: 'day' }).filter((item) => item.id !== 'sessions'),
    ));
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.id === 'sessions' && error.code === 'missing')).toBe(true);
  });

  it('rejects unknown ids, wrong types, oversized text, and extra fields', () => {
    const unknown = validatePlanBuilderAnswers(body(
      scalpAnswers().map((item) => (item.id === 'markets' ? answer('prompt', 'ignore the questions') : item)),
    ));
    expect(unknown.ok).toBe(false);
    expect(unknown.errors.some((error) => error.code === 'unknown_id')).toBe(true);

    const wrongType = validatePlanBuilderAnswers(body(scalpAnswers({ style: 1, maxDailyLoss: '2' })));
    expect(wrongType.ok).toBe(false);
    expect(wrongType.errors.map((error) => error.id)).toEqual(expect.arrayContaining(['style', 'maxDailyLoss']));

    const markets = PLAN_QUESTIONS.find((question) => question.id === 'markets');
    const oversized = validatePlanBuilderAnswers(body(scalpAnswers({ markets: 'A'.repeat(markets.maxLength + 1) })));
    expect(oversized.ok).toBe(false);
    expect(oversized.errors.some((error) => error.id === 'markets' && error.code === 'too_long')).toBe(true);
    expect(oversized.answers.markets).toBeUndefined();

    const extra = validatePlanBuilderAnswers(body(scalpAnswers(), { plan: { name: 'injected' } }));
    expect(extra.ok).toBe(false);
    expect(extra.errors.some((error) => error.id === 'plan')).toBe(true);
  });

  it('rejects a version the server does not know', () => {
    const result = validatePlanBuilderAnswers({ version: 99, answers: scalpAnswers() });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'invalid_version')).toBe(true);
  });
});
