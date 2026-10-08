import {
  isClosedTrade, localDayKey, winRateOf, safePnl, initialRiskUsd, tradeRMultiple, calculateProfitFactor,
} from './calculations';
import { auditPlan } from './planAudit';
import { pickActivePlan } from './pickActivePlan';

// "Where am I as a trader" — a deterministic development assessment.
//
// Six dimensions are scored 0–100 from the user's own journal (closed trades
// across every journal, the active trading plan, the morning/evening mental
// journals). Each score is a weighted blend of a few explainable components,
// and every component that drives a number also writes the sentence that
// justifies it (evidence). The stage on the development ladder is NOT an
// average of the scores: it is the highest stage whose entry gates are all
// met, cumulatively — so "why am I not at the next stage" always has a
// concrete, checkable answer (nextMilestones).
//
// Pure: no React, no Firebase, no clock unless `now` is omitted.

export const MIN_CLOSED_TRADES = 10;

const DAY_MS = 86_400_000;

export const STAGES = [
  {
    id: 'foundation',
    name: 'בונה בסיס',
    description: 'לומד את הכלים, מתעד את העסקאות הראשונות ובונה הרגל של רישום. בשלב הזה המטרה היא נתונים אמינים, לא רווח.',
    focus: 'תיעוד מלא של כל עסקה, כולל סטופ וסיבת כניסה',
    // Entry gates in words. The measured version is stageGates() below, and a
    // test keeps the two the same length.
    requirements: ['נקודת ההתחלה של כל סוחר'],
  },
  {
    id: 'experience',
    name: 'צובר ניסיון',
    description: 'יש כבר נפח מסחר מתועד לאורך כמה שבועות. עכשיו צריך להפוך ניסיון לכללים: מה סוחרים, מתי, ואיך יוצאים.',
    focus: 'כתיבת תוכנית מסחר וסטופ מוגדר בכל עסקה',
    requirements: ['20 עסקאות סגורות מתועדות', '4 שבועות מסחר מתועדים'],
  },
  {
    id: 'method',
    name: 'מגבש שיטה',
    description: 'יש תוכנית כתובה ורוב העסקאות מוגדרות סיכון. האתגר: שהסיכון יהיה קבוע וצפוי, בלי הפסדים חריגים.',
    focus: 'סיכון קבוע לעסקה ואפס הפסדים מעבר לסטופ',
    requirements: ['50 עסקאות סגורות מתועדות', 'תוכנית מסחר פעילה', 'סטופ מוגדר ב-60% מהעסקאות'],
  },
  {
    id: 'risk',
    name: 'מנהל סיכון',
    description: 'הסיכון בשליטה: סטופ כמעט תמיד והפסדים בגודל המתוכנן. עכשיו בונים עקביות לאורך חודשים ועמידה בתוכנית.',
    focus: 'חודשים רווחיים ברצף, ירידות מוגבלות ועמידה בכללים',
    requirements: ['סטופ מוגדר ב-85% מהעסקאות', 'עד 10% מההפסדים חורגים מ-1.5R', 'ציון משמעת סיכון 65+'],
  },
  {
    id: 'consistent',
    name: 'עקבי',
    description: 'תוצאות יציבות לאורך זמן, עמידה בתוכנית ומודעות למצב המנטלי. נשאר להוכיח יתרון סטטיסטי על מדגם גדול.',
    focus: 'תוחלת חיובית מוכחת על מאות עסקאות',
    requirements: ['150 עסקאות סגורות מתועדות', 'ציון עקביות 65+', 'ציון עמידה בתוכנית 60+', 'ציון מודעות עצמית 50+'],
  },
  {
    id: 'professional',
    name: 'מקצוען',
    description: 'יתרון מוכח על מדגם גדול, סיכון מנוהל ועקביות לאורך זמן. המשימה: לשמר את התהליך ולהגדיל בזהירות.',
    focus: 'שימור התהליך, הגדלה מבוקרת ומניעת שחיקה',
    requirements: ['250 עסקאות סגורות מתועדות', 'ציון יתרון סטטיסטי 70+', 'ציון עקביות 75+', 'ציון משמעת סיכון 80+'],
  },
];

export const DIMENSION_LABELS = {
  experience: 'ניסיון',
  risk: 'משמעת סיכון',
  consistency: 'עקביות',
  plan: 'עמידה בתוכנית',
  psychology: 'מודעות עצמית',
  edge: 'יתרון סטטיסטי',
};

// ── small helpers ─────────────────────────────────────────────────────────
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const round = (v) => Math.round(v);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const signed = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const usd = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function ms(d) {
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d;
  if (typeof d === 'object' && typeof d.seconds === 'number') return d.seconds * 1000;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// The close moment of a trade — the app's canonical "exitDate || entryDate".
const closeMs = (t) => ms(t.exitDate) || ms(t.entryDate) || ms(t.createdAt);

// Local week bucket (weeks start on Sunday, the Israeli trading week).
function weekKey(at) {
  const d = new Date(at);
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
}

const heDate = (key) => (key ? key.split('-').reverse().join('/') : '');

// Weighted blend of 0..1 components. A component whose value is null is not
// measurable and drops out of the weights entirely; a component that should
// count as "neutral, unknown" passes 0.5 explicitly.
function blend(components) {
  const live = components.filter((c) => c.v !== null && c.v !== undefined);
  const w = live.reduce((s, c) => s + c.w, 0);
  if (!w) return null;
  return round((live.reduce((s, c) => s + c.w * clamp01(c.v), 0) / w) * 100);
}

// The tip of the weakest measured component.
function weakestTip(components, fallback) {
  const live = components.filter((c) => c.v !== null && c.v !== undefined && c.tip);
  if (!live.length) return fallback;
  const worst = [...live].sort((a, b) => clamp01(a.v) - clamp01(b.v))[0];
  return clamp01(worst.v) >= 0.85 ? fallback : worst.tip;
}

function maxLossStreak(trades) {
  let cur = 0;
  let best = 0;
  for (const t of trades) {
    if (safePnl(t) < 0) {
      cur += 1;
      if (cur > best) best = cur;
    } else if (safePnl(t) > 0) {
      cur = 0;
    }
  }
  return best;
}

function maxDrawdownOf(values) {
  let equity = 0;
  let peak = 0;
  let dd = 0;
  for (const v of values) {
    equity += v;
    if (equity > peak) peak = equity;
    if (peak - equity > dd) dd = peak - equity;
  }
  return dd;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── metrics shared by the dimensions ─────────────────────────────────────
function buildMetrics({ trades, plans, morningEntries, eveningEntries, journals, now }) {
  const journalList = Array.isArray(journals) ? journals : [];
  const journalById = new Map(journalList.map((j) => [j.id, j]));
  // Same scope as the dashboard: trades of journals that still exist, plus
  // legacy trades saved before journals had ids. With no journal list at all
  // (not loaded / not passed) every trade counts.
  const scoped = (trades || []).filter((t) => !journalList.length || !t.journalId || journalById.has(t.journalId));
  const closed = scoped
    .filter(isClosedTrade)
    .map((t) => ({ t, at: closeMs(t) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.t);
  const n = closed.length;

  const weeks = new Set();
  for (const t of closed) {
    const at = closeMs(t);
    if (at) weeks.add(weekKey(at));
  }
  const firstAt = closed.length ? closeMs(closed[0]) : 0;

  const withRisk = closed.filter((t) => initialRiskUsd(t) > 0);
  const rs = closed.map(tradeRMultiple).filter((r) => r !== null && Number.isFinite(r));

  const plan = pickActivePlan(plans);

  const nowMs = now.getTime();
  const since = (days) => localDayKey(new Date(nowMs - (days - 1) * DAY_MS));
  return {
    closed, n, weeks: weeks.size, firstAt, withRisk, rs, plan, journalById,
    morning: morningEntries || [], evening: eveningEntries || [], now, nowMs, since,
  };
}

// ── dimensions ────────────────────────────────────────────────────────────
function scoreExperience(m) {
  const tradesV = clamp01(m.n / 150);
  const weeksV = clamp01(m.weeks / 26);
  const components = [
    { w: 60, v: tradesV, tip: m.n < 50
      ? 'היעד הקרוב: 50 עסקאות מתועדות. כל עסקה, גם קטנה, נכנסת ליומן עם סטופ וסיבת כניסה.'
      : 'המשך לתעד כל עסקה. מדגם של 150+ עסקאות הוא הבסיס לכל מסקנה סטטיסטית.' },
    { w: 40, v: weeksV, tip: 'סחור ותעד באופן קבוע לאורך שבועות רבים. ניסיון שמפוזר בזמן שווה יותר מנפח גדול בשבוע אחד.' },
  ];
  const evidence = [];
  evidence.push(m.n ? `${m.n} עסקאות סגורות מתועדות` : 'עדיין אין עסקאות סגורות ביומן');
  if (m.n) evidence.push(`פעילות מתועדת ב-${m.weeks} שבועות שונים`);
  if (m.firstAt) evidence.push(`מתעד מאז ${heDate(localDayKey(new Date(m.firstAt)))}`);
  return {
    score: blend(components),
    evidence,
    tip: weakestTip(components, 'הניסיון קיים. המיקוד עובר לאיכות: פחות עסקאות, יותר סלקטיביות.'),
    metrics: { closedTrades: m.n, activeWeeks: m.weeks },
  };
}

function riskLimitUsd(journal) {
  const value = Number(journal?.riskValue) || 0;
  if (!(value > 0)) return null;
  if (journal.riskType === 'fixed') return value;
  const balance = Number(journal.initialBalance) || 0;
  return balance > 0 ? (balance * value) / 100 : null;
}

function scoreRisk(m) {
  const stopRate = m.n ? m.withRisk.length / m.n : 0;
  const rLosses = m.rs.filter((r) => r < 0);
  const oversized = rLosses.filter((r) => r < -1.5).length;
  const oversizedMeasurable = rLosses.length >= 3;
  const oversizedRate = oversizedMeasurable ? oversized / rLosses.length : null;

  // Without R (no stops), fall back to the dollar shape of the losses: one loss
  // many times the typical one is the classic "let it run" blow-up.
  const usdLosses = m.closed.map(safePnl).filter((p) => p < 0).map(Math.abs);
  const worstToMedian = usdLosses.length >= 3 && median(usdLosses) > 0 ? Math.max(...usdLosses) / median(usdLosses) : null;

  let measuredLimit = 0;
  let withinLimit = 0;
  for (const t of m.closed) {
    const limit = riskLimitUsd(m.journalById.get(t.journalId));
    const risk = initialRiskUsd(t);
    if (limit == null || !(risk > 0)) continue;
    measuredLimit += 1;
    if (risk <= limit * 1.1) withinLimit += 1;
  }

  let oversizedV;
  if (oversizedMeasurable) oversizedV = 1 - clamp01(oversizedRate / 0.2);
  else if (worstToMedian != null) oversizedV = 1 - clamp01((worstToMedian - 2) / 4);
  else oversizedV = 0.5;

  const components = [
    { w: 45, v: stopRate, tip: 'הגדר סטופ לפני כל כניסה ושמור אותו בטופס העסקה. בלי סטופ אי אפשר למדוד סיכון או R.' },
    { w: 35, v: oversizedV, tip: 'הפסדים גדולים מהסיכון המתוכנן מעידים על הזזת סטופ או פוזיציה גדולה מדי. כבד את הסטופ המקורי, בלי חריגות.' },
    { w: 20, v: measuredLimit >= 5 ? withinLimit / measuredLimit : 0.5, tip: 'הגדר ביומן מגבלת סיכון לעסקה (אחוז מהתיק או סכום קבוע), ושמור על כל עסקה בתוכה.' },
  ];

  const evidence = [`סטופ מוגדר ב-${pct(m.withRisk.length, m.n)}% מהעסקאות (${m.withRisk.length}/${m.n})`];
  if (oversizedMeasurable) {
    evidence.push(oversized
      ? `${oversized} מתוך ${rLosses.length} הפסדים חרגו מ-1.5R (${pct(oversized, rLosses.length)}%)`
      : `אף אחד מ-${rLosses.length} ההפסדים לא חרג מ-1.5R`);
  } else if (worstToMedian != null) {
    evidence.push(`ההפסד הגדול ביותר גדול פי ${worstToMedian.toFixed(1)} מההפסד החציוני`);
  }
  if (measuredLimit >= 5) evidence.push(`${pct(withinLimit, measuredLimit)}% מהעסקאות בתוך מגבלת הסיכון של היומן`);
  else evidence.push('לא הוגדרה ביומן מגבלת סיכון לעסקה שאפשר למדוד מולה');

  return {
    score: blend(components),
    evidence,
    tip: weakestTip(components, 'ניהול הסיכון חזק. שמור על אותו גודל סיכון גם אחרי רצף רווחים.'),
    metrics: {
      stopRatePct: pct(m.withRisk.length, m.n),
      oversizedLossPct: oversizedRate == null ? null : round(oversizedRate * 100),
      riskLimitCompliancePct: measuredLimit >= 5 ? pct(withinLimit, measuredLimit) : null,
    },
  };
}

function scoreConsistency(m) {
  const months = new Map();
  for (const t of m.closed) {
    const at = closeMs(t);
    if (!at) continue;
    const key = localDayKey(new Date(at)).slice(0, 7);
    const cur = months.get(key) || { pnl: 0, n: 0 };
    cur.pnl += safePnl(t);
    cur.n += 1;
    months.set(key, cur);
  }
  const measured = [...months.values()].filter((v) => v.n >= 3);
  const profitable = measured.filter((v) => v.pnl > 0).length;

  const rTrades = m.closed.filter((t) => tradeRMultiple(t) !== null);
  const useR = rTrades.length >= 10;
  let ddV;
  let ddText;
  let ddR = null;
  if (useR) {
    ddR = maxDrawdownOf(rTrades.map(tradeRMultiple));
    ddV = 1 - clamp01((ddR - 5) / 15);
    ddText = `ירידה מקסימלית מהשיא: ${ddR.toFixed(1)}R`;
  } else {
    const pnls = m.closed.map(safePnl);
    const avgAbs = mean(pnls.map(Math.abs));
    const ddUnits = avgAbs > 0 ? maxDrawdownOf(pnls) / avgAbs : 0;
    ddV = 1 - clamp01((ddUnits - 8) / 22);
    ddText = `ירידה מקסימלית מהשיא: ${usd(maxDrawdownOf(pnls))} (≈ ${ddUnits.toFixed(1)} עסקאות ממוצעות)`;
  }
  const streak = maxLossStreak(m.closed);

  const components = [
    { w: 35, v: measured.length >= 2 ? profitable / measured.length : 0.5, tip: 'בנה חודשים רווחיים ברצף: הגדר תקרת הפסד חודשית ועצור כשהיא נחצית.' },
    { w: 35, v: ddV, tip: 'הירידות מהשיא עמוקות מדי. קבע עצירה אחרי X הפסדים ביום/בשבוע והקטן סיכון בזמן ירידה.' },
    { w: 30, v: 1 - clamp01((streak - 3) / 6), tip: `רצף של ${streak} הפסדים מעיד על מסחר מתוך תסכול. כלל: אחרי 3 הפסדים ברצף, הפסקה עד מחר.` },
  ];
  const evidence = [];
  evidence.push(measured.length >= 2
    ? `${profitable} מתוך ${measured.length} חודשים רווחיים`
    : 'עדיין אין שני חודשים עם 3+ עסקאות להשוואה');
  evidence.push(ddText);
  evidence.push(`רצף ההפסדים הארוך ביותר: ${streak}`);
  return {
    score: blend(components),
    evidence,
    tip: weakestTip(components, 'העקביות טובה. המשך למדוד חודש מול חודש ואל תשנה שיטה אחרי חודש חלש אחד.'),
    metrics: { measuredMonths: measured.length, profitableMonths: profitable, maxDrawdownR: ddR == null ? null : Math.round(ddR * 10) / 10, maxLossStreak: streak },
  };
}

const PLAN_RULE_FIELDS = [
  (p) => Array.isArray(p.pairs) && p.pairs.length > 0,
  (p) => Array.isArray(p.timeframes) && p.timeframes.length > 0,
  (p) => Array.isArray(p.sessions) && p.sessions.length > 0,
  (p) => Number(p.maxDailyLoss) > 0,
  (p) => Number(p.maxPositions) > 0,
  (p) => String(p.entryRules || '').trim().length > 0,
  (p) => String(p.exitRules || '').trim().length > 0,
  (p) => String(p.riskManagement || '').trim().length > 0,
];

function scorePlan(m) {
  const { plan } = m;
  const rules = plan ? PLAN_RULE_FIELDS.filter((f) => f(plan)).length : 0;

  let audit = null;
  try {
    audit = plan && m.closed.length ? auditPlan(plan, m.closed) : null;
  } catch {
    audit = null;
  }
  const on = audit?.compliance?.onPlan?.trades || 0;
  const off = audit?.compliance?.offPlan?.trades || 0;
  const complianceMeasured = on + off >= 5;

  const from = m.since(90);
  const followed = m.evening.filter((e) => e?.date >= from && typeof e.followedPlan === 'boolean');
  const followedYes = followed.filter((e) => e.followedPlan).length;

  // checklistAdherence is null on trades not linked to a plan — Number(null)
  // would read as a 0% checklist, so only real numbers count.
  const checklist = m.closed
    .map((t) => t.checklistAdherence)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  const checklistAvg = checklist.length ? mean(checklist) : null;

  const components = [
    { w: 25, v: plan ? 0.5 + 0.5 * clamp01(rules / 5) : 0, tip: plan
      ? 'השלם בתוכנית כללים מדידים: מטבעות, טיימפריימים, סשנים, הפסד יומי מקסימלי ומספר פוזיציות.'
      : 'כתוב תוכנית מסחר: מה סוחרים, באילו שעות, כללי כניסה ויציאה ותקרת הפסד יומית.' },
    { w: 35, v: complianceMeasured ? on / (on + off) : (plan ? 0.5 : 0), tip: 'חלק מהעסקאות נפתחו מחוץ לכללי התוכנית. לפני כל כניסה: האם המטבע, הטיימפריים והסשן ברשימה?' },
    { w: 25, v: followed.length >= 5 ? followedYes / followed.length : (plan ? 0.5 : 0), tip: 'ענה ביומן הערב בכנות על "עקבתי אחרי התוכנית" ובדוק את המגמה פעם בשבוע.' },
    { w: 15, v: checklist.length >= 5 ? checklistAvg / 100 : (plan ? 0.5 : 0), tip: 'קשר כל עסקה לתוכנית ומלא את הצ\'קליסט לפני הכניסה, לא אחריה.' },
  ];

  const evidence = [];
  if (plan) evidence.push(`תוכנית פעילה: "${plan.name || 'ללא שם'}" עם ${rules} מתוך ${PLAN_RULE_FIELDS.length} כללים מוגדרים`);
  else evidence.push('אין תוכנית מסחר פעילה');
  if (complianceMeasured) evidence.push(`${pct(on, on + off)}% מהעסקאות שנבדקו עמדו בכללי התוכנית (${on}/${on + off})`);
  if (followed.length >= 5) evidence.push(`ביומן הערב: עקבת אחרי התוכנית ב-${followedYes} מתוך ${followed.length} ימים (90 יום)`);
  else evidence.push('פחות מ-5 יומני ערב עם תשובה על עמידה בתוכנית ב-90 הימים האחרונים');
  if (checklist.length >= 5) evidence.push(`עמידה ממוצעת בצ'קליסט לפני כניסה: ${round(checklistAvg)}%`);

  return {
    score: blend(components),
    evidence,
    tip: weakestTip(components, 'העמידה בתוכנית גבוהה. בדוק פעם בחודש אם הכללים עדיין מתאימים לשוק.'),
    metrics: {
      hasPlan: !!plan,
      planRules: rules,
      planCompliancePct: complianceMeasured ? pct(on, on + off) : null,
      followedPlanPct: followed.length >= 5 ? pct(followedYes, followed.length) : null,
    },
  };
}

function scorePsychology(m) {
  const from30 = m.since(30);
  const days30 = new Set(
    [...m.morning, ...m.evening].map((e) => e?.date).filter((d) => d && d >= from30),
  );
  const reflections = m.evening.filter((e) => String(e?.lessonsLearned || '').trim().length > 0).length;
  const tagged = m.closed.filter((t) => t.emotionBefore || t.emotionAfter || (Array.isArray(t.mistakes) && t.mistakes.length)).length;

  // Days with a morning journal AND a closed trade: the raw material for
  // linking mood to results.
  const morningByDate = new Map(m.morning.filter((e) => e?.date).map((e) => [e.date, e]));
  const tradesByDay = new Map();
  for (const t of m.closed) {
    const key = localDayKey(new Date(closeMs(t)));
    if (!key) continue;
    if (!tradesByDay.has(key)) tradesByDay.set(key, []);
    tradesByDay.get(key).push(t);
  }
  const crossDays = [...tradesByDay.keys()].filter((d) => morningByDate.has(d));
  const high = [];
  const low = [];
  for (const d of crossDays) {
    const ready = Number(morningByDate.get(d).readinessLevel) || 0;
    const target = ready >= 7 ? high : ready > 0 && ready <= 5 ? low : null;
    if (target) target.push(...tradesByDay.get(d).map(safePnl));
  }

  const components = [
    { w: 35, v: clamp01(days30.size / 20), tip: 'מלא יומן בוקר או ערב בכל יום מסחר. 20 ימים מתועדים בחודש הם הבסיס למודעות אמיתית.' },
    { w: 15, v: m.evening.length >= 3 ? reflections / m.evening.length : 0, tip: 'כתוב בכל יומן ערב לקח אחד קונקרטי מהיום, גם ביום טוב.' },
    { w: 20, v: m.n ? tagged / m.n : null, tip: 'תייג בכל עסקה רגש לפני/אחרי וטעויות. בלי תיוג אי אפשר לזהות דפוסים.' },
    { w: 30, v: m.n ? clamp01(crossDays.length / 15) : null, tip: 'מלא יומן בוקר דווקא בימים שבהם אתה סוחר, כדי לקשר בין מצב הראש לתוצאות.' },
  ];

  const evidence = [`${days30.size} ימים מתועדים ביומן ב-30 הימים האחרונים`];
  if (m.evening.length >= 3) evidence.push(`${pct(reflections, m.evening.length)}% מיומני הערב כוללים לקח כתוב`);
  if (m.n) evidence.push(`${pct(tagged, m.n)}% מהעסקאות מתויגות ברגש או בטעות`);
  if (m.n) evidence.push(`${crossDays.length} ימים עם יומן בוקר וגם עסקה סגורה`);
  if (high.length >= 3 && low.length >= 3) {
    evidence.push(`ממוצע לעסקה בימי מוכנות 7+: ${usd(mean(high))}, בימי מוכנות 5 ומטה: ${usd(mean(low))}`);
  }
  return {
    score: blend(components),
    evidence,
    tip: weakestTip(components, 'המודעות העצמית גבוהה. השתמש בה: הגדר מראש באילו מצבים אתה לא סוחר.'),
    metrics: { journaledDays30: days30.size, crossDays: crossDays.length },
  };
}

function scoreEdge(m) {
  const expR = m.rs.length >= 15 ? mean(m.rs) : null;
  const pf = calculateProfitFactor(m.closed);
  const wins = m.closed.filter((t) => safePnl(t) > 0).length;
  const losses = m.closed.filter((t) => safePnl(t) < 0).length;
  const wr = round(winRateOf(wins, losses));

  const rawR = expR == null ? null
    : expR <= -0.2 ? 0
      : expR <= 0 ? 0.3 * ((expR + 0.2) / 0.2)
        : 0.3 + 0.7 * clamp01(expR / 0.3);
  const rawPF = !Number.isFinite(pf) ? (pf > 0 ? 1 : null)
    : pf <= 0.8 ? 0
      : pf <= 1 ? 0.3 * ((pf - 0.8) / 0.2)
        : 0.3 + 0.7 * clamp01((pf - 1) / 0.8);
  const parts = [rawR, rawPF].filter((v) => v !== null);
  const raw = parts.length ? mean(parts) : 0;
  // Sample-size guard: a good-looking edge over 20 trades is mostly noise.
  // Full credit only from 100 closed trades.
  const confidence = clamp01((m.n - 10) / 90);
  const score = round(raw * (0.4 + 0.6 * confidence) * 100);

  const evidence = [];
  if (expR != null) evidence.push(`תוחלת ${signed(expR)}R לעסקה (${m.rs.length} עסקאות עם סטופ)`);
  else evidence.push('פחות מ-15 עסקאות עם סטופ: אי אפשר למדוד תוחלת ב-R');
  evidence.push(`Profit Factor ${Number.isFinite(pf) ? pf.toFixed(2) : '∞'} · אחוז הצלחה ${wr}%`);
  if (m.n < 100) evidence.push(`מדגם של ${m.n} עסקאות: הציון מוגבל עד שיצטברו 100`);

  let tip;
  if ((expR != null && expR < 0) || (Number.isFinite(pf) && pf < 1)) {
    tip = 'התוחלת שלילית. צמצם לסטאפ אחד שהכי עובד לך (לפי היומן) וסחור רק אותו ב-30 העסקאות הבאות.';
  } else if (m.n < 100) {
    tip = 'הכיוון חיובי אבל המדגם קטן. המשך באותה שיטה בלי לשנות כללים עד 100 עסקאות, ואז תמדוד שוב.';
  } else if (score < 70) {
    tip = 'היתרון דק. בדוק ביומן אילו סשנים/מטבעות מורידים את התוחלת והוצא אותם מהתוכנית.';
  } else {
    tip = 'יש יתרון מוכח. הגדל סיכון רק בהדרגה ורק אחרי חודש רווחי נוסף.';
  }
  return {
    score,
    evidence,
    tip,
    metrics: { expectancyR: expR == null ? null : Math.round(expR * 100) / 100, profitFactor: Number.isFinite(pf) ? Math.round(pf * 100) / 100 : null, winRate: wr },
  };
}

// ── stage gates ──────────────────────────────────────────────────────────
// Requirements to ENTER each stage (index 1..5 → stages 2..6). Cumulative:
// a stage counts only when every earlier stage's gates are met too.
export function stageGates(metrics, scores) {
  const g = (id, label, current, target, extra = {}) => ({ id, label, current, target, ...extra });
  return [
    [
      g('trades20', 'עסקאות סגורות מתועדות', metrics.closedTrades, 20),
      g('weeks4', 'שבועות מסחר מתועדים', metrics.activeWeeks, 4),
    ],
    [
      g('trades50', 'עסקאות סגורות מתועדות', metrics.closedTrades, 50),
      g('plan', 'תוכנית מסחר פעילה', metrics.hasPlan ? 1 : 0, 1, { kind: 'bool' }),
      g('stop60', 'עסקאות עם סטופ מוגדר', metrics.stopRatePct, 60, { unit: '%' }),
    ],
    [
      g('stop85', 'עסקאות עם סטופ מוגדר', metrics.stopRatePct, 85, { unit: '%' }),
      g('oversized10', 'הפסדים שחרגו מ-1.5R', metrics.oversizedLossPct, 10, { unit: '%', lower: true }),
      g('risk65', 'ציון משמעת סיכון', scores.risk, 65),
    ],
    [
      g('trades150', 'עסקאות סגורות מתועדות', metrics.closedTrades, 150),
      g('consistency65', 'ציון עקביות', scores.consistency, 65),
      g('plan60', 'ציון עמידה בתוכנית', scores.plan, 60),
      g('psychology50', 'ציון מודעות עצמית', scores.psychology, 50),
    ],
    [
      g('trades250', 'עסקאות סגורות מתועדות', metrics.closedTrades, 250),
      g('edge70', 'ציון יתרון סטטיסטי', scores.edge, 70),
      g('consistency75', 'ציון עקביות', scores.consistency, 75),
      g('risk80', 'ציון משמעת סיכון', scores.risk, 80),
    ],
  ];
}

function gateProgress(gate) {
  if (gate.current == null) return 0;
  if (gate.lower) {
    if (gate.current <= gate.target) return 1;
    return clamp01(gate.target / gate.current);
  }
  return gate.target > 0 ? clamp01(gate.current / gate.target) : 1;
}

const withDone = (gate) => {
  const progress = gateProgress(gate);
  return { ...gate, progress: round(progress * 100), done: progress >= 1 };
};

// ── public API ───────────────────────────────────────────────────────────
export function assessTrader({ trades = [], plans = [], morningEntries = [], eveningEntries = [], journals = [], now = new Date() } = {}) {
  const m = buildMetrics({ trades, plans, morningEntries, eveningEntries, journals, now });
  const insufficient = m.n < MIN_CLOSED_TRADES;

  const raw = {
    experience: scoreExperience(m),
    risk: scoreRisk(m),
    consistency: scoreConsistency(m),
    plan: scorePlan(m),
    psychology: scorePsychology(m),
    edge: scoreEdge(m),
  };
  // Trade-outcome dimensions need a minimum sample; below it they are shown
  // as "not enough data" instead of a misleading number.
  const tradeBased = ['risk', 'consistency', 'edge'];
  const dimensions = Object.entries(raw).map(([id, d]) => {
    const thin = insufficient && tradeBased.includes(id);
    return {
      id,
      label: DIMENSION_LABELS[id],
      score: thin ? null : d.score,
      evidence: thin ? [`צריך לפחות ${MIN_CLOSED_TRADES} עסקאות סגורות (כרגע ${m.n})`] : d.evidence,
      tip: thin ? `תעד עוד ${MIN_CLOSED_TRADES - m.n} עסקאות סגורות עם סטופ כדי לפתוח את המדד הזה.` : d.tip,
    };
  });
  const scores = Object.fromEntries(dimensions.map((d) => [d.id, d.score]));

  const metrics = {
    ...raw.experience.metrics, ...raw.risk.metrics, ...raw.consistency.metrics,
    ...raw.plan.metrics, ...raw.psychology.metrics, ...raw.edge.metrics,
  };

  const gates = stageGates(metrics, scores).map((list) => list.map(withDone));
  let stageIdx = 0; // 0-based
  for (let i = 0; i < gates.length; i++) {
    if (insufficient || !gates[i].every((x) => x.done)) break;
    stageIdx = i + 1;
  }
  const nextGates = stageIdx < gates.length ? gates[stageIdx] : [];
  const stageProgress = nextGates.length ? round(mean(nextGates.map((x) => x.progress))) : 100;

  const scored = dimensions.filter((d) => d.score != null);
  const overall = scored.length ? round(mean(scored.map((d) => d.score))) : null;

  const strengths = scored
    .filter((d) => d.score >= 70)
    .sort((a, b) => b.score - a.score)
    .map((d) => `${d.label} (${d.score}): ${d.evidence[0]}`);

  const blockers = [
    ...nextGates.filter((x) => !x.done).map((x) => `${x.label}: ${formatGateValue(x)} מתוך ${formatGateTarget(x)}`),
    ...scored.filter((d) => d.score < 40).sort((a, b) => a.score - b.score).map((d) => `${d.label} נמוך (${d.score}): ${d.evidence[0]}`),
  ];

  const dataNeeded = insufficient ? [
    `תעד לפחות ${MIN_CLOSED_TRADES} עסקאות סגורות (כרגע ${m.n}) כדי לקבל הערכה מלאה`,
    ...(m.n && metrics.stopRatePct >= 90 ? [] : ['הגדר סטופ בכל עסקה, כדי שאפשר יהיה למדוד סיכון ו-R']),
    ...(m.plan ? [] : ['כתוב תוכנית מסחר פעילה בעמוד התוכניות']),
    ...(metrics.journaledDays30 >= 5 ? [] : ['מלא יומן בוקר וערב בימי מסחר']),
  ] : [];

  return {
    insufficient,
    closedTrades: m.n,
    stage: { index: stageIdx + 1, of: STAGES.length, ...STAGES[stageIdx] },
    nextStage: stageIdx + 1 < STAGES.length ? { index: stageIdx + 2, ...STAGES[stageIdx + 1] } : null,
    stageProgress,
    overall,
    dimensions,
    strengths,
    blockers,
    nextMilestones: nextGates,
    dataNeeded,
    metrics,
  };
}

export function formatGateValue(g) {
  if (g.kind === 'bool') return g.current ? 'קיים' : 'חסר';
  if (g.current == null) return 'לא נמדד';
  return `${g.current}${g.unit || ''}`;
}

export function formatGateTarget(g) {
  if (g.kind === 'bool') return 'נדרש';
  return `${g.lower ? '≤ ' : ''}${g.target}${g.unit || ''}`;
}

// The compact, model-facing summary: scores, evidence sentences, the stage and
// the gates — never the raw trade list.
export function buildAiSummary(a) {
  return {
    request: 'מפת התפתחות סוחר. כתוב ניתוח אישי קצר על בסיס developmentAssessment בלבד. '
      + 'תחת "חוזקות": איפה הסוחר עומד היום בסולם ההתפתחות ולמה (2–3 בולטים). '
      + 'תחת "חולשות": מה בדיוק מעכב אותו מלעלות לשלב הבא, לפי nextMilestones ו-blockers (2–3 בולטים). '
      + 'תחת "המלצות לפעולה": הבולט הראשון הוא הצעד החשוב ביותר הבא, אחד בלבד וקונקרטי; אחריו לכל היותר 2 צעדים משלימים. '
      + 'כל המספרים כבר חושבו — אסור לחשב מחדש או להמציא מספר.',
    developmentAssessment: {
      stage: `${a.stage.index}/${a.stage.of} ${a.stage.name}`,
      nextStage: a.nextStage ? a.nextStage.name : null,
      progressToNextPct: a.stageProgress,
      overallScore: a.overall,
      closedTrades: a.closedTrades,
      insufficientData: a.insufficient,
      dimensions: a.dimensions.map((d) => ({ name: d.label, score: d.score, evidence: d.evidence })),
      strengths: a.strengths,
      blockers: a.blockers,
      nextMilestones: a.nextMilestones.map((g) => ({
        goal: g.label, current: formatGateValue(g), target: formatGateTarget(g), done: g.done,
      })),
    },
  };
}
