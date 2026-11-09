import { describe, expect, it } from 'vitest';
import { SESSIONS } from './constants';
import {
  PLAN_BUILDER_VERSION, PLAN_QUESTIONS, PLAN_TIMEFRAMES, activeQuestionIds, planTimeframeChoices,
  validatePlanBuilderAnswers,
} from './planBuilderQuestions';

// Synthetic answers. Not a user's journal and not a saved plan.

function answer(id, value) {
  return { id, value };
}

function scalpAnswers(overrides = {}) {
  const values = {
    style: 'scalp',
    markets: ['BTCUSDT'],
    timeframes: ['15m'],
    sessions: ['London', 'New York'],
    description: 'תיאור סינתטי',
    entry: 'פריצה מעל השיא של 15 דקות',
    exit: 'יעד קבוע או שבירת מבנה',
    tradeManagement: 'הזזת סטופ אחרי יעד',
    marketConditions: 'טרנד ברור',
    dailyRoutine: 'סקירה לפני הפתיחה',
    mistakes: 'בלי עסקת נקמה',
    goals: 'עקביות סינתטית',
    risk: 'אחוז קבוע',
    notes: 'הערה סינתטית',
    maxDailyLoss: 2,
    maxPositions: 2,
    ...overrides,
  };
  return PLAN_QUESTIONS
    .filter((question) => !(values.style === 'swing' && question.id === 'sessions'))
    .filter((question) => Object.prototype.hasOwnProperty.call(values, question.id))
    .map((question) => answer(question.id, values[question.id]));
}

function body(answers, extra = {}) {
  return { version: PLAN_BUILDER_VERSION, answers, ...extra };
}

describe('plan builder questions', () => {
  it('asks description, goals, notes, and market conditions on every style', () => {
    const asked = ['description', 'goals', 'notes', 'marketConditions', 'risk'];
    const conditional = PLAN_QUESTIONS.filter((question) => question.skipWhen).map((question) => question.id);
    expect(conditional).toEqual(['sessions']);
    for (const id of asked) {
      const question = PLAN_QUESTIONS.find((item) => item.id === id);
      expect(question?.optional).toBe(true);
      expect(question?.skipWhen).toBeUndefined();
      expect(activeQuestionIds({ style: 'scalp' })).toContain(id);
      expect(activeQuestionIds({ style: 'swing' })).toContain(id);
    }
    expect(activeQuestionIds({})).toHaveLength(PLAN_QUESTIONS.length);
    expect(activeQuestionIds({ style: 'swing' })).toHaveLength(PLAN_QUESTIONS.length - 1);
  });

  it('offers the plan form timeframe catalog and rejects anything outside it', () => {
    const question = PLAN_QUESTIONS.find((item) => item.id === 'timeframes');
    expect(question.options.map((option) => option.id)).toEqual([...PLAN_TIMEFRAMES]);
    expect(question.type).toBe('multi');
    const accepted = validatePlanBuilderAnswers(body(scalpAnswers({
      timeframes: ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W'],
    })));
    expect(accepted.ok).toBe(true);
    expect(accepted.answers.timeframes).toEqual([...PLAN_TIMEFRAMES]);
    const rejected = validatePlanBuilderAnswers(body(scalpAnswers({ timeframes: ['8H'] })));
    expect(rejected.ok).toBe(false);
    expect(rejected.errors).toContainEqual(expect.objectContaining({ id: 'timeframes', code: 'invalid_value' }));
    expect(planTimeframeChoices(['15m', '8H', '12H'])).toEqual([
      '1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '8H', '12H', '1D', '1W',
    ]);
  });

  it('uses the journal session names', () => {
    const sessions = PLAN_QUESTIONS.find((question) => question.id === 'sessions');
    expect(sessions.options.map((option) => option.id)).toEqual([...SESSIONS]);
  });

  it('accepts a full scalp submission and stores canonical symbols', () => {
    const result = validatePlanBuilderAnswers(body(scalpAnswers({ markets: ['Bitcoin', 'btc', 'ביטקוין'] })));
    expect(result.ok).toBe(true);
    expect(result.answers.markets).toEqual(['BTCUSDT']);
    expect(result.ids).toEqual(activeQuestionIds({ style: 'scalp' }));
  });

  it('allows a skipped long answer and still requires the coins', () => {
    const result = validatePlanBuilderAnswers(body(
      scalpAnswers().filter((item) => item.id !== 'entry' && item.id !== 'mistakes'),
    ));
    expect(result.ok).toBe(true);
    expect(result.answers.entry).toBeUndefined();
    expect(result.answers.markets).toEqual(['BTCUSDT']);

    const missingCoins = validatePlanBuilderAnswers(body(
      scalpAnswers().filter((item) => item.id !== 'markets'),
    ));
    expect(missingCoins.ok).toBe(false);
    expect(missingCoins.errors.some((error) => error.id === 'markets' && error.code === 'missing')).toBe(true);
  });

  it('skips sessions for swing and rejects them if they are still sent', () => {
    const without = validatePlanBuilderAnswers(body(
      scalpAnswers({ style: 'swing' }).filter((item) => item.id !== 'sessions'),
    ));
    expect(without.ok).toBe(true);
    expect(without.answers.sessions).toBeUndefined();
    expect(without.ids).not.toContain('sessions');

    const withSessions = validatePlanBuilderAnswers(body([
      ...scalpAnswers({ style: 'swing' }),
      answer('sessions', ['London']),
    ]));
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

    const unknownSymbol = validatePlanBuilderAnswers(body(scalpAnswers({ markets: ['NOTACOIN'] })));
    expect(unknownSymbol.ok).toBe(false);
    expect(unknownSymbol.errors.some((error) => error.id === 'markets' && error.code === 'invalid_value')).toBe(true);
    expect(unknownSymbol.answers.markets).toBeUndefined();

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
