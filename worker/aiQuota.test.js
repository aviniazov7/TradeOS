import { describe, it, expect } from 'vitest';
import {
  rollWindow, normalizeQuotaDoc, planAiCharge, planAiRefund, quotaUsage,
  createWindowCounters, createStatBuffer, mergeStat, AI_WINDOW_MS,
} from './aiQuota';

const LIMITS = { premium: { minute: 5, hour: 50, day: 200 }, freeBurstPerMin: 20, freeDaily: 20, imageDaily: 10 };
const DATE = '2026-10-07';
const NOW = 1_800_000_000_000;
const base = { now: NOW, date: DATE, limits: LIMITS };

// Apply n allowed charges in a row, returning the final doc.
function chargeN(n, opts, start = null) {
  let doc = start;
  for (let k = 0; k < n; k++) {
    const r = planAiCharge(doc, { ...base, ...opts });
    expect(r.next).toBeTruthy();
    doc = r.next;
  }
  return doc;
}

describe('rollWindow', () => {
  it('starts a fresh window when none / expired', () => {
    expect(rollWindow(null, NOW, 60_000)).toEqual({ s: NOW, c: 1 });
    expect(rollWindow({ s: NOW - 60_000, c: 9 }, NOW, 60_000)).toEqual({ s: NOW, c: 1 });
  });
  it('accumulates inside the window', () => {
    expect(rollWindow({ s: NOW - 1000, c: 3 }, NOW, 60_000)).toEqual({ s: NOW - 1000, c: 4 });
  });
});

describe('normalizeQuotaDoc', () => {
  it('resets daily counters on a new day but keeps the rolling windows', () => {
    const d = normalizeQuotaDoc({ date: '2026-10-06', u: 7, i: 2, d: { s: NOW - 1000, c: 7 } }, DATE);
    expect(d.u).toBe(0);
    expect(d.i).toBe(0);
    expect(d.d).toEqual({ s: NOW - 1000, c: 7 });
  });
  it('tolerates junk', () => {
    expect(normalizeQuotaDoc('x', DATE)).toMatchObject({ date: DATE, u: 0, i: 0 });
    expect(normalizeQuotaDoc({ date: DATE, u: -3, i: 'a' }, DATE)).toMatchObject({ u: 0, i: 0 });
  });
});

describe('planAiCharge — free tier', () => {
  it('charges the daily counter and allows up to the daily limit', () => {
    const doc = chargeN(20, { premium: false, chargeDaily: true });
    expect(doc.u).toBe(20);
    // a minute later (outside the burst window) the daily cap is what bites
    const r = planAiCharge(doc, { ...base, now: NOW + AI_WINDOW_MS.minute, premium: false, chargeDaily: true });
    expect(r).toEqual({ deny: 'daily' });
  });
  it('enforces the per-minute burst cap', () => {
    const doc = chargeN(20, { premium: false, chargeDaily: false });
    expect(planAiCharge(doc, { ...base, premium: false })).toEqual({ deny: 'burst' });
    // ...and the burst window resets after a minute
    expect(planAiCharge(doc, { ...base, now: NOW + AI_WINDOW_MS.minute, premium: false }).next).toBeTruthy();
  });
  it('refuses images for free users before touching any quota', () => {
    expect(planAiCharge(null, { ...base, premium: false, chargeDaily: true, image: true })).toEqual({ deny: 'imagePremium' });
  });
  it('rate-gate-only charge (coach) does not touch the daily counter', () => {
    const doc = chargeN(3, { premium: false });
    expect(doc.u).toBe(0);
    expect(doc.m.c).toBe(3);
  });
});

describe('planAiCharge — premium', () => {
  it('soft caps: 5/min', () => {
    const doc = chargeN(5, { premium: true, chargeDaily: true });
    expect(planAiCharge(doc, { ...base, premium: true, chargeDaily: true })).toEqual({ deny: 'minute' });
  });
  it('soft caps: 50/hour', () => {
    let doc = null;
    for (let k = 0; k < 50; k++) {
      const r = planAiCharge(doc, { ...base, now: NOW + k * 61_000, premium: true, chargeDaily: true });
      doc = r.next;
    }
    expect(planAiCharge(doc, { ...base, now: NOW + 50 * 61_000, premium: true })).toEqual({ deny: 'hour' });
  });
  it('soft caps: 200/day (rolling)', () => {
    const doc = { date: DATE, u: 200, i: 0, m: null, h: null, d: { s: NOW - 1000, c: 200 } };
    expect(planAiCharge(doc, { ...base, premium: true, chargeDaily: true })).toEqual({ deny: 'day' });
  });
  it('premium is never blocked by the free daily limit', () => {
    const doc = { date: DATE, u: 150, i: 0, m: null, h: null, d: null };
    const r = planAiCharge(doc, { ...base, premium: true, chargeDaily: true });
    expect(r.next.u).toBe(151);
  });
  it('image quota: 10/day, charged together with the text counter', () => {
    const doc = { date: DATE, u: 4, i: 9, m: null, h: null, d: null };
    const ok = planAiCharge(doc, { ...base, premium: true, chargeDaily: true, image: true });
    expect(ok.next).toMatchObject({ u: 5, i: 10 });
    expect(planAiCharge(ok.next, { ...base, now: NOW + 120_000, premium: true, chargeDaily: true, image: true }))
      .toEqual({ deny: 'imageQuota' });
  });
  it('rate windows are checked before the image quota (original order)', () => {
    const doc = chargeN(5, { premium: true });
    expect(planAiCharge({ ...doc, i: 10 }, { ...base, premium: true, image: true })).toEqual({ deny: 'minute' });
  });
});

describe('planAiRefund', () => {
  it('refunds daily and image counters, not the rate windows', () => {
    const doc = { date: DATE, u: 3, i: 1, m: { s: NOW, c: 3 }, h: null, d: null };
    const r = planAiRefund(doc, { date: DATE, daily: true, image: true });
    expect(r).toMatchObject({ u: 2, i: 0, m: { s: NOW, c: 3 } });
  });
  it('is a no-op (null) for another day or zero counters', () => {
    expect(planAiRefund({ date: '2026-10-06', u: 3 }, { date: DATE, daily: true })).toBeNull();
    expect(planAiRefund({ date: DATE, u: 0, i: 0 }, { date: DATE, daily: true, image: true })).toBeNull();
    expect(planAiRefund(null, { date: DATE, daily: true })).toBeNull();
  });
});

describe('quotaUsage', () => {
  it('reads today, zero for a stale doc', () => {
    expect(quotaUsage({ date: DATE, u: 4, i: 2 }, DATE)).toEqual({ used: 4, imageUsed: 2 });
    expect(quotaUsage({ date: '2026-10-01', u: 4, i: 2 }, DATE)).toEqual({ used: 0, imageUsed: 0 });
  });
});

describe('createWindowCounters', () => {
  it('counts within a window and resets after it', () => {
    const c = createWindowCounters();
    expect(c.bump('k', 1000, 0)).toEqual({ s: 0, c: 1 });
    expect(c.bump('k', 1000, 500)).toEqual({ s: 0, c: 2 });
    expect(c.peek('k', 1000, 900)).toBe(2);
    expect(c.peek('k', 1000, 1000)).toBe(0);
    expect(c.bump('k', 1000, 1000)).toEqual({ s: 1000, c: 1 });
  });
  it('a higher shared count wins and keeps ITS window start', () => {
    const c = createWindowCounters();
    expect(c.bump('k', 1000, 500, { s: 100, c: 41 })).toEqual({ s: 100, c: 42 });
    // the shared window expires on schedule (start 100 + 1000)
    expect(c.bump('k', 1000, 1100)).toEqual({ s: 1100, c: 1 });
  });
  it('ignores an expired shared window', () => {
    const c = createWindowCounters();
    expect(c.bump('k', 1000, 2000, { s: 0, c: 99 })).toEqual({ s: 2000, c: 1 });
  });
  it('is bounded', () => {
    const c = createWindowCounters(3);
    ['a', 'b', 'c', 'd'].forEach((k) => c.bump(k, 1000, 0));
    expect(c.peek('a', 1000, 0)).toBe(0);
    expect(c.peek('d', 1000, 0)).toBe(1);
  });
});

describe('createStatBuffer', () => {
  it('flushes the first add immediately, then at most once per interval', () => {
    const b = createStatBuffer(1000);
    b.add(DATE, { text: 1, tokIn: 10 });
    expect(b.take(5000)).toEqual({ [DATE]: { text: 1, image: 0, tokIn: 10, tokOut: 0 } });
    b.add(DATE, { text: 1, tokOut: 5 });
    b.add(DATE, { text: 1, image: 1 });
    expect(b.take(5500)).toBeNull();
    expect(b.take(6000)).toEqual({ [DATE]: { text: 2, image: 1, tokIn: 0, tokOut: 5 } });
    expect(b.take(9000)).toBeNull(); // nothing pending
  });
  it('force flushes and restore re-queues a failed write', () => {
    const b = createStatBuffer(1000);
    b.add(DATE, { text: 1 });
    const first = b.take(0, true);
    b.restore(first);
    expect(b.take(10, true)).toEqual(first);
  });
});

describe('mergeStat', () => {
  it('adds deltas onto a stored (possibly missing) value', () => {
    expect(mergeStat(null, { text: 2, tokIn: 5 })).toEqual({ text: 2, image: 0, tokIn: 5, tokOut: 0 });
    expect(mergeStat({ text: 1, image: 1, tokIn: 1, tokOut: 1 }, { text: 1, tokOut: 2 }))
      .toEqual({ text: 2, image: 1, tokIn: 1, tokOut: 3 });
  });
});
