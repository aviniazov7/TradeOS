import { describe, expect, it } from 'vitest';
import { createMemoryQuotaNamespace, createQuotaGate } from './aiQuotaActor.js';

const DATE = '2026-10-30';
const NOW = 1_800_000_000_000;
// Minute/hour windows are wide on purpose: this test is about the daily cap
// specifically, which is what a KV read-then-write lets a burst walk past.
const LIMITS = {
  premium: { minute: 1000, hour: 1000, day: 200 },
  freeBurstPerMin: 1000,
  freeDaily: 20,
  imageDaily: 10,
};

function chargeInput(extra = {}) {
  return {
    now: NOW, date: DATE, premium: true, chargeDaily: true, image: false, limits: LIMITS, ...extra,
  };
}

describe('quota gate concurrency', () => {
  it('stops 50 parallel premium charges at the daily 200 cap', async () => {
    let doc = { date: DATE, u: 180, i: 0, m: null, h: null, d: { s: NOW - 1000, c: 180 } };
    const gate = createQuotaGate({
      read: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return doc;
      },
      write: async (next) => {
        await new Promise((r) => setTimeout(r, 1));
        doc = next;
      },
    });
    const results = await Promise.all(
      Array.from({ length: 50 }, () => gate.charge(chargeInput())),
    );
    const allowed = results.filter((r) => r.next);
    const denied = results.filter((r) => r.deny === 'day');
    expect(allowed).toHaveLength(20);
    expect(denied).toHaveLength(30);
    expect(doc.u).toBe(200);
    expect(doc.d.c).toBe(200);
    expect(denied[0]).not.toHaveProperty('next');
  });

  it('stops 50 parallel free charges at the daily 20 cap', async () => {
    const ns = createMemoryQuotaNamespace({ delayMs: 1 });
    const results = await Promise.all(
      Array.from({ length: 50 }, () => ns.getByName('free-user').charge(chargeInput({ premium: false }))),
    );
    expect(results.filter((r) => r.next)).toHaveLength(20);
    expect(results.filter((r) => r.deny === 'daily')).toHaveLength(30);
    const usage = await ns.getByName('free-user').usage(DATE);
    expect(usage).toEqual({ used: 20, imageUsed: 0 });
  });

  it('imports the legacy KV counter once, then increments it', async () => {
    const kv = {
      async get(key, type) {
        expect(key).toBe('aiq:legacy');
        expect(type).toBe('json');
        return { date: DATE, u: 7, i: 1, m: null, h: null, d: null };
      },
    };
    const ns = createMemoryQuotaNamespace({ kv });
    const plan = await ns.getByName('legacy').charge(chargeInput());
    expect(plan.next.u).toBe(8);
    expect(plan.next.i).toBe(1);
    const again = await ns.getByName('legacy').charge(chargeInput());
    expect(again.next.u).toBe(9);
  });

  it('refunds a charged question without touching the rate window', async () => {
    const ns = createMemoryQuotaNamespace();
    const stub = ns.getByName('refund-user');
    const charged = await stub.charge(chargeInput({ premium: false }));
    expect(charged.next.u).toBe(1);
    const refunded = await stub.refund({ date: DATE, daily: true, image: false });
    expect(refunded.next.u).toBe(0);
    expect(refunded.next.m.c).toBe(1);
    expect(await stub.usage(DATE)).toEqual({ used: 0, imageUsed: 0 });
  });
});
