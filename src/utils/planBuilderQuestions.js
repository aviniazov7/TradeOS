// Fixed questions for the Premium plan builder. Versioned so a later client
// and the Worker agree on the same set. Nothing here calls a model. A
// question may be skipped from an earlier answer; there is no saved session.
// Leaving the flow means starting over.

import { SESSIONS } from './constants';
import { PLAN_PAIR_LIMIT, normalizePlanPairs, planPairFromName } from './planSymbols';

// The plan form stores any of these. Its old dropdown only listed four of
// them; custom entry and the plan templates already use the rest.
export const PLAN_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W'];

function timeframeMinutes(tf) {
  const num = parseFloat(tf);
  if (tf.endsWith('m')) return num;
  if (tf.endsWith('H') || tf.endsWith('h')) return num * 60;
  if (tf.endsWith('D') || tf.endsWith('d')) return num * 1440;
  if (tf.endsWith('W') || tf.endsWith('w')) return num * 10080;
  if (tf.endsWith('M')) return num * 43200;
  return Infinity;
}

// Catalog first, then any timeframe the trader already saved on the form.
export function planTimeframeChoices(extra = []) {
  const seen = new Set(PLAN_TIMEFRAMES);
  const merged = [...PLAN_TIMEFRAMES];
  for (const tf of extra) {
    if (typeof tf === 'string' && tf && !seen.has(tf)) {
      seen.add(tf);
      merged.push(tf);
    }
  }
  return merged.sort((a, b) => timeframeMinutes(a) - timeframeMinutes(b));
}

export const PLAN_BUILDER_VERSION = 2;

// Separate from the shared TradeAI daily counter. One accepted submission
// spends one of these. Resets with the Israel date on the quota document.
export const PLAN_BUILDER_DAILY_LIMIT = 3;

const TEXT = 2000;

const sessionOptions = SESSIONS.map((id) => ({
  id,
  label: {
    London: 'לונדון',
    'New York': 'ניו יורק',
    Asia: 'אסיה',
    'London/NY Overlap': 'חפיפה לונדון/ניו יורק',
  }[id] || id,
}));

// Sessions drop out for swing. Every other editable plan field is asked.
// Long answers are optional: only a skipped one is left for the draft.
// The draft itself writes the name, checklist, color, and trade examples.
// The active switch stays on unless the trader changes it in the form.
export const PLAN_QUESTIONS = [
  {
    id: 'style',
    text: 'איזה סגנון מסחר מתאר אותך?',
    type: 'choice',
    options: [
      { id: 'scalp', label: 'סקאלפינג' },
      { id: 'day', label: 'מסחר יומי' },
      { id: 'swing', label: 'סווינג' },
    ],
  },
  {
    id: 'markets',
    text: 'באילו מטבעות אתה סוחר?',
    type: 'symbols',
  },
  {
    id: 'timeframes',
    text: 'באילו טיימפריימים אתה סוחר?',
    type: 'multi',
    options: PLAN_TIMEFRAMES.map((id) => ({ id, label: id })),
  },
  {
    id: 'sessions',
    text: 'באילו סשנים אתה סוחר?',
    type: 'multi',
    options: sessionOptions,
    // Swing trades are not tied to a session. The question is not asked.
    skipWhen: { id: 'style', equals: 'swing' },
  },
  {
    id: 'description',
    text: 'מה תיאור התוכנית?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'entry',
    text: 'מתי אתה נכנס לעסקה?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'exit',
    text: 'מתי אתה יוצא, ומה היעד?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'tradeManagement',
    text: 'איך אתה מנהל עסקה פתוחה?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'marketConditions',
    text: 'תנאי שוק: באילו תנאים אתה סוחר?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'dailyRoutine',
    text: 'איך נראית השגרה היומית שלך?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'mistakes',
    text: 'אילו טעויות אתה רוצה להימנע מהן?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'goals',
    text: 'מהם היעדים?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'risk',
    text: 'איך מנוהל הסיכון?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'notes',
    text: 'אילו הערות לשמור בתוכנית?',
    type: 'text',
    maxLength: TEXT,
    optional: true,
  },
  {
    id: 'maxDailyLoss',
    text: 'מה אחוז ההפסד היומי המקסימלי?',
    type: 'number',
    min: 0,
    max: 100,
  },
  {
    id: 'maxPositions',
    text: 'כמה עסקאות פתוחות במקביל לכל היותר?',
    type: 'number',
    min: 1,
    max: 20,
    integer: true,
  },
];

const QUESTION_BY_ID = new Map(PLAN_QUESTIONS.map((question) => [question.id, question]));

function problem(id, code, message) {
  return { id, code, message };
}

function isSkipped(question, answers) {
  const rule = question.skipWhen;
  return !!(rule && answers[rule.id] === rule.equals);
}

function optionIds(question) {
  return new Set((question.options || []).map((option) => option.id));
}

function readText(question, value, errors) {
  if (typeof value !== 'string') {
    errors.push(problem(question.id, 'wrong_type', `${question.id} must be a string`));
    return undefined;
  }
  const text = value.trim();
  if (!text) {
    errors.push(problem(question.id, 'missing', `${question.id} is required`));
    return undefined;
  }
  if (text.length > question.maxLength) {
    errors.push(problem(question.id, 'too_long', `${question.id} is longer than ${question.maxLength} characters`));
    return undefined;
  }
  return text;
}

function readChoice(question, value, errors) {
  const allowed = optionIds(question);
  if (typeof value !== 'string' || !allowed.has(value)) {
    errors.push(problem(question.id, 'invalid_value', `${question.id} is not one of the choices`));
    return undefined;
  }
  return value;
}

function readMulti(question, value, errors) {
  const allowed = optionIds(question);
  if (!Array.isArray(value) || value.length === 0 || value.length > allowed.size) {
    errors.push(problem(question.id, 'wrong_type', `${question.id} must be a short list of choices`));
    return undefined;
  }
  const picked = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || picked.includes(item)) {
      errors.push(problem(question.id, 'invalid_value', `${question.id} has an invalid choice`));
      return undefined;
    }
    picked.push(item);
  }
  return picked;
}

function readSymbols(question, value, errors) {
  if (!Array.isArray(value) || value.length === 0 || value.length > PLAN_PAIR_LIMIT) {
    errors.push(problem(question.id, 'wrong_type', `${question.id} must be a short list of symbols`));
    return undefined;
  }
  const picked = [];
  for (const item of value) {
    const pair = typeof item === 'string' ? planPairFromName(item) : '';
    if (!pair) {
      errors.push(problem(question.id, 'invalid_value', `${question.id} has an unknown symbol`));
      return undefined;
    }
    if (!picked.includes(pair)) picked.push(pair);
  }
  return picked;
}

function readNumber(question, value, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(problem(question.id, 'wrong_type', `${question.id} must be a number`));
    return undefined;
  }
  if (question.integer && !Number.isInteger(value)) {
    errors.push(problem(question.id, 'invalid_value', `${question.id} must be an integer`));
    return undefined;
  }
  if (value < question.min || value > question.max) {
    errors.push(problem(question.id, 'out_of_range', `${question.id} is out of range`));
    return undefined;
  }
  return value;
}

function readValue(question, value, errors) {
  if (question.type === 'text') return readText(question, value, errors);
  if (question.type === 'choice') return readChoice(question, value, errors);
  if (question.type === 'multi') return readMulti(question, value, errors);
  if (question.type === 'symbols') return readSymbols(question, value, errors);
  if (question.type === 'number') return readNumber(question, value, errors);
  errors.push(problem(question.id, 'invalid_value', `${question.id} has an unknown type`));
  return undefined;
}

/**
 * Validate one submission of the fixed question set.
 * Returns { ok, answers, ids, errors }. Skipped questions are absent.
 * A skipped question that was still sent is an error, not stored.
 */
export function validatePlanBuilderAnswers(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, answers: {}, ids: [], errors: [problem('', 'invalid_input', 'body must be a JSON object')] };
  }
  for (const key of Object.keys(body)) {
    if (key !== 'version' && key !== 'answers') {
      errors.push(problem(key, 'unknown_field', `${key} is not accepted`));
    }
  }
  if (body.version !== PLAN_BUILDER_VERSION) {
    errors.push(problem('version', 'invalid_version', 'unsupported question version'));
  }
  if (!Array.isArray(body.answers) || body.answers.length > PLAN_QUESTIONS.length) {
    errors.push(problem('answers', 'invalid_input', 'answers must be a list of the fixed questions'));
    return { ok: false, answers: {}, ids: [], errors };
  }

  const raw = new Map();
  for (const item of body.answers) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(problem('', 'wrong_type', 'each answer must be an object'));
      continue;
    }
    for (const key of Object.keys(item)) {
      if (key !== 'id' && key !== 'value') {
        errors.push(problem(typeof item.id === 'string' ? item.id : '', 'unknown_field', `${key} is not an answer field`));
      }
    }
    const id = item.id;
    if (typeof id !== 'string' || !QUESTION_BY_ID.has(id)) {
      errors.push(problem(typeof id === 'string' ? id : '', 'unknown_id', 'unknown question'));
      continue;
    }
    if (raw.has(id)) {
      errors.push(problem(id, 'duplicate', `${id} was sent more than once`));
      continue;
    }
    raw.set(id, item.value);
  }

  const answers = {};
  const ids = [];
  for (const question of PLAN_QUESTIONS) {
    const present = raw.has(question.id);
    if (isSkipped(question, answers)) {
      if (present) errors.push(problem(question.id, 'skipped', `${question.id} does not apply to these answers`));
      continue;
    }
    if (!present) {
      if (question.optional) continue;
      errors.push(problem(question.id, 'missing', `${question.id} is required`));
      continue;
    }
    const value = readValue(question, raw.get(question.id), errors);
    if (value === undefined) continue;
    answers[question.id] = value;
    ids.push(question.id);
  }

  return { ok: errors.length === 0, answers, ids, errors };
}

export function activeQuestionIds(answers) {
  return PLAN_QUESTIONS.filter((question) => !isSkipped(question, answers)).map((question) => question.id);
}

const ANSWER_TEXT = {
  description: 'description',
  entry: 'entryRules',
  exit: 'exitRules',
  tradeManagement: 'tradeManagement',
  marketConditions: 'marketConditions',
  dailyRoutine: 'dailyRoutine',
  goals: 'goals',
  risk: 'riskManagement',
  notes: 'notes',
};

// Copy the trader's answers onto a draft before it is sanitized. Skipped
// text stays whatever the draft already proposed. Symbols replace names.
export function draftFromAnswers(plan, answers = {}) {
  const next = plan && typeof plan === 'object' && !Array.isArray(plan) ? { ...plan } : {};
  if (Array.isArray(answers.markets) && answers.markets.length) {
    const pairs = normalizePlanPairs(answers.markets);
    if (pairs.length) next.pairs = pairs;
  }
  if (Array.isArray(answers.timeframes) && answers.timeframes.length) next.timeframes = answers.timeframes;
  if (answers.style === 'swing') next.sessions = [];
  else if (Array.isArray(answers.sessions)) next.sessions = answers.sessions;
  for (const [id, field] of Object.entries(ANSWER_TEXT)) {
    if (typeof answers[id] === 'string' && answers[id].trim()) next[field] = answers[id].trim();
  }
  if (typeof answers.mistakes === 'string' && answers.mistakes.trim()) {
    next.mistakesToAvoid = answers.mistakes.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof answers.maxDailyLoss === 'number') next.maxDailyLoss = answers.maxDailyLoss;
  if (typeof answers.maxPositions === 'number') next.maxPositions = answers.maxPositions;
  return next;
}
