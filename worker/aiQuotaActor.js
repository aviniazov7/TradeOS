// Serialized AI-quota gate. planAiCharge / planAiRefund stay pure; this is
// the lock around them. A Durable Object (one per user) and the in-memory
// test double both use it. The lock is held across awaits on purpose: the
// legacy KV path awaited a read, then a write, and parallel requests all
// observed the same counter.

import { planAiCharge, planAiRefund, quotaUsage } from './aiQuota.js';

export function createQuotaGate({ read, write, seed, clear }) {
  let tail = Promise.resolve();

  function exclusive(fn) {
    const run = tail.then(() => fn());
    // Keep the chain alive if fn throws — the next caller must still run.
    tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async function ready(uid) {
    if (!seed) return null;
    const status = await seed(uid);
    if (status?.error) return { deny: 'unavailable' };
    return null;
  }

  return {
    charge(input) {
      return exclusive(async () => {
        const blocked = await ready(input?.uid);
        if (blocked) return blocked;
        const doc = await read();
        const plan = planAiCharge(doc, input);
        // A denial is not persisted: the rolled window in `plan` is discarded
        // so a rejected burst doesn't burn a slot. Same rule as before.
        if (plan.next) await write(plan.next);
        return plan;
      });
    },
    refund(input) {
      return exclusive(async () => {
        const blocked = await ready(input?.uid);
        if (blocked) return blocked;
        const doc = await read();
        const next = planAiRefund(doc, input);
        if (next) await write(next);
        return { next };
      });
    },
    usage(input) {
      const date = typeof input === 'string' ? input : input?.date;
      const uid = typeof input === 'object' && input ? input.uid : undefined;
      return exclusive(async () => {
        const blocked = await ready(uid);
        if (blocked) {
          const err = new Error('quota unavailable');
          err.quotaUnavailable = true;
          throw err;
        }
        return quotaUsage(await read(), date);
      });
    },
    wipe() {
      return exclusive(async () => {
        if (clear) await clear();
        else await write(null);
      });
    },
  };
}

// In-memory namespace with the same shape as env.AI_QUOTA. `delayMs` widens
// the read/write gap so a dropped lock fails a concurrency test instead of
// hiding behind single-threaded luck.
export function createMemoryQuotaNamespace({ kv = null, delayMs = 0 } = {}) {
  const gates = new Map();
  const pause = () => (delayMs > 0
    ? new Promise((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve());

  function forUid(uid) {
    let gate = gates.get(uid);
    if (gate) return gate;
    let doc = null;
    let seeded = false;
    gate = createQuotaGate({
      read: async () => {
        await pause();
        return doc;
      },
      write: async (next) => {
        await pause();
        doc = next;
      },
      seed: async () => {
        if (seeded || doc) {
          seeded = true;
          return null;
        }
        if (!kv?.get) {
          seeded = true;
          return null;
        }
        let fromKv = null;
        try {
          fromKv = await kv.get(`aiq:${uid}`, 'json');
        } catch {
          return { error: true };
        }
        if (!doc && fromKv && typeof fromKv === 'object' && !Array.isArray(fromKv)) doc = fromKv;
        seeded = true;
        return null;
      },
      clear: async () => {
        doc = null;
        seeded = true;
      },
    });
    const api = {
      charge: (input) => gate.charge({ ...input, uid: input?.uid || uid }),
      refund: (input) => gate.refund({ ...input, uid: input?.uid || uid }),
      usage: (input) => gate.usage(typeof input === 'string' ? { date: input, uid } : { ...input, uid: input?.uid || uid }),
      wipe: () => gate.wipe(),
    };
    gates.set(uid, api);
    return api;
  }

  return {
    getByName(name) {
      return forUid(String(name || ''));
    },
  };
}
