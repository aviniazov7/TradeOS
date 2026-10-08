import { describe, it, expect } from 'vitest';
import {
  assessTrader, buildAiSummary, STAGES, MIN_CLOSED_TRADES, formatGateValue, formatGateTarget, stageGates,
} from './traderStage';
import { localDayKey } from './calculations';

const NOW = new Date(2026, 9, 8, 12); // Thu 8 Oct 2026, local noon
const daysAgo = (n, h = 12) => new Date(2026, 9, 8 - n, h);
const dayKey = (n) => localDayKey(daysAgo(n));

let seq = 0;
// A closed long trade. `r` is the result in R; risk is $10 per trade unless
// noStop, in which case `pnl` is used and the trade carries no stop at all.
function trade({ ago = 0, r = 1, pnl, risk = 10, noStop = false, ...rest } = {}) {
  seq += 1;
  const base = {
    id: `t${seq}`,
    status: 'closed',
    direction: 'long',
    entryPrice: 100,
    exitPrice: 101,
    positionSize: risk * 100, // 1 point to the stop × (positionSize / entry) units = $risk
    exitDate: daysAgo(ago),
    entryDate: daysAgo(ago, 10),
  };
  if (noStop) return { ...base, netPnl: pnl ?? 0, ...rest };
  return { ...base, stopLoss: 99, originalStopLoss: 99, netPnl: pnl ?? r * risk, ...rest };
}

// `count` trades, one per day going back from today, alternating +win / −1R.
function series(count, { win = 2, ...rest } = {}) {
  return Array.from({ length: count }, (_, i) => trade({ ago: i, r: i % 2 === 0 ? win : -1, ...rest }));
}

const FULL_PLAN = {
  id: 'p1',
  name: 'תוכנית ליבה',
  isActive: true,
  pairs: ['BTCUSDT'],
  timeframes: ['1h'],
  sessions: ['london'],
  maxDailyLoss: 3,
  maxPositions: 2,
  entryRules: 'פריצה עם נפח',
  exitRules: 'יעד 2R',
  riskManagement: '1% לעסקה',
};

function journals(days, { readiness = 8, lessons = 'לחכות לאישור', followedPlan = true } = {}) {
  const morning = [];
  const evening = [];
  for (let i = 0; i < days; i++) {
    morning.push({ date: dayKey(i), readinessLevel: readiness, emotion: 'calm' });
    evening.push({ date: dayKey(i), dayRating: 7, followedPlan, lessonsLearned: lessons });
  }
  return { morningEntries: morning, eveningEntries: evening };
}

const dim = (a, id) => a.dimensions.find((d) => d.id === id);

describe('assessTrader — low data', () => {
  it('handles a brand-new user with no data at all', () => {
    const a = assessTrader({ now: NOW });
    expect(a.insufficient).toBe(true);
    expect(a.closedTrades).toBe(0);
    expect(a.stage.index).toBe(1);
    expect(a.stage.name).toBe(STAGES[0].name);
    expect(a.nextStage.name).toBe(STAGES[1].name);
    expect(a.stageProgress).toBe(0);
    expect(dim(a, 'experience').score).toBe(0);
    expect(dim(a, 'risk').score).toBeNull();
    expect(dim(a, 'consistency').score).toBeNull();
    expect(dim(a, 'edge').score).toBeNull();
    expect(a.dataNeeded.length).toBeGreaterThan(0);
    expect(a.dataNeeded[0]).toContain(String(MIN_CLOSED_TRADES));
    expect(a.dataNeeded.some((s) => s.includes('סטופ'))).toBe(true);
    expect(a.overall).toBe(0);
  });

  it('does not ask for stops when the few trades there are already have them', () => {
    const a = assessTrader({ trades: series(5), now: NOW });
    expect(a.dataNeeded.some((s) => s.includes('סטופ'))).toBe(false);
    expect(a.nextMilestones.map((g) => g.id)).toEqual(['trades20', 'weeks4']);
  });

  it('marks trade-outcome dimensions as not enough data below the minimum sample', () => {
    const a = assessTrader({ trades: series(6), now: NOW });
    expect(a.insufficient).toBe(true);
    for (const id of ['risk', 'consistency', 'edge']) {
      expect(dim(a, id).score).toBeNull();
      expect(dim(a, id).evidence[0]).toContain('6');
      expect(dim(a, id).tip).toContain(String(MIN_CLOSED_TRADES - 6));
    }
    // Experience is still measured, and the user stays at stage 1.
    expect(dim(a, 'experience').score).toBeGreaterThan(0);
    expect(a.stage.index).toBe(1);
  });

  it('never counts open or partial trades', () => {
    const open = Array.from({ length: 30 }, (_, i) => ({ ...trade({ ago: i }), status: 'open' }));
    const partial = Array.from({ length: 5 }, (_, i) => ({ ...trade({ ago: i }), status: 'partial' }));
    const a = assessTrader({ trades: [...open, ...partial], now: NOW });
    expect(a.closedTrades).toBe(0);
  });

  it('has an overall score only from measured dimensions', () => {
    const a = assessTrader({ now: NOW });
    const measured = a.dimensions.filter((d) => d.score != null);
    expect(measured.map((d) => d.id)).toEqual(['experience', 'plan', 'psychology']);
    expect(a.overall).toBe(Math.round(measured.reduce((s, d) => s + d.score, 0) / measured.length));
  });
});

describe('assessTrader — scope', () => {
  it('drops trades of journals that no longer exist, keeps legacy trades with no journal', () => {
    const live = series(12, { journalId: 'j1' });
    const deleted = series(40, { journalId: 'gone' });
    const legacy = series(3);
    const a = assessTrader({ trades: [...live, ...deleted, ...legacy], journals: [{ id: 'j1' }], now: NOW });
    expect(a.closedTrades).toBe(15);
  });

  it('counts every trade when no journal list is given', () => {
    const a = assessTrader({ trades: series(12, { journalId: 'x' }), now: NOW });
    expect(a.closedTrades).toBe(12);
  });
});

describe('experience', () => {
  it('reaches 100 with 150+ trades spread over 26+ weeks', () => {
    const trades = Array.from({ length: 150 }, (_, i) => trade({ ago: i * 2, r: i % 2 ? -1 : 2 }));
    const d = dim(assessTrader({ trades, now: NOW }), 'experience');
    expect(d.score).toBe(100);
    expect(d.evidence[0]).toBe('150 עסקאות סגורות מתועדות');
  });

  it('weights spread over time: the same trade count in one week scores lower', () => {
    const spread = Array.from({ length: 60 }, (_, i) => trade({ ago: i * 3 }));
    const burst = Array.from({ length: 60 }, () => trade({ ago: 1 }));
    const a = dim(assessTrader({ trades: spread, now: NOW }), 'experience').score;
    const b = dim(assessTrader({ trades: burst, now: NOW }), 'experience').score;
    expect(a).toBeGreaterThan(b);
  });
});

describe('risk discipline', () => {
  it('scores high when every trade has a stop and no loss exceeds 1.5R', () => {
    const d = dim(assessTrader({ trades: series(40), now: NOW }), 'risk');
    expect(d.score).toBeGreaterThanOrEqual(85);
    expect(d.evidence[0]).toContain('100%');
    expect(d.evidence.some((e) => e.includes('לא חרג מ-1.5R'))).toBe(true);
  });

  it('penalises oversized losses and says how many', () => {
    const trades = [...series(20), ...Array.from({ length: 6 }, (_, i) => trade({ ago: 30 + i, r: -3 }))];
    const a = assessTrader({ trades, now: NOW });
    const d = dim(a, 'risk');
    const clean = dim(assessTrader({ trades: series(26), now: NOW }), 'risk');
    expect(d.score).toBeLessThan(clean.score);
    expect(d.evidence.some((e) => e.startsWith('6 מתוך 16 הפסדים חרגו'))).toBe(true);
    expect(a.metrics.oversizedLossPct).toBe(38);
  });

  it('falls back to the dollar shape of losses when there are no stops', () => {
    const trades = [
      ...Array.from({ length: 10 }, (_, i) => trade({ ago: i, noStop: true, pnl: i % 2 ? -10 : 15 })),
      trade({ ago: 20, noStop: true, pnl: -100 }),
    ];
    const a = assessTrader({ trades, now: NOW });
    const d = dim(a, 'risk');
    expect(d.evidence[0]).toContain('0%');
    expect(d.evidence.some((e) => e.includes('פי 10.0'))).toBe(true);
    expect(d.score).toBeLessThan(30);
    expect(d.tip).toContain('סטופ');
    expect(a.metrics.oversizedLossPct).toBeNull();
  });

  it('measures risk against the journal limit when one is set', () => {
    const journal = { id: 'j1', riskType: 'fixed', riskValue: 10 };
    const inside = assessTrader({ trades: series(20, { journalId: 'j1' }), journals: [journal], now: NOW });
    const outside = assessTrader({ trades: series(20, { journalId: 'j1', risk: 25 }), journals: [journal], now: NOW });
    expect(dim(inside, 'risk').evidence).toContain('100% מהעסקאות בתוך מגבלת הסיכון של היומן');
    expect(dim(outside, 'risk').evidence).toContain('0% מהעסקאות בתוך מגבלת הסיכון של היומן');
    expect(dim(inside, 'risk').score).toBeGreaterThan(dim(outside, 'risk').score);
  });

  it('supports a percent-of-balance journal limit', () => {
    const journal = { id: 'j1', riskType: 'percent', riskValue: 1, initialBalance: 1000 };
    const a = assessTrader({ trades: series(20, { journalId: 'j1' }), journals: [journal], now: NOW });
    expect(a.metrics.riskLimitCompliancePct).toBe(100);
  });
});

describe('consistency', () => {
  it('reports profitable months, drawdown in R and the longest losing streak', () => {
    const a = assessTrader({ trades: series(90), now: NOW });
    const d = dim(a, 'consistency');
    expect(d.evidence[0]).toMatch(/^\d+ מתוך \d+ חודשים רווחיים$/);
    expect(d.evidence[1]).toContain('R');
    expect(d.evidence[2]).toBe('רצף ההפסדים הארוך ביותר: 1');
    expect(d.score).toBeGreaterThanOrEqual(90);
  });

  it('drops with a long losing streak and a deep drawdown', () => {
    const trades = [
      ...series(20),
      // ago 19 is already a loss in the series, so the run is 12 + 1.
      ...Array.from({ length: 12 }, (_, i) => trade({ ago: 40 + i, r: -1 })),
    ];
    const d = dim(assessTrader({ trades, now: NOW }), 'consistency');
    expect(d.evidence[2]).toBe('רצף ההפסדים הארוך ביותר: 13');
    expect(d.score).toBeLessThan(60);
    expect(d.tip).toBeTruthy();
  });
});

describe('plan adherence', () => {
  it('is near zero with no plan and no journals', () => {
    const d = dim(assessTrader({ trades: series(20), now: NOW }), 'plan');
    expect(d.evidence[0]).toBe('אין תוכנית מסחר פעילה');
    // No plan and nothing self-reported: no neutral credit anywhere.
    expect(d.score).toBe(0);
    expect(d.tip).toContain('כתוב תוכנית');
  });

  it('uses the plan audit compliance, evening self-report and checklist', () => {
    const onPlan = series(20, { pair: 'BTCUSDT', timeframe: '1h', session: 'london', checklistAdherence: 100 });
    const offPlan = series(20, { pair: 'DOGEUSDT', timeframe: '1h', session: 'london', checklistAdherence: 40 });
    const good = assessTrader({ trades: onPlan, plans: [FULL_PLAN], ...journals(10), now: NOW });
    const bad = assessTrader({ trades: offPlan, plans: [FULL_PLAN], ...journals(10, { followedPlan: false }), now: NOW });
    expect(dim(good, 'plan').score).toBe(100);
    expect(dim(good, 'plan').evidence).toContain('100% מהעסקאות שנבדקו עמדו בכללי התוכנית (20/20)');
    // Only the plan itself (25 of 100) and a 40% checklist (6) are left.
    expect(dim(bad, 'plan').score).toBe(31);
    expect(dim(bad, 'plan').evidence.some((e) => e.includes('0 מתוך 10 ימים'))).toBe(true);
  });

  it('ignores evening answers older than 90 days', () => {
    const old = { date: dayKey(120), followedPlan: false };
    const a = assessTrader({ trades: series(12), plans: [FULL_PLAN], eveningEntries: Array(6).fill(old), now: NOW });
    expect(a.metrics.followedPlanPct).toBeNull();
  });

  it('picks the most recently updated active plan', () => {
    const older = { ...FULL_PLAN, id: 'old', name: 'ישנה', updatedAt: new Date(2026, 0, 1) };
    const newer = { id: 'new', name: 'חדשה', isActive: true, updatedAt: new Date(2026, 8, 1) };
    const d = dim(assessTrader({ trades: series(12), plans: [older, newer], now: NOW }), 'plan');
    expect(d.evidence[0]).toContain('"חדשה"');
    expect(d.evidence[0]).toContain('0 מתוך 8');
  });
});

describe('psychology / self-awareness', () => {
  it('rewards daily journaling, written lessons, tagged trades and mood/results cross-days', () => {
    const trades = series(30, { emotionBefore: 'calm' });
    const d = dim(assessTrader({ trades, ...journals(30), now: NOW }), 'psychology');
    expect(d.score).toBe(100);
    expect(d.evidence[0]).toBe('30 ימים מתועדים ביומן ב-30 הימים האחרונים');
  });

  it('is measurable from journals alone, before any trades', () => {
    const d = dim(assessTrader({ ...journals(10), now: NOW }), 'psychology');
    expect(d.score).toBeGreaterThan(0);
    expect(d.evidence).toHaveLength(2);
  });

  it('compares results on high- vs low-readiness days when both have a sample', () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => trade({ ago: i, r: 2 })),
      ...Array.from({ length: 4 }, (_, i) => trade({ ago: 10 + i, r: -1 })),
      ...series(4, { ago: 20 }),
    ];
    const morningEntries = [
      ...[0, 1, 2, 3].map((i) => ({ date: dayKey(i), readinessLevel: 9 })),
      ...[10, 11, 12, 13].map((i) => ({ date: dayKey(i), readinessLevel: 3 })),
    ];
    const d = dim(assessTrader({ trades, morningEntries, now: NOW }), 'psychology');
    expect(d.evidence.some((e) => e.includes('$20') && e.includes('−$10'))).toBe(true);
  });
});

describe('edge', () => {
  it('guards a small sample: the same edge scores higher over more trades', () => {
    const small = dim(assessTrader({ trades: series(20), now: NOW }), 'edge');
    const large = dim(assessTrader({ trades: series(200), now: NOW }), 'edge');
    expect(small.score).toBeLessThan(large.score);
    expect(large.score).toBe(100);
    expect(small.evidence.some((e) => e.includes('הציון מוגבל'))).toBe(true);
    expect(small.evidence[0]).toBe('תוחלת +0.50R לעסקה (20 עסקאות עם סטופ)');
  });

  it('scores a negative expectancy low and says so', () => {
    const trades = series(120, { win: 0.5 }); // +0.5R / −1R alternating
    const d = dim(assessTrader({ trades, now: NOW }), 'edge');
    expect(d.score).toBeLessThan(15);
    expect(d.evidence[0]).toContain('−0.25R');
    expect(d.tip).toContain('התוחלת שלילית');
  });

  it('falls back to profit factor when there are no stops', () => {
    const trades = Array.from({ length: 30 }, (_, i) => trade({ ago: i, noStop: true, pnl: i % 2 ? -10 : 20 }));
    const d = dim(assessTrader({ trades, now: NOW }), 'edge');
    expect(d.evidence[0]).toContain('אי אפשר למדוד תוחלת');
    expect(d.evidence[1]).toContain('Profit Factor 2.00');
    expect(d.score).toBeGreaterThan(0);
  });
});

describe('stage ladder', () => {
  it('reaches stage 2 on volume alone, and names the plan as the blocker to stage 3', () => {
    const trades = Array.from({ length: 60 }, (_, i) => trade({ ago: i, noStop: true, pnl: i % 2 ? -10 : 12 }));
    const a = assessTrader({ trades, now: NOW });
    expect(a.stage.index).toBe(2);
    expect(a.stage.name).toBe('צובר ניסיון');
    expect(a.nextStage.name).toBe('מגבש שיטה');
    const plan = a.nextMilestones.find((g) => g.id === 'plan');
    expect(plan.done).toBe(false);
    expect(a.blockers.some((b) => b.startsWith('תוכנית מסחר פעילה: חסר'))).toBe(true);
    expect(a.stageProgress).toBeGreaterThan(0);
    expect(a.stageProgress).toBeLessThan(100);
  });

  it('gates are cumulative: great numbers without a plan stay below stage 3', () => {
    const trades = series(300, { emotionBefore: 'calm' });
    const a = assessTrader({ trades, ...journals(30), now: NOW });
    expect(dim(a, 'edge').score).toBe(100);
    expect(a.stage.index).toBe(2);
  });

  it('places a complete, disciplined profile at the top stage', () => {
    const trades = series(300, {
      pair: 'BTCUSDT', timeframe: '1h', session: 'london', checklistAdherence: 100, emotionBefore: 'calm',
    });
    const a = assessTrader({ trades, plans: [FULL_PLAN], ...journals(30), now: NOW });
    expect(a.insufficient).toBe(false);
    expect(a.stage.index).toBe(6);
    expect(a.stage.name).toBe('מקצוען');
    expect(a.nextStage).toBeNull();
    expect(a.nextMilestones).toEqual([]);
    expect(a.stageProgress).toBe(100);
    expect(a.strengths.length).toBeGreaterThanOrEqual(5);
    expect(a.blockers).toEqual([]);
  });

  it('stops at "risk manager" when consistency is not there yet', () => {
    const trades = series(160, { pair: 'BTCUSDT', timeframe: '1h', session: 'london', checklistAdherence: 100 });
    // Insert a long losing run to break consistency.
    const bad = Array.from({ length: 14 }, (_, i) => trade({ ago: 170 + i, r: -1, pair: 'BTCUSDT', timeframe: '1h', session: 'london' }));
    const a = assessTrader({ trades: [...trades, ...bad], plans: [FULL_PLAN], ...journals(30), now: NOW });
    expect(a.stage.name).toBe('מנהל סיכון');
    expect(a.nextMilestones.find((g) => g.id === 'consistency65').done).toBe(false);
  });

  it('every stage has a professional name, description and focus', () => {
    expect(STAGES).toHaveLength(6);
    for (const s of STAGES) {
      expect(s.name).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.focus).toBeTruthy();
    }
  });

  it('keeps the written requirements in step with the measured gates', () => {
    const gates = stageGates({}, {});
    expect(gates).toHaveLength(STAGES.length - 1);
    gates.forEach((list, i) => {
      expect(STAGES[i + 1].requirements).toHaveLength(list.length);
      list.forEach((g, j) => expect(STAGES[i + 1].requirements[j]).toContain(String(g.target === 1 && g.kind === 'bool' ? 'תוכנית' : g.target)));
    });
  });

  it('is deterministic for the same input', () => {
    const input = { trades: series(80), plans: [FULL_PLAN], ...journals(12), now: NOW };
    expect(assessTrader(input)).toEqual(assessTrader(input));
  });
});

describe('gate formatting', () => {
  it('formats boolean, unit, missing and lower-is-better gates', () => {
    expect(formatGateValue({ kind: 'bool', current: 0 })).toBe('חסר');
    expect(formatGateTarget({ kind: 'bool', target: 1 })).toBe('נדרש');
    expect(formatGateValue({ current: 72, unit: '%' })).toBe('72%');
    expect(formatGateValue({ current: null })).toBe('לא נמדד');
    expect(formatGateTarget({ target: 10, unit: '%', lower: true })).toBe('≤ 10%');
  });

  it('counts a lower-is-better gate as done at or below the target', () => {
    // 75% of trades with a stop: past the stage-3 gate (60%), short of 85%.
    const trades = [
      ...series(45),
      ...Array.from({ length: 15 }, (_, i) => trade({ ago: 50 + i, noStop: true, pnl: 5 })),
    ];
    const a = assessTrader({ trades, plans: [FULL_PLAN], now: NOW });
    expect(a.stage.name).toBe('מגבש שיטה');
    expect(a.nextMilestones.find((g) => g.id === 'stop85').done).toBe(false);
    const oversized = a.nextMilestones.find((g) => g.id === 'oversized10');
    expect(oversized.current).toBe(0);
    expect(oversized.done).toBe(true);
    expect(oversized.progress).toBe(100);
  });
});

describe('buildAiSummary', () => {
  it('sends scores and evidence, never the raw trades', () => {
    const trades = series(80, { notes: 'SECRET NOTE' });
    const a = assessTrader({ trades, plans: [FULL_PLAN], ...journals(8), now: NOW });
    const s = buildAiSummary(a);
    const json = JSON.stringify(s);
    expect(json).not.toContain('SECRET NOTE');
    expect(json).not.toContain('entryPrice');
    expect(s.developmentAssessment.stage).toBe(`${a.stage.index}/6 ${a.stage.name}`);
    expect(s.developmentAssessment.dimensions).toHaveLength(6);
    expect(s.request).toContain('המלצות לפעולה');
    expect(json.length).toBeLessThan(4000);
  });
});
