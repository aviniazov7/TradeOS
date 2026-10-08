import { describe, it, expect } from 'vitest';
import { evaluatePropFirm, buildPropFirmRules, normalizePropFirm, ruleAmountUsd } from './propFirm';
import { PROP_FIRM_PRESETS } from './constants';

// `now` is injected and every date is a LOCAL time string (no Z), so day
// bucketing goes through localDayKey exactly like the app does.
const NOW = new Date('2026-08-20T15:00:00');
let seq = 0;
const closed = (day, netPnl, time = '12:00:00', extra = {}) => ({
  id: `t${seq++}`,
  status: 'closed',
  exitPrice: 100,
  entryDate: `${day}T${time}`,
  exitDate: `${day}T${time}`,
  netPnl,
  ...extra,
});

const ftmo = (over = {}) => ({
  enabled: true,
  presetId: 'ftmo',
  phase: 'phase1',
  accountSize: 100000,
  startDate: '2026-08-01',
  profitTarget: { value: 10, unit: 'pct' },
  maxDailyLoss: { value: 5, unit: 'pct', basis: 'initial' },
  maxDrawdown: { value: 10, unit: 'pct', type: 'static', lockOffset: null },
  minTradingDays: 4,
  consistencyPct: null,
  ...over,
});

describe('normalizePropFirm', () => {
  it('returns null when disabled or without an account size', () => {
    expect(normalizePropFirm(null)).toBeNull();
    expect(normalizePropFirm({ ...ftmo(), enabled: false })).toBeNull();
    expect(normalizePropFirm({ ...ftmo(), accountSize: 0 })).toBeNull();
    expect(evaluatePropFirm([], { enabled: false })).toBeNull();
  });

  it('coerces form strings and drops empty rules', () => {
    const cfg = normalizePropFirm(ftmo({
      accountSize: '50000',
      profitTarget: { value: '', unit: 'pct' },
      maxDailyLoss: { value: '4', unit: 'usd', basis: 'weird' },
      maxDrawdown: { value: '2000', unit: 'usd', type: 'trailing_eod', lockOffset: '' },
      minTradingDays: '3.7',
      consistencyPct: '0',
    }));
    expect(cfg.accountSize).toBe(50000);
    expect(cfg.profitTarget).toBeNull();
    expect(cfg.maxDailyLoss).toEqual({ value: 4, unit: 'usd', basis: 'initial' });
    expect(cfg.maxDrawdown).toEqual({ value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: null });
    expect(cfg.minTradingDays).toBe(3);
    expect(cfg.consistencyPct).toBeNull();
  });

  it('rejects a malformed start date', () => {
    expect(normalizePropFirm(ftmo({ startDate: '20/08/2026' })).startDate).toBe('');
  });
});

describe('ruleAmountUsd', () => {
  it('reads % of the base or a fixed $', () => {
    expect(ruleAmountUsd({ value: 5, unit: 'pct' }, 100000)).toBe(5000);
    expect(ruleAmountUsd({ value: 1000, unit: 'usd' }, 100000)).toBe(1000);
    expect(ruleAmountUsd(null, 1)).toBeNull();
  });
});

describe('buildPropFirmRules', () => {
  it('applies the phase target (FTMO phase 2 = 5%)', () => {
    const r = buildPropFirmRules('ftmo', 'phase2', 100000);
    expect(r.profitTarget).toEqual({ value: 5, unit: 'pct' });
    expect(r.maxDrawdown.type).toBe('static');
    expect(r.minTradingDays).toBe(4);
  });

  it('scales $ rules by account size and merges a phase drawdown type', () => {
    const r = buildPropFirmRules('topstep', 'combine', 100000);
    expect(r.profitTarget).toEqual({ value: 6000, unit: 'usd' });
    expect(r.maxDailyLoss).toEqual({ value: 2000, unit: 'usd', basis: 'start_of_day' });
    expect(r.maxDrawdown).toEqual({ value: 3000, unit: 'usd', type: 'trailing_eod', lockOffset: 0 });
    const apexEod = buildPropFirmRules('apex', 'eval_eod', 50000);
    expect(apexEod.maxDrawdown).toEqual({ value: 2500, unit: 'usd', type: 'trailing_eod', lockOffset: 100 });
  });

  it('funded phases have no target', () => {
    expect(buildPropFirmRules('topstep', 'funded', 50000).profitTarget).toBeNull();
    expect(buildPropFirmRules('ftmo_funded').profitTarget).toBeNull();
  });

  it('falls back to the preset default size / custom preset', () => {
    expect(buildPropFirmRules('apex').accountSize).toBe(50000);
    expect(buildPropFirmRules('nope').presetId).toBe('custom');
  });

  it('every preset builds a valid, evaluable rule set', () => {
    PROP_FIRM_PRESETS.forEach((p) => p.phases.forEach((ph) => {
      const r = buildPropFirmRules(p.id, ph.id, p.defaultSize);
      const ev = evaluatePropFirm([], { enabled: true, ...r }, { now: NOW });
      expect(ev, `${p.id}/${ph.id}`).not.toBeNull();
      expect(ev.status).toBe('on_track');
      expect(ev.balance).toBe(p.defaultSize);
    }));
  });
});

describe('evaluatePropFirm — balance, target, start date', () => {
  it('counts only trades on/after the start date', () => {
    const trades = [
      closed('2026-07-31', 50000), // before the challenge
      closed('2026-08-03', 2000),
      closed('2026-08-04', 1000),
    ];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.balance).toBe(103000);
    expect(r.totalPnl).toBe(3000);
    expect(r.tradeCount).toBe(2);
    expect(r.target.amountUsd).toBe(10000);
    expect(r.target.progressPct).toBeCloseTo(30);
    expect(r.target.remainingUsd).toBe(7000);
    expect(r.target.reached).toBe(false);
    expect(r.status).toBe('on_track');
  });

  it('ignores open trades and pending limit orders for P&L', () => {
    const trades = [
      closed('2026-08-03', 1000),
      { id: 'o', status: 'open', entryDate: '2026-08-05T10:00:00', netPnl: -99999 },
    ];
    expect(evaluatePropFirm(trades, ftmo(), { now: NOW }).balance).toBe(101000);
  });

  it('includes the booked legs of a manual partial exit', () => {
    const partial = { id: 'p', status: 'partial', exits: [{ percent: 50 }], entryDate: '2026-08-05T10:00:00', netPnl: 400 };
    expect(evaluatePropFirm([partial], ftmo(), { now: NOW }).balance).toBe(100400);
  });

  it('progress clamps at 0 when the account is down', () => {
    const r = evaluatePropFirm([closed('2026-08-03', -1000)], ftmo(), { now: NOW });
    expect(r.target.progressPct).toBe(0);
    expect(r.target.remainingUsd).toBe(11000);
  });

  it('passes only when target AND minimum days are met', () => {
    const three = [closed('2026-08-03', 4000), closed('2026-08-04', 4000), closed('2026-08-05', 3000)];
    const r1 = evaluatePropFirm(three, ftmo(), { now: NOW });
    expect(r1.target.reached).toBe(true);
    expect(r1.days).toMatchObject({ count: 3, required: 4, remaining: 1, met: false });
    expect(r1.status).toBe('on_track');
    expect(r1.pending).toEqual(['days']);

    const r2 = evaluatePropFirm([...three, closed('2026-08-06', 100)], ftmo(), { now: NOW });
    expect(r2.days.met).toBe(true);
    expect(r2.status).toBe('passed');
  });

  it('funded accounts (no target) never "pass"', () => {
    const r = evaluatePropFirm([closed('2026-08-03', 20000)], ftmo({ profitTarget: null }), { now: NOW });
    expect(r.target).toBeNull();
    expect(r.status).toBe('on_track');
  });
});

describe('evaluatePropFirm — trading days', () => {
  it('counts distinct local days, including the day an open trade was entered', () => {
    const trades = [
      closed('2026-08-03', 100, '09:00:00'),
      closed('2026-08-03', 100, '16:00:00'),
      { id: 'o', status: 'open', entryDate: '2026-08-07T10:00:00' },
      { id: 'lim', status: 'open', orderType: 'limit', limitTriggered: false, entryDate: '2026-08-08T10:00:00' },
    ];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.days.count).toBe(2); // 08-03 + 08-07; the unfilled limit doesn't count
  });

  it('a trade at 00:30 local lands on that local day (not the UTC one)', () => {
    const r = evaluatePropFirm([closed('2026-08-10', 100, '00:30:00')], ftmo({ minTradingDays: 1 }), { now: NOW });
    expect(r.days.count).toBe(1);
    expect(r.days.met).toBe(true);
  });
});

describe('evaluatePropFirm — daily loss', () => {
  it('reports today vs the limit with remaining $ (basis = initial)', () => {
    const trades = [closed('2026-08-19', 2000), closed('2026-08-20', -1500, '10:00:00'), closed('2026-08-20', -500, '11:00:00')];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.daily.limitUsd).toBe(5000);
    expect(r.daily.todayPnl).toBe(-2000);
    expect(r.daily.usedUsd).toBe(2000);
    expect(r.daily.remainingUsd).toBe(3000);
    expect(r.daily.floor).toBe(102000 - 5000);
    expect(r.daily.state).toBe('ok');
  });

  it('warns at ≥70% of the daily limit used', () => {
    const r = evaluatePropFirm([closed('2026-08-20', -3600)], ftmo(), { now: NOW });
    expect(r.daily.usedPct).toBeCloseTo(72);
    expect(r.daily.state).toBe('warning');
    expect(r.status).toBe('warning');
  });

  it('a profitable today uses none of the limit', () => {
    const r = evaluatePropFirm([closed('2026-08-20', 800)], ftmo(), { now: NOW });
    expect(r.daily.usedUsd).toBe(0);
    expect(r.daily.remainingUsd).toBe(5000);
  });

  it('a breach on a PAST day keeps the account breached (rule is final)', () => {
    const trades = [closed('2026-08-05', -5200), closed('2026-08-06', 6000)];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.daily.breached).toBe(true);
    expect(r.daily.breachDay).toBe('2026-08-05');
    expect(r.daily.state).toBe('breached');
    expect(r.status).toBe('breached');
    expect(r.breaches[0]).toMatchObject({ rule: 'daily', day: '2026-08-05' });
  });

  it('uses the intraday low of the day, not only the close', () => {
    // -5,100 by noon, recovered to -100 by the close: the limit was still hit.
    const trades = [closed('2026-08-05', -5100, '10:00:00'), closed('2026-08-05', 5000, '14:00:00')];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.daily.breached).toBe(true);
    expect(r.daily.worstDayLoss).toBe(5100);
  });

  it('hitting the limit exactly counts as a breach', () => {
    const r = evaluatePropFirm([closed('2026-08-20', -5000)], ftmo(), { now: NOW });
    expect(r.daily.breached).toBe(true);
    expect(r.daily.remainingUsd).toBe(0);
  });

  it('basis = start_of_day sizes the limit off the day\'s opening balance', () => {
    const cfg = ftmo({ maxDailyLoss: { value: 5, unit: 'pct', basis: 'start_of_day' } });
    const r = evaluatePropFirm([closed('2026-08-19', 20000), closed('2026-08-20', -5500)], cfg, { now: NOW });
    expect(r.daily.limitUsd).toBe(6000); // 5% of 120,000
    expect(r.daily.breached).toBe(false);
    const r2 = evaluatePropFirm([closed('2026-08-19', 20000), closed('2026-08-20', -5500)], ftmo(), { now: NOW });
    expect(r2.daily.breached).toBe(true); // 5% of the 100,000 initial = 5,000
  });

  it('a fixed $ daily limit (Topstep style)', () => {
    const cfg = ftmo({ accountSize: 50000, maxDailyLoss: { value: 1000, unit: 'usd', basis: 'start_of_day' } });
    const r = evaluatePropFirm([closed('2026-08-20', -750)], cfg, { now: NOW });
    expect(r.daily.limitUsd).toBe(1000);
    expect(r.daily.remainingUsd).toBe(250);
    expect(r.daily.state).toBe('warning');
  });

  it('live open P&L counts toward today and can breach', () => {
    const r = evaluatePropFirm([closed('2026-08-20', -3000)], ftmo(), { now: NOW, unrealizedPnl: -2500 });
    expect(r.daily.todayPnl).toBe(-5500);
    expect(r.daily.breached).toBe(true);
    expect(r.breaches.find((b) => b.rule === 'daily').live).toBe(true);
  });

  it('no daily rule → no daily meter', () => {
    expect(evaluatePropFirm([], ftmo({ maxDailyLoss: null }), { now: NOW }).daily).toBeNull();
  });
});

describe('evaluatePropFirm — static max drawdown', () => {
  it('floor = initial − limit, never moves with profits', () => {
    const trades = [closed('2026-08-03', 8000), closed('2026-08-04', -4000)];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.drawdown.floor).toBe(90000);
    expect(r.drawdown.remainingUsd).toBe(14000);
    expect(r.drawdown.usedUsd).toBe(0);
    expect(r.drawdown.state).toBe('ok');
  });

  it('breaches at the floor across several days', () => {
    const trades = [closed('2026-08-03', -4000), closed('2026-08-04', -4000), closed('2026-08-05', -2000)];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.drawdown.breached).toBe(true);
    expect(r.drawdown.breachDay).toBe('2026-08-05');
    expect(r.daily.breached).toBe(false);
    expect(r.status).toBe('breached');
  });

  it('warns at ≥70% of the drawdown used', () => {
    const trades = [closed('2026-08-03', -4000), closed('2026-08-04', -3500)];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.drawdown.usedPct).toBeCloseTo(75);
    expect(r.drawdown.state).toBe('warning');
  });
});

describe('evaluatePropFirm — trailing drawdown (end of day)', () => {
  const topstep = (over = {}) => ftmo({
    presetId: 'topstep',
    phase: 'combine',
    accountSize: 50000,
    profitTarget: { value: 3000, unit: 'usd' },
    maxDailyLoss: null,
    maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: 0 },
    minTradingDays: 0,
    ...over,
  });

  it('the floor follows the highest END-OF-DAY balance', () => {
    const trades = [closed('2026-08-03', 1000), closed('2026-08-04', -300)];
    const r = evaluatePropFirm(trades, topstep({ maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: null } }), { now: NOW });
    expect(r.drawdown.highWaterMark).toBe(51000);
    expect(r.drawdown.floor).toBe(49000);
    expect(r.drawdown.remainingUsd).toBe(1700);
  });

  it('an intraday peak that is given back the same day does NOT raise the floor', () => {
    const trades = [closed('2026-08-03', 1500, '10:00:00'), closed('2026-08-03', -1500, '14:00:00')];
    const r = evaluatePropFirm(trades, topstep({ maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: null } }), { now: NOW });
    expect(r.drawdown.highWaterMark).toBe(50000);
    expect(r.drawdown.floor).toBe(48000);
  });

  it('today\'s gains do not move the floor until the day closes', () => {
    const r = evaluatePropFirm([closed('2026-08-20', 1000)], topstep({ maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: null } }), { now: NOW });
    expect(r.drawdown.floor).toBe(48000);
    expect(r.drawdown.remainingUsd).toBe(3000);
  });

  it('locks at the starting balance (lockOffset 0) once it trails there', () => {
    const trades = [closed('2026-08-03', 2500), closed('2026-08-04', 500)];
    const r = evaluatePropFirm(trades, topstep(), { now: NOW });
    expect(r.drawdown.floor).toBe(50000); // min(53,000 − 2,000, 50,000)
    expect(r.drawdown.locked).toBe(true);
  });

  it('breaches when a later day falls through the trailed floor', () => {
    const trades = [closed('2026-08-03', 1200), closed('2026-08-04', -800), closed('2026-08-05', -1300)];
    const r = evaluatePropFirm(trades, topstep({ maxDrawdown: { value: 2000, unit: 'usd', type: 'trailing_eod', lockOffset: null } }), { now: NOW });
    // HWM 51,200 → floor 49,200; balance after day 3 = 49,100.
    expect(r.drawdown.breached).toBe(true);
    expect(r.drawdown.breachDay).toBe('2026-08-05');
  });
});

describe('evaluatePropFirm — trailing drawdown (intraday)', () => {
  const apex = (over = {}) => ftmo({
    presetId: 'apex',
    phase: 'eval',
    accountSize: 50000,
    profitTarget: { value: 3000, unit: 'usd' },
    maxDailyLoss: null,
    maxDrawdown: { value: 2500, unit: 'usd', type: 'trailing_intraday', lockOffset: 100 },
    minTradingDays: 0,
    consistencyPct: null,
    ...over,
  });

  it('the floor follows every new closed-trade peak, even within the day', () => {
    const trades = [closed('2026-08-03', 1500, '10:00:00'), closed('2026-08-03', -1500, '14:00:00')];
    const r = evaluatePropFirm(trades, apex(), { now: NOW });
    expect(r.drawdown.highWaterMark).toBe(51500);
    expect(r.drawdown.floor).toBe(49000);
    expect(r.drawdown.remainingUsd).toBe(1000);
    expect(r.drawdown.usedPct).toBeCloseTo(60);
  });

  it('breaches on a give-back the EOD rule would have survived', () => {
    const trades = [closed('2026-08-03', 2000, '10:00:00'), closed('2026-08-03', -2600, '14:00:00')];
    const intraday = evaluatePropFirm(trades, apex(), { now: NOW });
    expect(intraday.drawdown.breached).toBe(true);
    const eod = evaluatePropFirm(trades, apex({ maxDrawdown: { value: 2500, unit: 'usd', type: 'trailing_eod', lockOffset: 100 } }), { now: NOW });
    expect(eod.drawdown.breached).toBe(false);
  });

  it('stops trailing at start + lockOffset', () => {
    const r = evaluatePropFirm([closed('2026-08-03', 4000)], apex(), { now: NOW });
    expect(r.drawdown.floor).toBe(50100);
    expect(r.drawdown.locked).toBe(true);
  });

  it('a new peak is never itself a breach', () => {
    const r = evaluatePropFirm([closed('2026-08-03', 100), closed('2026-08-04', 100)], apex(), { now: NOW });
    expect(r.drawdown.breached).toBe(false);
  });

  it('live open P&L counts against the floor', () => {
    const r = evaluatePropFirm([closed('2026-08-20', -2000)], apex(), { now: NOW, unrealizedPnl: -600 });
    expect(r.equity).toBe(47400);
    expect(r.drawdown.breached).toBe(true);
  });
});

describe('evaluatePropFirm — consistency', () => {
  const cfg = ftmo({ minTradingDays: 0, consistencyPct: 50, profitTarget: { value: 3000, unit: 'usd' }, accountSize: 50000 });

  it('flags a single day holding more than the allowed share', () => {
    const trades = [closed('2026-08-03', 2500), closed('2026-08-04', 600)];
    const r = evaluatePropFirm(trades, cfg, { now: NOW });
    expect(r.consistency.bestDayPnl).toBe(2500);
    expect(r.consistency.bestDayKey).toBe('2026-08-03');
    expect(r.consistency.sharePct).toBeCloseTo((2500 / 3100) * 100);
    expect(r.consistency.ok).toBe(false);
    expect(r.consistency.requiredTotalUsd).toBe(5000);
    // Target reached, but consistency blocks the pass.
    expect(r.target.reached).toBe(true);
    expect(r.status).toBe('warning');
    expect(r.pending).toEqual(['consistency']);
  });

  it('passes once profit is spread enough', () => {
    const trades = [closed('2026-08-03', 1500), closed('2026-08-04', 1000), closed('2026-08-05', 1000)];
    const r = evaluatePropFirm(trades, cfg, { now: NOW });
    expect(r.consistency.ok).toBe(true);
    expect(r.status).toBe('passed');
  });

  it('is not applicable while the account is not in profit', () => {
    const r = evaluatePropFirm([closed('2026-08-03', 500), closed('2026-08-04', -900)], cfg, { now: NOW });
    expect(r.consistency.ok).toBeNull();
    expect(r.consistency.sharePct).toBeNull();
    expect(r.status).toBe('on_track');
  });

  it('measures whole days (two trades on one day form one day)', () => {
    const trades = [closed('2026-08-03', 1000, '09:00:00'), closed('2026-08-03', 1000, '15:00:00'), closed('2026-08-04', 2000)];
    const r = evaluatePropFirm(trades, cfg, { now: NOW });
    expect(r.consistency.bestDayPnl).toBe(2000);
    expect(r.consistency.sharePct).toBeCloseTo(50);
    expect(r.consistency.ok).toBe(true);
  });
});

describe('evaluatePropFirm — robustness', () => {
  it('survives dirty rows (NaN P&L, missing dates, Firestore timestamps)', () => {
    const ts = { toDate: () => new Date('2026-08-04T12:00:00') };
    const trades = [
      null,
      { status: 'closed', netPnl: 'abc', exitDate: '2026-08-03T10:00:00', exitPrice: 1 },
      { status: 'closed', netPnl: 500 }, // no date at all → skipped
      { status: 'closed', netPnl: 300, exitDate: ts, exitPrice: 1 },
    ];
    const r = evaluatePropFirm(trades, ftmo(), { now: NOW });
    expect(r.balance).toBe(100300);
    expect(Number.isFinite(r.drawdown.remainingUsd)).toBe(true);
  });

  it('ignores trades dated after "now"', () => {
    const r = evaluatePropFirm([closed('2026-08-25', 5000)], ftmo(), { now: NOW });
    expect(r.balance).toBe(100000);
  });

  it('without a start date every trade counts', () => {
    const r = evaluatePropFirm([closed('2025-01-01', 1000)], ftmo({ startDate: '' }), { now: NOW });
    expect(r.balance).toBe(101000);
  });
});
