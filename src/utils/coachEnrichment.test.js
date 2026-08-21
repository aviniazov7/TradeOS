import { describe, it, expect } from 'vitest';
import { buildPsychologyStats } from './coachPsychology';
import { auditPlan } from './planAudit';

// Regressions for the AI-coach enrichment payloads. Every case here failed
// before the fix it names — the point is that a number the model is told it may
// quote verbatim can never be wrong, missing, or built on a sample too small to
// support it.

const T = (o) => ({ status: 'closed', result: (o.netPnl >= 0 ? 'win' : 'loss'), ...o });
const day = (date, emotion, readinessLevel, preMarketChecklist = []) =>
  ({ date, emotion, readinessLevel, preMarketChecklist });
const pad = (n) => String(n).padStart(2, '0');

describe('buildPsychologyStats', () => {
  it('keeps the large buckets instead of the extreme ones', () => {
    // |avgPnlDelta| is inversely related to sample size, so ranking on magnitude
    // alone sliced the conclusive buckets out and left only unusable ones.
    const morning = [];
    const trades = [];
    [['inspired', 900], ['grateful', -800], ['excited', 700], ['bored', -600], ['tired', 500]]
      .forEach(([emotion, netPnl], i) => {
        const d = `2026-05-0${i + 1}`;
        morning.push(day(d, emotion, 5));
        trades.push(T({ id: `r${i}`, exitDate: `${d}T12:00`, netPnl }));
      });
    for (let i = 0; i < 20; i += 1) {
      const d = `2026-06-${pad(i + 1)}`;
      morning.push(day(d, 'calm', 8));
      trades.push(T({ id: `c${i}`, exitDate: `${d}T12:00`, netPnl: 60 }));
    }
    for (let i = 0; i < 20; i += 1) {
      const d = `2026-07-${pad(i + 1)}`;
      morning.push(day(d, 'anxious', 3));
      trades.push(T({ id: `a${i}`, exitDate: `${d}T12:00`, netPnl: -60 }));
    }

    const p = buildPsychologyStats(trades, morning, []);
    const labels = p.emotions.map((e) => e.label);
    expect(labels).toContain('רגוע/ה');
    expect(labels).toContain('חרדה');
    expect(p.emotions[0].thin).toBe(false);
    expect(p.findings.some((f) => f.includes('רגוע/ה'))).toBe(true);
  });

  it('gives the win-rate clause its own direction', () => {
    // A routine can raise dollars per trade through fewer, larger wins while
    // lowering the hit rate. Printing |winRateDelta| inside gain wording made
    // the sentence assert the opposite of the number.
    const morning = [];
    const trades = [];
    for (let i = 0; i < 10; i += 1) {
      const d = `2026-03-${pad(i + 1)}`;
      morning.push(day(d, 'calm', 8, ['news']));
      trades.push(T({ id: `w${i}`, exitDate: `${d}T12:00`, netPnl: i < 2 ? 200 : -10 }));
    }
    for (let i = 0; i < 10; i += 1) {
      const d = `2026-04-${pad(i + 1)}`;
      morning.push(day(d, 'calm', 8));
      trades.push(T({ id: `s${i}`, exitDate: `${d}T12:00`, netPnl: i < 9 ? 5 : -10 }));
    }

    const f = buildPsychologyStats(trades, morning, []).findings.find((x) => x.includes('בדיקת חדשות'));
    expect(f).toBeDefined();
    expect(f).toContain('פחות בהצלחה');
    expect(f.startsWith('הפעולה')).toBe(true); // feminine head noun agrees with all six labels
  });

  it('publishes no discipline delta when only one side exists', () => {
    const morning = [];
    const evening = [];
    const trades = [];
    for (let i = 0; i < 10; i += 1) {
      const d = `2026-02-${pad(i + 1)}`;
      morning.push(day(d, 'calm', 8));
      evening.push({ date: d, followedPlan: true });
      trades.push(T({ id: `d${i}`, exitDate: `${d}T12:00`, netPnl: 20 }));
    }

    const { discipline } = buildPsychologyStats(trades, morning, evening);
    expect(discipline.comparable).toBe(false);
    expect(discipline.avgPnlDelta).toBeNull();
    expect(discipline.winRateDelta).toBeNull();
    expect(discipline.followedPlan.trades).toBe(10); // the measured side survives
  });

  it('cross-references a closed trade that has no exitDate', () => {
    // CSV imports write exitDate: null. Keying on exitDate alone sent them all
    // to 1970-01-01, where no journal entry could match.
    const p = buildPsychologyStats(
      [T({ id: 'x1', exitDate: null, entryDate: '2026-01-05T09:00', netPnl: 50 })],
      [day('2026-01-05', 'calm', 8)],
      [],
    );
    expect(p).not.toBeNull();
    expect(p.baseline.trades).toBe(1);
  });

  it('returns null rather than an empty shell when there is nothing to cross', () => {
    expect(buildPsychologyStats([], [], [])).toBeNull();
    expect(buildPsychologyStats([T({ id: 'a', exitDate: '2026-01-01T10:00', netPnl: 5 })], [], [])).toBeNull();
  });
});

describe('auditPlan', () => {
  const dated = (i) => ({ entryDate: `2026-01-${pad(i)}T09:00`, exitDate: `2026-01-${pad(i)}T10:00` });

  it('counts only trades a rule actually evaluated as on-plan', () => {
    // Taking the complement of the off-plan set filed every trade with an empty
    // pair/timeframe/session under "followed the plan", which made the headline
    // claim that following the plan loses money.
    const plan = { name: 'תוכנית', pairs: ['BTCUSDT'], timeframes: ['1H'], sessions: ['London'], isActive: true };
    const trades = [
      T({ id: 'g1', pair: 'BTCUSDT', timeframe: '1H', session: 'London', ...dated(1), netPnl: 100 }),
      T({ id: 'g2', pair: 'BTCUSDT', timeframe: '1H', session: 'London', ...dated(2), netPnl: 100 }),
      T({ id: 'b1', pair: '', timeframe: '', session: '', ...dated(3), netPnl: -500 }),
      T({ id: 'b2', pair: '', timeframe: '', session: '', ...dated(4), netPnl: -500 }),
      T({ id: 'b3', pair: '', timeframe: '', session: '', ...dated(5), netPnl: -500 }),
    ];

    const a = auditPlan(plan, trades, { accountBalance: 10000 });
    expect(a.compliance.onPlan.trades).toBe(2);
    expect(a.compliance.onPlan.avgPnl).toBe(100);
    expect(a.compliance.unmeasuredTrades).toBe(3);
    expect(a.notMeasurable.some((n) => n.rule === 'השוואת עמידה בתוכנית')).toBe(true);
  });

  it('never leaks the internal trade arrays into the payload', () => {
    const plan = { name: 'p', pairs: ['BTCUSDT'], isActive: true };
    const a = auditPlan(plan, [T({ id: 'a', pair: 'ETHUSDT', ...dated(1), netPnl: -10 })], {});
    const json = JSON.stringify(a);
    expect(json).not.toContain('_offTrades');
    expect(json).not.toContain('_onTrades');
  });

  it('does not build a finding on a single-trade outlier', () => {
    // offPlanValues is sorted by total P&L, so one catastrophic trade outranked
    // a genuine repeated pattern and got quoted as "cost you $500 over 1 trade".
    const plan = { name: 'תוכנית', pairs: ['BTCUSDT'], isActive: true };
    const trades = [];
    for (let i = 0; i < 6; i += 1) trades.push(T({ id: `x${i}`, pair: 'XRPUSDT', ...dated(i + 1), netPnl: -6.67 }));
    trades.push(T({ id: 'doge', pair: 'DOGEUSDT', ...dated(9), netPnl: -500 }));

    const f = auditPlan(plan, trades, {}).findings.find((x) => x.includes('מטבעות מותרים'));
    expect(f).toContain('XRPUSDT');
    expect(f).not.toContain('"DOGEUSDT" לא נמצא');
  });

  it('reports every declared mistake it could not match, not just when none matched', () => {
    const plan = {
      name: 'p',
      pairs: ['BTCUSDT'],
      mistakesToAvoid: ['כניסה מפומו', 'לא להזיז סטופ לוס', 'לסחור בלי תוכנית', ''],
      isActive: true,
    };
    const trades = [];
    for (let i = 0; i < 6; i += 1) {
      trades.push(T({ id: `m${i}`, pair: 'BTCUSDT', mistakes: ['fomo_entry'], ...dated(i + 1), netPnl: -50 }));
    }

    const a = auditPlan(plan, trades, {});
    const unmatched = a.notMeasurable.filter((n) => n.rule.startsWith('טעות:'));
    expect(unmatched).toHaveLength(2);
    expect(unmatched.some((u) => u.rule === 'טעות: ')).toBe(false); // an empty entry matches everything
    expect(a.declaredMistakes).toHaveLength(1);
  });

  it('will not claim the position limit was respected when overlap is unmeasurable', () => {
    // Exchange imports write exitDate === entryDate, so those trades can never
    // overlap each other and the sweep can only under-count.
    const trades = [];
    for (let i = 0; i < 5; i += 1) {
      trades.push(T({ id: `z${i}`, entryDate: `2026-01-0${i + 1}T09:00`, exitDate: `2026-01-0${i + 1}T09:00`, netPnl: 10 }));
    }

    const a = auditPlan({ name: 'p', maxPositions: 2, isActive: true }, trades, {});
    expect(a.positions.conclusive).toBe(false);
    expect(a.notMeasurable.some((n) => n.rule === 'מקסימום פוזיציות')).toBe(true);
  });

  it('detects a real overlap and words a limit of one in the singular', () => {
    const trades = [
      T({ id: 'p1', entryDate: '2026-01-01T09:00', exitDate: '2026-01-01T15:00', netPnl: 10 }),
      T({ id: 'p2', entryDate: '2026-01-01T10:00', exitDate: '2026-01-01T14:00', netPnl: 10 }),
    ];

    const a = auditPlan({ name: 'p', maxPositions: 1, isActive: true }, trades, {});
    expect(a.positions.breached).toBe(true);
    expect(a.positions.peakConcurrent).toBe(2);
    expect(a.findings.find((f) => f.includes('פוזיצי'))).toContain('לפוזיציה אחת בכל רגע');
  });

  it('reports the daily-loss rule as unmeasurable instead of guessing a balance', () => {
    const plan = { name: 'p', maxDailyLoss: 3, isActive: true };
    const a = auditPlan(plan, [T({ id: 'a', ...dated(1), netPnl: -900 })], { accountBalance: 0 });
    expect(a.dailyLoss).toBeNull();
    expect(a.notMeasurable.some((n) => n.rule === 'הפסד יומי מקסימלי')).toBe(true);
  });

  it('returns null when there is no plan or no closed trades', () => {
    expect(auditPlan(null, [T({ id: 'a', ...dated(1), netPnl: 1 })], {})).toBeNull();
    expect(auditPlan({ name: 'p' }, [], {})).toBeNull();
  });
});
