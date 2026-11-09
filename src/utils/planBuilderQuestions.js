// Fixed questions for the Premium plan builder. Versioned so a later client
// and the Worker agree on the same set. Nothing here calls a model. A
// question may be skipped from an earlier answer; there is no saved session.
// Leaving the flow means starting over.

export const PLAN_BUILDER_VERSION = 1;

// Separate from the shared TradeAI daily counter. One accepted submission
// spends one of these. Resets with the Israel date on the quota document.
export const PLAN_BUILDER_DAILY_LIMIT = 3;

const TEXT = 2000;
const SHORT = 200;

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
    text: 'באילו שווקים או מטבעות אתה סוחר?',
    type: 'text',
    maxLength: SHORT,
  },
  {
    id: 'sessions',
    text: 'באילו סשנים אתה סוחר?',
    type: 'multi',
    options: [
      { id: 'London', label: 'לונדון' },
      { id: 'New York', label: 'ניו יורק' },
      { id: 'Asia', label: 'אסיה' },
      { id: 'London/NY Overlap', label: 'חפיפה לונדון/ניו יורק' },
    ],
    // Swing trades are not tied to a session. The question is not asked.
    skipWhen: { id: 'style', equals: 'swing' },
  },
  {
    id: 'entry',
    text: 'מתי אתה נכנס לעסקה?',
    type: 'text',
    maxLength: TEXT,
  },
  {
    id: 'exit',
    text: 'מתי אתה יוצא מעסקה?',
    type: 'text',
    maxLength: TEXT,
  },
  {
    id: 'risk',
    text: 'איך אתה מגדיר את הסיכון לעסקה?',
    type: 'text',
    maxLength: TEXT,
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
