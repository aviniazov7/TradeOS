import { describe, it, expect } from 'vitest';
import { superviseRisk } from './riskSupervisor';
import { pickActivePlan } from './pickActivePlan';

// The supervisor is the one part of the analyst that is meant to be acted on
// within the minute, so a wrong or missing finding here is worse than anywhere
// else in the feature. `now` is injected so the day boundary is deterministic.

const NOW = new Date('2026-08-20T15:00:00');
const open = (o) => ({ status: 'open', ...o });
const closed = (o) => ({ status: 'closed', exitPrice: 100, ...o });

describe('superviseRisk', () => {
  it('flags an open book over the plan cap as critical', () => {
    const trades = [
      open({ id: 'a', pair: 'BTCUSDT', stopLoss: 90 }),
      open({ id: 'b', pair: 'ETHUSDT', stopLoss: 90 }),
      open({ id: 'c', pair: 'SOLUSDT', stopLoss: 90 }),
    ];
    const r = superviseRisk(trades, { maxPositions: 2 }, { now: NOW });
    const f = r.findings.find((x) => x.id === 'positions-over');
    expect(f.severity).toBe('critical');
    expect(f.evidence).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    expect(r.openCount).toBe(3);
  });

  it('warns at the cap without claiming a breach', () => {
    const trades = [open({ id: 'a', pair: 'BTCUSDT', stopLoss: 90 }), open({ id: 'b', pair: 'ETHUSDT', stopLoss: 90 })];
    const r = superviseRisk(trades, { maxPositions: 2 }, { now: NOW });
    expect(r.findings.find((x) => x.id === 'positions-over')).toBeUndefined();
    expect(r.findings.find((x) => x.id === 'positions-at-limit').severity).toBe('warning');
  });

  it('counts only today toward the daily loss cap', () => {
    const trades = [
      closed({ id: 'y', exitDate: '2026-08-19T12:00:00', netPnl: -5000 }), // yesterday, must not count
      closed({ id: 't1', exitDate: '2026-08-20T10:00:00', netPnl: -400 }),
      closed({ id: 't2', exitDate: '2026-08-20T12:00:00', netPnl: -100 }),
    ];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.realizedToday).toBe(-500);
    const f = r.findings.find((x) => x.id === 'daily-loss-over');
    expect(f.severity).toBe('critical');
    expect(f.title).toContain('$500.00');
    expect(f.title).toContain('$300.00');
  });

  it('warns before the cap is crossed, not only after', () => {
    const trades = [closed({ id: 't1', exitDate: '2026-08-20T10:00:00', netPnl: -240 })];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.findings.find((x) => x.id === 'daily-loss-near').severity).toBe('warning');
  });

  it('does not invent a daily limit when the journal has no balance', () => {
    const trades = [closed({ id: 't1', exitDate: '2026-08-20T10:00:00', netPnl: -9000 })];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 0, now: NOW });
    expect(r.findings.find((x) => x.id === 'daily-loss-over')).toBeUndefined();
    expect(r.findings.find((x) => x.id === 'daily-loss-unmeasurable').severity).toBe('info');
  });

  it('treats an open position with no stop as critical', () => {
    const r = superviseRisk([open({ id: 'a', pair: 'BTCUSDT' })], null, { now: NOW });
    const f = r.findings.find((x) => x.id === 'no-stop');
    expect(f.severity).toBe('critical');
    expect(r.stoplessPositions).toBe(1);
  });

  it('does not treat a missing field as an off-plan breach', () => {
    // An empty session is missing data, not evidence of indiscipline.
    const trades = [
      open({ id: 'a', pair: 'BTCUSDT', session: '', stopLoss: 90 }),
      open({ id: 'b', pair: 'BTCUSDT', session: 'Asia', stopLoss: 90 }),
    ];
    const r = superviseRisk(trades, { pairs: ['BTCUSDT'], sessions: ['London'] }, { now: NOW });
    const f = r.findings.find((x) => x.id === 'off-plan-sessions');
    expect(f.evidence).toEqual(['Asia']);
    expect(f.title).toContain('פוזיציה פתוחה אחת');
    expect(f.title).toContain('מחוץ לסשנים'); // never "מחוץ להסשנים"
    expect(f.title).not.toContain('לה');
    expect(r.findings.find((x) => x.id === 'off-plan-pairs')).toBeUndefined();
  });

  it('treats positionSize as notional USD, not a unit count', () => {
    // positionSize is persisted as entryPrice x quantity (useTrades.buildTradeDoc).
    // Reading it as units multiplied the answer by entryPrice — on a BTC trade
    // that is a 100,000x error driving a false critical alert.
    const trades = [open({ id: 'a', pair: 'BTCUSDT', entryPrice: 100, stopLoss: 95, positionSize: 200 })];
    const r = superviseRisk(trades, null, { accountBalance: 1000, now: NOW });
    expect(r.openRiskUsd).toBe(10); // 2 units x $5
    expect(r.openRiskPct).toBe(1);
  });

  it('prices a real BTC position correctly', () => {
    const trades = [open({ id: 'a', pair: 'BTCUSDT', entryPrice: 100000, stopLoss: 99000, positionSize: 10000 })];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.openRiskUsd).toBe(100); // 0.1 BTC x $1,000
    expect(r.openRiskPct).toBe(1);
    expect(r.findings.find((x) => x.id === 'exposure-over-daily-cap')).toBeUndefined();
  });

  it('prices a futures position through the notional, not the contract count', () => {
    // quantity holds the bare contract count with pointValue stripped out, so
    // using it directly would understate ES risk by the point value.
    const trades = [open({
      id: 'es', assetClass: 'futures_cme', entryPrice: 5000, stopLoss: 4990,
      positionSize: 500000, quantity: 2,
    })];
    const r = superviseRisk(trades, null, { now: NOW });
    expect(r.openRiskUsd).toBe(1000); // 10 pts x 50 pointValue x 2 contracts
  });

  it('prefers the live stop over the risk declared at entry', () => {
    // riskAmount is captured at entry and TradeForm keeps it on edit, so a
    // position moved to breakeven would keep reporting risk it no longer carries.
    const trades = [open({
      id: 'a', pair: 'BTCUSDT', entryPrice: 100, stopLoss: 100, positionSize: 1000, riskAmount: 500,
    })];
    const r = superviseRisk(trades, null, { accountBalance: 10000, now: NOW });
    expect(r.openRiskUsd).toBe(0);
  });

  it('counts a stop trailed into profit as zero risk, not |entry − stop|', () => {
    const trades = [
      open({ id: 'l', pair: 'BTCUSDT', direction: 'long', entryPrice: 100, stopLoss: 110, positionSize: 1000 }),
      open({ id: 's', pair: 'ETHUSDT', direction: 'short', entryPrice: 100, stopLoss: 90, positionSize: 1000 }),
    ];
    const r = superviseRisk(trades, null, { accountBalance: 10000, now: NOW });
    expect(r.openRiskUsd).toBe(0);
  });

  it('prices a short on the right side of entry', () => {
    const trades = [open({ id: 's', pair: 'ETHUSDT', direction: 'short', entryPrice: 100, stopLoss: 105, positionSize: 1000 })];
    expect(superviseRisk(trades, null, { now: NOW }).openRiskUsd).toBe(50); // 10 units × $5
  });

  it('only the size still open after partial exits is at risk', () => {
    // TP1 took 60% off: 10 units × $10 × 40% = $40.
    const trades = [open({
      id: 'p', status: 'partial', pair: 'BTCUSDT', direction: 'long', entryPrice: 100, stopLoss: 90,
      positionSize: 1000, exits: [{ price: 120, percent: 60 }],
    })];
    expect(superviseRisk(trades, null, { now: NOW }).openRiskUsd).toBe(40);
  });

  it('scales a declared risk by the open fraction too', () => {
    const trades = [open({ id: 'd', pair: 'BTCUSDT', riskAmount: 100, exits: [{ price: 120, percent: 50 }] })];
    expect(superviseRisk(trades, null, { now: NOW }).openRiskUsd).toBe(50);
  });

  it('reports open risk pct as null rather than 0 when no balance is on file', () => {
    // "nothing at risk" and "we cannot say" must not render the same.
    const r = superviseRisk([open({ id: 'a', riskAmount: 50, stopLoss: 90 })], null, { now: NOW });
    expect(r.openRiskPct).toBeNull();
    expect(r.openRiskUsd).toBe(50);
  });

  it('separates "no stop" from "has a stop we cannot price"', () => {
    // The tile used to merge these, so it could claim "1 בלי סטופ" about a
    // position that had one, contradicting the finding rendered right below it.
    const trades = [
      open({ id: 'nostop', pair: 'BTCUSDT' }),
      open({ id: 'unsized', pair: 'ETHUSDT', stopLoss: 90 }),
    ];
    const r = superviseRisk(trades, null, { now: NOW });
    expect(r.stoplessPositions).toBe(1);
    expect(r.unsizedPositions).toBe(1);
    expect(r.findings.find((x) => x.id === 'no-stop').evidence).toEqual(['BTCUSDT']);
  });

  it('counts partial exits booked today toward the daily loss cap', () => {
    // A partial is still open, but the legs already sold are realized money and
    // the daily cap is a hard stop-trading rule.
    const trades = [
      { id: 'p1', status: 'partial', pair: 'BTCUSDT', exitDate: '2026-08-20T10:00:00', netPnl: -400 },
      { id: 'p2', status: 'partial', pair: 'ETHUSDT', exitDate: '2026-08-20T11:00:00', netPnl: -400 },
    ];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.realizedToday).toBe(-800);
    expect(r.partialTodayCount).toBe(2);
    expect(r.findings.find((x) => x.id === 'daily-loss-over').severity).toBe('critical');
  });

  it('adds the loss already realized today to the worst-case exposure', () => {
    const trades = [
      closed({ id: 'c', exitDate: '2026-08-20T09:00:00', netPnl: -200 }),
      open({ id: 'o', pair: 'BTCUSDT', entryPrice: 100, stopLoss: 95, positionSize: 3000 }), // $150 risk
    ];
    // $200 booked + $150 at risk = $350 against a $300 cap. Neither half alone
    // breaches it.
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.findings.find((x) => x.id === 'exposure-over-daily-cap').severity).toBe('critical');
  });

  it('flags open risk that already exceeds the daily cap', () => {
    const trades = [
      open({ id: 'a', pair: 'BTCUSDT', riskAmount: 250 }),
      open({ id: 'b', pair: 'ETHUSDT', riskAmount: 250 }),
    ];
    const r = superviseRisk(trades, { maxDailyLoss: 3 }, { accountBalance: 10000, now: NOW });
    expect(r.findings.find((x) => x.id === 'exposure-over-daily-cap').severity).toBe('critical');
  });

  it('is clean and honest when there is no plan', () => {
    const r = superviseRisk([open({ id: 'a', pair: 'BTCUSDT', stopLoss: 90 })], null, { now: NOW });
    expect(r.hasPlan).toBe(false);
    expect(r.findings).toHaveLength(0);
  });

  it('sorts critical above warning above info', () => {
    const trades = [
      open({ id: 'a', pair: 'DOGEUSDT' }),  // no stop -> critical, off-plan pair -> warning
      closed({ id: 't', exitDate: '2026-08-20T10:00:00', netPnl: -10 }),
    ];
    const r = superviseRisk(trades, { pairs: ['BTCUSDT'], maxDailyLoss: 3 }, { accountBalance: 0, now: NOW });
    const order = r.findings.map((f) => f.severity);
    expect(order).toEqual([...order].sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a] - { critical: 0, warning: 1, info: 2 }[b])));
    expect(order[0]).toBe('critical');
  });
});

describe('pickActivePlan', () => {
  it('prefers the most recently updated active plan over doc order', () => {
    const plans = [
      { id: 'zzz', isActive: true, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'aaa', isActive: true, updatedAt: '2026-08-01T00:00:00Z' },
    ];
    expect(pickActivePlan(plans).id).toBe('aaa');
  });

  it('handles Firestore Timestamps', () => {
    const ts = (iso) => ({ toDate: () => new Date(iso) });
    const plans = [
      { id: 'old', isActive: true, updatedAt: ts('2026-01-01T00:00:00Z') },
      { id: 'new', isActive: true, updatedAt: ts('2026-08-01T00:00:00Z') },
    ];
    expect(pickActivePlan(plans).id).toBe('new');
  });

  it('falls back to inactive plans rather than returning nothing', () => {
    expect(pickActivePlan([{ id: 'a', isActive: false }]).id).toBe('a');
  });

  it('is stable when nothing has a timestamp', () => {
    const plans = [{ id: 'b', isActive: true }, { id: 'a', isActive: true }];
    expect(pickActivePlan(plans).id).toBe('a');
    expect(pickActivePlan([...plans].reverse()).id).toBe('a');
  });

  it('returns null for an empty or invalid list', () => {
    expect(pickActivePlan([])).toBeNull();
    expect(pickActivePlan(null)).toBeNull();
  });
});
