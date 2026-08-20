import { MISTAKE_LABELS } from './constants';
import { isClosedTrade, localDayKey } from './calculations';

// A rule needs at least this many trades on the offending side before we let it
// become a finding. Below it the rule still ships, marked thin.
export const AUDIT_MIN_SAMPLE = 5;

const r2 = (v) => Math.round(v * 100) / 100;
const usdAbs = (v) => `$${Math.abs(r2(v)).toFixed(2)}`;
const pnlOf = (t) => Number(t.netPnl ?? t.pnl ?? 0) || 0;
const norm = (v) => String(v ?? '').trim().toLowerCase();

function ms(d) {
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  if (typeof d === 'number') return d;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function summary(trades) {
  const n = trades.length;
  const pnl = trades.reduce((s, t) => s + pnlOf(t), 0);
  const wins = trades.filter((t) => pnlOf(t) > 0).length;
  return {
    trades: n,
    pnl: r2(pnl),
    avgPnl: n ? r2(pnl / n) : 0,
    winRate: n ? Math.round((wins / n) * 100) : 0,
    thin: n < AUDIT_MIN_SAMPLE,
  };
}

// One "allowed values" rule (pairs / timeframes / sessions). A trade with no
// value for the field is not counted as a breach — a missing field is missing
// data, not evidence of indiscipline.
function allowListRule({ key, label, allowed, trades, valueOf }) {
  const set = new Set(allowed.map(norm));
  const inside = [];
  const outside = [];
  const offValues = new Map();
  for (const t of trades) {
    const v = valueOf(t);
    if (!v) continue;
    if (set.has(norm(v))) {
      inside.push(t);
    } else {
      outside.push(t);
      const cur = offValues.get(v) || { trades: 0, pnl: 0 };
      cur.trades += 1;
      cur.pnl += pnlOf(t);
      offValues.set(v, cur);
    }
  }
  return {
    key,
    label,
    allowed,
    onPlan: summary(inside),
    offPlan: summary(outside),
    offPlanValues: [...offValues.entries()]
      .map(([value, v]) => ({ value, trades: v.trades, pnl: r2(v.pnl) }))
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 5),
    _offTrades: outside,
  };
}

// True concurrency, not "trades opened the same day" — a position held across
// three days occupies a slot on all three. Sweep line over open/close events.
function maxConcurrent(trades) {
  const events = [];
  for (const t of trades) {
    const start = ms(t.entryDate) || ms(t.createdAt);
    if (!start) continue;
    const end = Math.max(ms(t.exitDate) || start, start + 1);
    events.push({ at: start, delta: 1 }, { at: end, delta: -1 });
  }
  // Closes are processed before opens at the same instant, so back-to-back
  // trades don't read as overlapping.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let open = 0;
  let peak = 0;
  let peakAt = 0;
  for (const e of events) {
    open += e.delta;
    if (open > peak) {
      peak = open;
      peakAt = e.at;
    }
  }
  return { peak, peakAt };
}

// Cross-references the active trading plan against what actually happened.
// Every rule is either measured or explicitly listed as not measurable — a rule
// the user wrote must never silently disappear from the audit.
export function auditPlan(plan, allTrades, { accountBalance = 0 } = {}) {
  if (!plan) return null;
  const trades = (allTrades || []).filter(isClosedTrade);
  if (!trades.length) return null;

  const rules = [];
  const notMeasurable = [];

  const specs = [
    { key: 'pairs', label: 'מטבעות מותרים', allowed: plan.pairs, valueOf: (t) => t.pair || t.symbol },
    { key: 'timeframes', label: 'טיימפריימים מותרים', allowed: plan.timeframes, valueOf: (t) => t.timeframe },
    { key: 'sessions', label: 'סשנים מותרים', allowed: plan.sessions, valueOf: (t) => t.session },
  ];
  for (const s of specs) {
    if (!Array.isArray(s.allowed) || !s.allowed.length) {
      notMeasurable.push({ rule: s.label, reason: 'לא הוגדר בתוכנית' });
      continue;
    }
    const rule = allowListRule({ ...s, trades });
    if (!rule.onPlan.trades && !rule.offPlan.trades) {
      notMeasurable.push({ rule: s.label, reason: 'אין עסקאות עם השדה הזה מלא' });
      continue;
    }
    rules.push(rule);
  }

  // Max concurrent positions.
  const maxPositions = Number(plan.maxPositions) || 0;
  let positions = null;
  if (!maxPositions) {
    notMeasurable.push({ rule: 'מקסימום פוזיציות', reason: 'לא הוגדר בתוכנית' });
  } else {
    const { peak, peakAt } = maxConcurrent(trades);
    positions = {
      limit: maxPositions,
      peakConcurrent: peak,
      peakDate: peakAt ? localDayKey(new Date(peakAt)) : null,
      breached: peak > maxPositions,
      basis: 'חפיפה אמיתית בין זמן כניסה לזמן יציאה',
    };
  }

  // Max daily loss, expressed in the plan as a percentage of the account.
  const maxDailyLoss = Number(plan.maxDailyLoss) || 0;
  let dailyLoss = null;
  if (!maxDailyLoss) {
    notMeasurable.push({ rule: 'הפסד יומי מקסימלי', reason: 'לא הוגדר בתוכנית' });
  } else if (!(accountBalance > 0)) {
    notMeasurable.push({
      rule: 'הפסד יומי מקסימלי',
      reason: 'התוכנית מגדירה אחוז מהחשבון, אבל ליומן הפעיל אין יתרת פתיחה — אין במה להכפיל',
    });
  } else {
    const byDay = new Map();
    for (const t of trades) {
      const day = localDayKey(t.exitDate || t.entryDate);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) || 0) + pnlOf(t));
    }
    const limitUsd = (accountBalance * maxDailyLoss) / 100;
    const breaches = [...byDay.entries()]
      .filter(([, pnl]) => pnl < 0 && Math.abs(pnl) > limitUsd)
      .map(([date, pnl]) => ({ date, pnl: r2(pnl), pctOfAccount: r2((Math.abs(pnl) / accountBalance) * 100) }))
      .sort((a, b) => a.pnl - b.pnl);
    dailyLoss = {
      limitPct: maxDailyLoss,
      limitUsd: r2(limitUsd),
      accountBalance: r2(accountBalance),
      tradingDays: byDay.size,
      breachDays: breaches.length,
      worstDays: breaches.slice(0, 3),
    };
  }

  // Tagged mistakes — the vocabulary the trade form writes. plan.mistakesToAvoid
  // is free text the user typed, so it is matched by label, and whatever fails
  // to match is reported as unmatched rather than quietly dropped.
  const mistakeAgg = new Map();
  for (const t of trades) {
    for (const key of t.mistakes || []) {
      const cur = mistakeAgg.get(key) || { trades: 0, pnl: 0 };
      cur.trades += 1;
      cur.pnl += pnlOf(t);
      mistakeAgg.set(key, cur);
    }
  }
  const taggedMistakes = [...mistakeAgg.entries()]
    .map(([key, v]) => ({ label: MISTAKE_LABELS[key] || key, trades: v.trades, pnl: r2(v.pnl) }))
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5);

  const declaredMistakes = Array.isArray(plan.mistakesToAvoid) ? plan.mistakesToAvoid : [];
  const matchedMistakes = declaredMistakes
    .map((text) => {
      const hit = taggedMistakes.find((m) => norm(m.label).includes(norm(text)) || norm(text).includes(norm(m.label)));
      return hit ? { declared: text, trades: hit.trades, pnl: hit.pnl } : null;
    })
    .filter(Boolean);
  if (declaredMistakes.length && !matchedMistakes.length) {
    notMeasurable.push({
      rule: 'טעויות להימנע מהן',
      reason: 'הטעויות בתוכנית נכתבו כטקסט חופשי ולא תואמות אף תגית טעות בעסקאות',
    });
  }

  // Headline: does breaking the plan cost money? A trade is off-plan if it
  // breached any of the allow-list rules.
  const offSet = new Set();
  for (const rule of rules) for (const t of rule._offTrades) offSet.add(t.id ?? t);
  const offPlanTrades = trades.filter((t) => offSet.has(t.id ?? t));
  const onPlanTrades = trades.filter((t) => !offSet.has(t.id ?? t));
  const compliance = rules.length
    ? {
      onPlan: summary(onPlanTrades),
      offPlan: summary(offPlanTrades),
      avgPnlDelta: r2(
        (onPlanTrades.length ? onPlanTrades.reduce((s, t) => s + pnlOf(t), 0) / onPlanTrades.length : 0)
          - (offPlanTrades.length ? offPlanTrades.reduce((s, t) => s + pnlOf(t), 0) / offPlanTrades.length : 0),
      ),
    }
    : null;

  // Finished sentences, ranked by how much money the breach is associated with.
  const findings = [];
  if (compliance && !compliance.onPlan.thin && !compliance.offPlan.thin && compliance.avgPnlDelta !== 0) {
    findings.push({
      cost: Math.abs(compliance.offPlan.pnl),
      text: compliance.avgPnlDelta > 0
        ? `עסקאות שחרגו מהתוכנית הניבו פחות ב-${usdAbs(compliance.avgPnlDelta)} לעסקה מעסקאות שעמדו בה (${compliance.offPlan.trades} מול ${compliance.onPlan.trades} עסקאות).`
        : `העסקאות שחרגו מהתוכנית דווקא הניבו יותר ב-${usdAbs(compliance.avgPnlDelta)} לעסקה — התוכנית עצמה צרה מדי, לא המשמעת.`,
    });
  }
  // When the same trades breach several rules at once (an off-plan pair that is
  // also an off-plan timeframe and session), one finding says it — three say it
  // three times and read as three separate problems.
  const seenBreachSets = new Set();
  for (const rule of [...rules].sort((a, b) => a.offPlan.pnl - b.offPlan.pnl)) {
    const worst = rule.offPlanValues[0];
    if (!worst || worst.pnl >= 0 || rule.offPlan.thin) continue;
    const signature = rule._offTrades.map((t) => t.id ?? '?').sort((a, b) => String(a).localeCompare(String(b))).join('|');
    if (seenBreachSets.has(signature)) continue;
    seenBreachSets.add(signature);
    findings.push({
      cost: Math.abs(worst.pnl),
      text: `"${worst.value}" לא נמצא ב${rule.label} של התוכנית, ועלה ${usdAbs(worst.pnl)} על פני ${worst.trades} עסקאות.`,
    });
  }
  for (const rule of rules) delete rule._offTrades;
  if (dailyLoss?.breachDays) {
    const w = dailyLoss.worstDays[0];
    const days = dailyLoss.breachDays === 1 ? 'ביום אחד' : `ב-${dailyLoss.breachDays} ימים`;
    findings.push({
      cost: Math.abs(w.pnl),
      text: `חצית את תקרת ההפסד היומי (${dailyLoss.limitPct}% ≈ ${usdAbs(dailyLoss.limitUsd)}) ${days} מתוך ${dailyLoss.tradingDays}. הגרוע: ${w.date}, הפסד של ${usdAbs(w.pnl)} — ${w.pctOfAccount}% מהחשבון.`,
    });
  }
  if (positions?.breached) {
    findings.push({
      cost: 0,
      text: `התוכנית מגבילה ל-${positions.limit} פוזיציות במקביל, ובפועל הגעת ל-${positions.peakConcurrent} (${positions.peakDate}).`,
    });
  }
  const worstMistake = taggedMistakes[0];
  if (worstMistake && worstMistake.pnl < 0 && worstMistake.trades >= AUDIT_MIN_SAMPLE) {
    findings.push({
      cost: Math.abs(worstMistake.pnl),
      text: `הטעות "${worstMistake.label}" מתויגת ב-${worstMistake.trades} עסקאות שסיכומן ${usdAbs(worstMistake.pnl)} הפסד.`,
    });
  }
  findings.sort((a, b) => b.cost - a.cost);

  return {
    planName: plan.name || 'התוכנית',
    planActive: plan.isActive !== false,
    tradesAudited: trades.length,
    compliance,
    rules,
    positions,
    dailyLoss,
    taggedMistakes,
    declaredMistakes: matchedMistakes,
    notMeasurable,
    findings: findings.map((f) => f.text),
    minSampleForConclusion: AUDIT_MIN_SAMPLE,
  };
}
