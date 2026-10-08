import { localDayKey } from './calculations';
import { toDate } from './mentalityDashboard';

// Pure logic behind the morning / evening journal pages: which stored entry is
// "today's", the editable form <-> stored document mapping, what's required
// before saving, and the rules checklist for the morning. No React, no
// Firestore, so all of it is unit-tested.
//
// Stored shape — every field the older forms wrote is still written (history,
// the zone cards, mental stats and the AI coach read them):
//   morning: emotion, readinessLevel, preMarketChecklist, thingsIAppreciate,
//            mainGoal, focusToday, dailyGoals, motivation
//            + new: sleepQuality, marketBias, keyLevels, rulesChecked,
//              rulesTotal, rulesPlanName
//   evening: emotionAfter, followedPlan, whatWentWell, whatDidntGoWell,
//            lessonsLearned, gratitude, dayRating
//            + new: emotionsAfter, planAdherence, planNote

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Which entry is today's ───────────────────────────────────────────────────

// The local day an entry belongs to. `date` (written with localDayKey at save
// time) is authoritative; an entry without one falls back to the LOCAL day of
// its createdAt — never the UTC day, which is still "yesterday" until 03:00 in
// Israel.
export function entryDayKey(entry) {
  if (!entry) return '';
  if (typeof entry.date === 'string' && DAY_KEY_RE.test(entry.date)) return entry.date;
  const at = toDate(entry.createdAt);
  return at ? localDayKey(at) : '';
}

// Firestore Timestamp | Date | ... → millis. A pending serverTimestamp() reads
// back as null in the local snapshot right after a write, so a missing stamp
// on an existing doc means "just written" — the newest.
const stampOf = (v) => {
  const d = toDate(v);
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
};

// The entry for a given local day. Several docs can share a day (older builds
// could create duplicates); the most recently edited one wins.
export function findEntryForDay(entries, dayKey) {
  if (!dayKey) return null;
  const matches = (entries || []).filter((e) => entryDayKey(e) === dayKey);
  if (matches.length <= 1) return matches[0] || null;
  return [...matches].sort((a, b) => (
    (stampOf(b.updatedAt) - stampOf(a.updatedAt))
    || (stampOf(b.createdAt) - stampOf(a.createdAt))
    || String(a.id).localeCompare(String(b.id))
  ))[0];
}

export const findTodayEntry = (entries, now = new Date()) => findEntryForDay(entries, localDayKey(now));

// The entry for the local day before `now` (morning shows yesterday's lesson).
export function findYesterdayEntry(entries, now = new Date()) {
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return findEntryForDay(entries, localDayKey(y));
}

// "08:42" from a Firestore Timestamp / Date, or null.
export function entryTime(value) {
  const d = toDate(value);
  if (!d) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Options ──────────────────────────────────────────────────────────────────

export const SLEEP_OPTIONS = [
  { value: 'good', label: 'טובה' },
  { value: 'ok', label: 'בסדר' },
  { value: 'poor', label: 'גרועה' },
];

export const BIAS_OPTIONS = [
  { value: 'bullish', label: 'שורי' },
  { value: 'neutral', label: 'ניטרלי' },
  { value: 'bearish', label: 'דובי' },
  { value: 'unclear', label: 'לא ברור' },
];

export const ADHERENCE_OPTIONS = [
  { value: 'yes', label: 'כן' },
  { value: 'partial', label: 'חלקית' },
  { value: 'no', label: 'לא' },
];

export const MAX_EVENING_EMOTIONS = 2;

export const labelOf = (options, value) => options.find((o) => o.value === value)?.label || '';

// ── Morning ──────────────────────────────────────────────────────────────────

export const emptyMorningForm = () => ({
  emotion: '',
  readinessLevel: null,
  sleepQuality: '',
  marketBias: '',
  keyLevels: '',
  focusToday: '',
  dailyGoals: '',
  preMarketChecklist: [],
  rulesChecked: [],
  mainGoal: '',
  motivation: '',
  thingsIAppreciate: ['', '', ''],
});

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const rating = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};
const three = (v) => {
  const a = arr(v).slice(0, 3);
  while (a.length < 3) a.push('');
  return a;
};

export function morningFormFromEntry(entry) {
  const base = emptyMorningForm();
  if (!entry) return base;
  return {
    ...base,
    emotion: str(entry.emotion),
    readinessLevel: rating(entry.readinessLevel),
    sleepQuality: str(entry.sleepQuality),
    marketBias: str(entry.marketBias),
    keyLevels: str(entry.keyLevels),
    focusToday: str(entry.focusToday),
    dailyGoals: str(entry.dailyGoals),
    preMarketChecklist: arr(entry.preMarketChecklist),
    rulesChecked: arr(entry.rulesChecked),
    mainGoal: str(entry.mainGoal),
    motivation: str(entry.motivation),
    thingsIAppreciate: three(entry.thingsIAppreciate),
  };
}

export const MORNING_REQUIRED = [
  { key: 'emotion', label: 'מצב רגשי', done: (f) => !!f.emotion },
  { key: 'readinessLevel', label: 'מוכנות', done: (f) => rating(f.readinessLevel) != null },
  { key: 'mainGoal', label: 'כוונה ליום', done: (f) => !!str(f.mainGoal).trim() },
];

// The document written to Firestore. `rules` is the list the checklist was
// shown with, so the stored count stays meaningful if the plan changes later.
export function morningPayload(form, { date, rules = [], planName = '' } = {}) {
  const ruleSet = new Set(rules);
  return {
    date,
    emotion: form.emotion,
    readinessLevel: rating(form.readinessLevel),
    sleepQuality: str(form.sleepQuality),
    marketBias: str(form.marketBias),
    keyLevels: str(form.keyLevels).trim(),
    focusToday: str(form.focusToday).trim(),
    dailyGoals: str(form.dailyGoals).trim(),
    preMarketChecklist: arr(form.preMarketChecklist),
    rulesChecked: arr(form.rulesChecked).filter((r) => ruleSet.has(r)),
    rulesTotal: rules.length,
    rulesPlanName: str(planName),
    mainGoal: str(form.mainGoal).trim(),
    motivation: str(form.motivation).trim(),
    thingsIAppreciate: three(form.thingsIAppreciate).map((t) => t.trim()),
  };
}

// Used when no trading plan exists (or the active one has nothing checkable).
export const DEFAULT_RULES = [
  'סטופ מוגדר לפני כל כניסה',
  'סיכון קבוע לעסקה, בלי להגדיל אחרי הפסד',
  'נכנס רק לסטאפים שבתוכנית',
  'בלי עסקאות נקמה ובלי FOMO',
  'עוצר להיום אחרי 2 הפסדים ברצף',
];

const MAX_RULES = 8;

// The morning checklist from the active trading plan: its checklist items,
// its daily-loss / position caps and its "mistakes to avoid" — or the default
// rules when there's no plan or nothing usable in it.
export function rulesFromPlan(plan) {
  if (!plan) return { rules: DEFAULT_RULES, source: 'default', planName: '' };
  const out = [];
  const push = (s) => {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t && !out.includes(t)) out.push(t);
  };
  arr(plan.checklist).forEach(push);
  const loss = Number(plan.maxDailyLoss);
  if (Number.isFinite(loss) && loss > 0) push(`הפסד יומי מקסימלי ${loss}%`);
  const pos = Number(plan.maxPositions);
  if (Number.isFinite(pos) && pos > 0) push(pos === 1 ? 'פוזיציה אחת פתוחה לכל היותר' : `עד ${pos} פוזיציות פתוחות במקביל`);
  arr(plan.mistakesToAvoid).forEach((m) => push(m.trim() ? `להימנע: ${m.trim()}` : ''));
  const planName = str(plan.name).trim();
  if (!out.length) return { rules: DEFAULT_RULES, source: 'default', planName };
  return { rules: out.slice(0, MAX_RULES), source: 'plan', planName };
}

// ── Evening ──────────────────────────────────────────────────────────────────

export const emptyEveningForm = () => ({
  dayRating: null,
  emotionsAfter: [],
  planAdherence: '',
  planNote: '',
  whatWentWell: '',
  whatDidntGoWell: '',
  lessonsLearned: '',
  gratitude: '',
});

export function eveningFormFromEntry(entry) {
  const base = emptyEveningForm();
  if (!entry) return base;
  let emotions = arr(entry.emotionsAfter).slice(0, MAX_EVENING_EMOTIONS);
  if (!emotions.length && str(entry.emotionAfter)) emotions = [entry.emotionAfter];
  let adherence = str(entry.planAdherence);
  if (!['yes', 'partial', 'no'].includes(adherence)) {
    adherence = entry.followedPlan === true ? 'yes' : entry.followedPlan === false ? 'no' : '';
  }
  return {
    ...base,
    dayRating: rating(entry.dayRating),
    emotionsAfter: emotions,
    planAdherence: adherence,
    planNote: str(entry.planNote),
    whatWentWell: str(entry.whatWentWell),
    whatDidntGoWell: str(entry.whatDidntGoWell),
    lessonsLearned: str(entry.lessonsLearned),
    gratitude: str(entry.gratitude),
  };
}

export const EVENING_REQUIRED = [
  { key: 'dayRating', label: 'דירוג היום', done: (f) => rating(f.dayRating) != null },
  { key: 'emotionsAfter', label: 'רגש', done: (f) => arr(f.emotionsAfter).length > 0 },
  { key: 'planAdherence', label: 'עמידה בתוכנית', done: (f) => !!f.planAdherence },
  { key: 'lessonsLearned', label: 'לקח למחר', done: (f) => !!str(f.lessonsLearned).trim() },
];

// "Partly" followed is stored as followedPlan: false — the plan was broken at
// least once — so every boolean reader (mental stats, the coach, the zone's
// plan-adherence headline) keeps working; planAdherence keeps the nuance.
export function followedPlanFrom(adherence) {
  if (adherence === 'yes') return true;
  if (adherence === 'partial' || adherence === 'no') return false;
  return null;
}

export function eveningPayload(form, { date } = {}) {
  const emotions = arr(form.emotionsAfter).slice(0, MAX_EVENING_EMOTIONS);
  return {
    date,
    dayRating: rating(form.dayRating),
    emotionAfter: emotions[0] || '',
    emotionsAfter: emotions,
    planAdherence: str(form.planAdherence),
    followedPlan: followedPlanFrom(form.planAdherence),
    planNote: str(form.planNote).trim(),
    whatWentWell: str(form.whatWentWell).trim(),
    whatDidntGoWell: str(form.whatDidntGoWell).trim(),
    lessonsLearned: str(form.lessonsLearned).trim(),
    gratitude: str(form.gratitude).trim(),
  };
}

// ── Shared ───────────────────────────────────────────────────────────────────

export function requiredProgress(required, form) {
  const missing = required.filter((r) => !r.done(form));
  return { done: required.length - missing.length, total: required.length, missing, complete: missing.length === 0 };
}

// Shallow-ish equality of two forms (arrays compared by value), to tell a
// pristine form from one with unsaved input.
export function formsEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = a?.[k];
    const y = b?.[k];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
    } else if (x !== y) return false;
  }
  return true;
}

// localStorage key of an unsaved draft: per user, journal and local day, so a
// draft never leaks into another account or the next day's journal.
export const draftKey = (uid, kind, dayKey) => `tradeos:journalDraft:${uid || 'anon'}:${kind}:${dayKey}`;
export const DRAFT_PREFIX = 'tradeos:journalDraft:';

// What the journal page shows. Once today's entry exists — or was just saved
// and the listener hasn't delivered it yet — the page shows the completed
// summary; the form comes back only when the user asks to edit. (The old pages
// reset to an empty form after saving, so a saved journal looked unfilled.)
export function journalView({ loading = false, entry = null, savedEntry = null, editing = false } = {}) {
  if (editing) return 'form';
  if (entry || savedEntry) return 'completed';
  if (loading) return 'loading';
  return 'form';
}
