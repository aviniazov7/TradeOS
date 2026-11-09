// Sanitize an untrusted plan object before any later save. Shared by the
// Worker and the UI. No I/O. The keys match PlanForm defaultForm
// (src/components/plans/PlanForm.jsx). firestore.rules isBoundedDoc allows
// fewer than 60 top-level keys; this module only ever returns PLAN_AI_KEYS.

import { SESSIONS } from './constants';
import { planPairFromName } from './planSymbols';

const TEXT_MAX = 4000;
const NAME_MAX = 80;
const ITEM_MAX = 200;
const PAIR_MAX = 30;
const URL_MAX = 2000;
const LIST_MAX = 12;
const EXAMPLE_MAX = 8;
const LOSS_MAX = 100;
const POSITIONS_MAX = 20;
const KEY_LIMIT = 60;
const DEFAULT_COLOR = '#06b6d4';

const PLAN_AI_KEYS = [
  'name', 'description', 'entryRules', 'exitRules', 'riskManagement', 'goals',
  'notes', 'pairs', 'timeframes', 'sessions', 'maxDailyLoss', 'maxPositions',
  'checklist', 'isActive', 'color', 'tradeExamples', 'marketConditions',
  'mistakesToAvoid', 'dailyRoutine', 'tradeManagement',
];

const LONG_TEXT = [
  'description', 'entryRules', 'exitRules', 'riskManagement', 'goals', 'notes',
  'marketConditions', 'dailyRoutine', 'tradeManagement',
];

const STRING_LISTS = ['checklist', 'mistakesToAvoid'];

const PAIR_RE = /^[A-Z0-9][A-Z0-9._-]{0,29}$/;
const TF_RE = /^\d{1,4}[mHDWM]$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const HTTP_RE = /^https?:\/\/\S+$/i;

// Guarantee / risk-free language. Ordinary words like "רווח" or "risk" stay,
// because a real plan talks about risk and targets.
const PROMISE_RE = /guaranteed|guarantee|risk[-\s]?free|sure profit|can(?:no|')t lose|no risk|100\s*%\s*(?:win|success)|win rate of 100|מובטח(?:ת|ים|ות)?|ללא סיכון|בלי סיכון|אין סיכון|אפס סיכון|רווח בטוח|רווח ודאי|תשואה מובטחת|תשואה ודאית|בטוח להרוויח|בטוח שתרוויח/i;

const INJECTION_RE = /ignore (?:all |any |the )?(?:previous|prior|above) instructions|disregard (?:the )?(?:system|previous|above)|you are now|new instructions\s*:|<\|im_start\|>|###\s*system|system prompt|התעלם מההוראות|הוראות קודמות/i;

const SESSION_SET = new Set(SESSIONS);

function error(field, code, message) {
  return { field, code, message };
}

function emptyPlan() {
  return {
    name: '',
    description: '',
    entryRules: '',
    exitRules: '',
    riskManagement: '',
    goals: '',
    notes: '',
    pairs: [],
    timeframes: [],
    sessions: [],
    maxDailyLoss: null,
    maxPositions: null,
    checklist: [],
    isActive: true,
    color: DEFAULT_COLOR,
    tradeExamples: [],
    marketConditions: '',
    mistakesToAvoid: [],
    dailyRoutine: '',
    tradeManagement: '',
  };
}

function stripControls(text) {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    const keep = code === 9 || code === 10 || code === 13 || code > 31;
    if (keep && code !== 127) out += char;
  }
  return out;
}

function stripHtml(text) {
  return stripControls(text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/javascript\s*:/gi, ' ')
    .replace(/\bon\w+\s*=/gi, ' '));
}

function dropMatching(text, pattern) {
  let hit = false;
  const lines = text.split(/\n+/).map((line) => {
    const kept = line.split(/(?<=[.!?])\s+/).filter((sentence) => {
      if (pattern.test(sentence)) {
        hit = true;
        return false;
      }
      return true;
    });
    return kept.join(' ').trim();
  }).filter(Boolean);
  return { text: lines.join('\n').trim(), hit };
}

function cleanText(raw, max, field, errors) {
  if (typeof raw !== 'string') {
    errors.push(error(field, 'wrong_type', `${field} must be a string`));
    return '';
  }
  const stripped = stripHtml(raw);
  if (stripped !== raw) errors.push(error(field, 'unsafe_html', `${field} contained HTML or script`));
  const injected = dropMatching(stripped, INJECTION_RE);
  if (injected.hit) errors.push(error(field, 'injection', `${field} contained instruction-like text`));
  const promised = dropMatching(injected.text, PROMISE_RE);
  if (promised.hit) errors.push(error(field, 'profit_promise', `${field} contained a profit guarantee`));
  const trimmed = promised.text.replace(/[ \t]{2,}/g, ' ').trim();
  if (trimmed.length > max) {
    errors.push(error(field, 'too_long', `${field} is longer than ${max} characters`));
    return trimmed.slice(0, max).trim();
  }
  return trimmed;
}

function cleanStringList(raw, field, errors, { pattern, normalize } = {}) {
  if (!Array.isArray(raw)) {
    errors.push(error(field, 'wrong_type', `${field} must be a list`));
    return [];
  }
  if (raw.length > LIST_MAX) {
    errors.push(error(field, 'too_many_items', `${field} has more than ${LIST_MAX} items`));
  }
  const out = [];
  for (const item of raw.slice(0, LIST_MAX)) {
    const text = cleanText(item, ITEM_MAX, field, errors);
    if (!text) continue;
    const value = normalize ? normalize(text) : text;
    if (pattern && !pattern.test(value)) {
      errors.push(error(field, 'invalid_value', `${field} has an invalid item`));
      continue;
    }
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function cleanTimeframe(value) {
  const token = value.trim();
  if (!/^\d{1,4}[mMhHdDwW]$/.test(token)) return '';
  const unit = token.slice(-1);
  const mapped = unit === 'h' ? 'H' : unit === 'd' ? 'D' : unit === 'w' ? 'W' : unit;
  return token.slice(0, -1) + mapped;
}

function cleanExample(raw, errors) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(error('tradeExamples', 'wrong_type', 'each trade example must be an object'));
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'title' && key !== 'chartUrl' && key !== 'description') {
      errors.push(error('tradeExamples', 'unknown_field', `${key} is not a trade example field`));
    }
  }
  const title = cleanText(raw.title ?? '', ITEM_MAX, 'tradeExamples', errors);
  const description = cleanText(raw.description ?? '', TEXT_MAX, 'tradeExamples', errors);
  let chartUrl = '';
  if (raw.chartUrl != null && raw.chartUrl !== '') {
    if (typeof raw.chartUrl !== 'string') {
      errors.push(error('tradeExamples', 'wrong_type', 'chartUrl must be a string'));
    } else {
      const url = stripHtml(raw.chartUrl).trim();
      if (url.length > URL_MAX || !HTTP_RE.test(url)) {
        errors.push(error('tradeExamples', 'invalid_value', 'chartUrl must be an http(s) URL'));
      } else {
        chartUrl = url;
      }
    }
  }
  if (!title && !description && !chartUrl) return null;
  return { title, chartUrl, description };
}

function cleanNumber(raw, field, { min, max, integer }, errors) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    errors.push(error(field, 'wrong_type', `${field} must be a number`));
    return null;
  }
  if (integer && !Number.isInteger(raw)) {
    errors.push(error(field, 'invalid_value', `${field} must be an integer`));
    return null;
  }
  if (raw < min || raw > max) {
    errors.push(error(field, 'out_of_range', `${field} must be from ${min} to ${max}`));
    return null;
  }
  return raw;
}

/**
 * Turn an untrusted parsed JSON value into a plan draft.
 * Returns { ok, plan, errors }. `plan` is always the allow-listed shape.
 * `ok` is true only when `errors` is empty.
 */
export function validateAiPlan(input) {
  const errors = [];
  const plan = emptyPlan();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push(error('', 'invalid_input', 'plan must be a JSON object'));
    return { ok: false, plan, errors };
  }

  const keys = Object.keys(input);
  if (keys.length >= KEY_LIMIT) {
    errors.push(error('', 'too_many_keys', `plan has ${keys.length} keys; Firestore allows fewer than ${KEY_LIMIT}`));
  }
  for (const key of keys) {
    if (!PLAN_AI_KEYS.includes(key)) {
      errors.push(error(key, 'unknown_field', `${key} is not a plan field`));
    }
  }

  if (!Object.prototype.hasOwnProperty.call(input, 'name')) {
    errors.push(error('name', 'missing', 'name is required'));
  } else {
    plan.name = cleanText(input.name, NAME_MAX, 'name', errors);
    if (!plan.name) errors.push(error('name', 'missing', 'name is required'));
  }

  for (const field of LONG_TEXT) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    plan[field] = cleanText(input[field], TEXT_MAX, field, errors);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'pairs')) {
    plan.pairs = cleanStringList(input.pairs, 'pairs', errors, {
      pattern: PAIR_RE,
      normalize: (value) => planPairFromName(value),
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'timeframes')) {
    plan.timeframes = cleanStringList(input.timeframes, 'timeframes', errors, {
      pattern: TF_RE,
      normalize: cleanTimeframe,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'sessions')) {
    if (!Array.isArray(input.sessions)) {
      errors.push(error('sessions', 'wrong_type', 'sessions must be a list'));
    } else {
      if (input.sessions.length > LIST_MAX) {
        errors.push(error('sessions', 'too_many_items', `sessions has more than ${LIST_MAX} items`));
      }
      const sessions = [];
      for (const item of input.sessions.slice(0, LIST_MAX)) {
        if (typeof item !== 'string' || !SESSION_SET.has(item)) {
          errors.push(error('sessions', 'invalid_value', 'sessions must use the journal session names'));
          continue;
        }
        if (!sessions.includes(item)) sessions.push(item);
      }
      plan.sessions = sessions;
    }
  }

  for (const field of STRING_LISTS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    plan[field] = cleanStringList(input[field], field, errors);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'maxDailyLoss')) {
    plan.maxDailyLoss = cleanNumber(input.maxDailyLoss, 'maxDailyLoss', { min: 0, max: LOSS_MAX, integer: false }, errors);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'maxPositions')) {
    plan.maxPositions = cleanNumber(input.maxPositions, 'maxPositions', { min: 1, max: POSITIONS_MAX, integer: true }, errors);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'isActive')) {
    if (typeof input.isActive !== 'boolean') {
      errors.push(error('isActive', 'wrong_type', 'isActive must be a boolean'));
    } else {
      plan.isActive = input.isActive;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'color')) {
    if (typeof input.color !== 'string' || !COLOR_RE.test(input.color.trim())) {
      errors.push(error('color', 'invalid_value', 'color must be a #RRGGBB hex'));
    } else {
      plan.color = input.color.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'tradeExamples')) {
    if (!Array.isArray(input.tradeExamples)) {
      errors.push(error('tradeExamples', 'wrong_type', 'tradeExamples must be a list'));
    } else {
      if (input.tradeExamples.length > EXAMPLE_MAX) {
        errors.push(error('tradeExamples', 'too_many_items', `tradeExamples has more than ${EXAMPLE_MAX} items`));
      }
      plan.tradeExamples = input.tradeExamples
        .slice(0, EXAMPLE_MAX)
        .map((item) => cleanExample(item, errors))
        .filter(Boolean);
    }
  }

  if (Object.keys(plan).length >= KEY_LIMIT) {
    errors.push(error('', 'too_many_keys', 'sanitized plan is over the Firestore key limit'));
  }

  return { ok: errors.length === 0, plan, errors };
}

export { PLAN_AI_KEYS };
