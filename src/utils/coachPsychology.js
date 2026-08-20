import { computeMentalStats } from './mentalStats';

// Below this many trades a bucket is statistically meaningless — we still send
// it, but flagged, and the prompt forbids drawing a conclusion from it.
export const PSYCH_MIN_SAMPLE = 8;

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const usd = (v) => `${v >= 0 ? '+' : '-'}$${Math.abs(r2(v)).toFixed(2)}`;
// For sentences that already carry the direction in words ("נמוך ב-", "שווה
// לך") — a signed number there reads as "נמוך ב--$40".
const usdAbs = (v) => `$${Math.abs(r2(v)).toFixed(2)}`;
const ppAbs = (v) => r1(Math.abs(v));

function group(g) {
  return { trades: g.trades, winRate: g.winRate, avgPnl: r2(g.avgPnl), thin: g.trades < PSYCH_MIN_SAMPLE };
}

// Turns the mentality journals into the "does my headspace cost me money?"
// section of the coach payload. Everything here is arithmetic done in code —
// the model receives finished numbers and is only allowed to phrase them.
// Returns null when there is nothing to cross-reference, so the caller can omit
// the key entirely rather than send an empty shell.
export function buildPsychologyStats(trades, morningEntries, eveningEntries) {
  const m = computeMentalStats(trades, morningEntries, eveningEntries);
  if (!m.totalCrossDays) return null;

  // Every bucket is expressed as a delta against the baseline, so "60% win
  // rate" can't be mistaken for an edge when the baseline is already 62%.
  const baseWinRate = m.baseline.winRate;
  const baseAvgPnl = m.baseline.avgPnl;

  const emotions = m.emotionStatsArray
    .map((e) => ({
      label: e.label,
      ...group(e),
      winRateDelta: e.winRate - baseWinRate,
      avgPnlDelta: r2(e.avgPnl - baseAvgPnl),
    }))
    .sort((a, b) => Math.abs(b.avgPnlDelta) - Math.abs(a.avgPnlDelta))
    .slice(0, 5);

  const readiness = m.readinessStats.filter((g) => g.trades > 0).map((g) => ({ label: g.label, ...group(g) }));

  // Routine items are only interesting when both sides of the comparison exist.
  const routine = m.checklistStats
    .filter((c) => c.with.trades > 0 && c.without.trades > 0)
    .map((c) => ({
      label: c.label,
      done: group(c.with),
      skipped: group(c.without),
      winRateDelta: c.with.winRate - c.without.winRate,
      avgPnlDelta: r2(c.with.avgPnl - c.without.avgPnl),
    }))
    .sort((a, b) => Math.abs(b.avgPnlDelta) - Math.abs(a.avgPnlDelta))
    .slice(0, 4);

  const { followed, notFollowed } = m.planStats;
  const discipline = followed.trades || notFollowed.trades
    ? {
      followedPlan: group(followed),
      brokePlan: group(notFollowed),
      winRateDelta: followed.winRate - notFollowed.winRate,
      avgPnlDelta: r2(followed.avgPnl - notFollowed.avgPnl),
    }
    : null;

  // Pre-phrased, already-grounded one-liners. The model may quote these
  // verbatim; it must not invent a number that isn't here.
  const findings = [];
  const solid = (x) => x && !x.thin;

  // `emotions` is sorted by |avgPnlDelta| descending, so the first match on
  // each side is already the strongest one — no re-sorting needed.
  const worstEmotion = emotions.find((e) => solid(e) && e.avgPnlDelta < 0);
  if (worstEmotion) {
    findings.push(
      `בימים שנפתחו ברגש "${worstEmotion.label}" הרווח הממוצע לעסקה נמוך ב-${usdAbs(worstEmotion.avgPnlDelta)} מהממוצע שלך (${worstEmotion.trades} עסקאות, ${worstEmotion.winRate}% הצלחה).`,
    );
  }
  const bestEmotion = emotions.find((e) => solid(e) && e.avgPnlDelta > 0);
  if (bestEmotion) {
    findings.push(
      `הרגש "${bestEmotion.label}" הוא המצב הרווחי ביותר שלך: ${usd(bestEmotion.avgPnlDelta)} לעסקה מעל הממוצע (${bestEmotion.trades} עסקאות).`,
    );
  }
  if (discipline && solid(discipline.followedPlan) && solid(discipline.brokePlan) && discipline.avgPnlDelta !== 0) {
    findings.push(
      discipline.avgPnlDelta > 0
        ? `כשעמדת בתוכנית הרווחת ${usdAbs(discipline.avgPnlDelta)} יותר לעסקה מאשר בימים שסטית ממנה (${discipline.followedPlan.trades} מול ${discipline.brokePlan.trades} עסקאות).`
        : `דווקא בימים שסטית מהתוכנית התוצאה הייתה טובה יותר ב-${usdAbs(discipline.avgPnlDelta)} לעסקה — סימן שהתוכנית עצמה צריכה בדיקה, לא המשמעת.`,
    );
  }
  const topRoutine = routine.find((c) => solid(c.done) && solid(c.skipped) && c.avgPnlDelta !== 0);
  if (topRoutine) {
    findings.push(
      topRoutine.avgPnlDelta > 0
        ? `"${topRoutine.label}" לפני המסחר שווה לך ${usdAbs(topRoutine.avgPnlDelta)} לעסקה (${ppAbs(topRoutine.winRateDelta)} נקודות אחוז בהצלחה).`
        : `"${topRoutine.label}" לא משפר את התוצאות שלך — בימים שדילגת עליו הרווח לעסקה היה גבוה ב-${usdAbs(topRoutine.avgPnlDelta)}.`,
    );
  }
  const high = readiness.find((g) => g.label.startsWith('גבוהה'));
  const low = readiness.find((g) => g.label.startsWith('נמוכה'));
  if (solid(high) && solid(low) && high.avgPnl !== low.avgPnl) {
    findings.push(
      `מוכנות גבוהה (7-10): ${usd(high.avgPnl)} לעסקה מול ${usd(low.avgPnl)} במוכנות נמוכה (1-3).`,
    );
  }

  return {
    daysCovered: m.totalCrossDays,
    baseline: { trades: m.baseline.trades, winRate: baseWinRate, avgPnl: r2(baseAvgPnl) },
    avgReadinessOnGreenDays: m.avgReadinessProfit,
    avgReadinessOnRedDays: m.avgReadinessLoss,
    emotions,
    readiness,
    routine,
    discipline,
    findings,
    minSampleForConclusion: PSYCH_MIN_SAMPLE,
  };
}
