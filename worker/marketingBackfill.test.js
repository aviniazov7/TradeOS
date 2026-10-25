import { describe, it, expect } from 'vitest';
import { planMarketingBackfill, marketingSubscribeWrites, runMarketingEmailBackfill, uidsStillMissingChoice } from './marketingBackfill';

const doc = (uid, fields) => ({ name: `projects/p/databases/(default)/documents/users/${uid}`, fields });

describe('planMarketingBackfill', () => {
  it('subscribes every profile in the snapshot that has no choice', () => {
    const plan = planMarketingBackfill([
      doc('old-missing', { createdAt: { timestampValue: '2020-01-01T00:00:00.000Z' } }),
      doc('old-null', { marketingEmails: { nullValue: null }, createdAt: { timestampValue: '2026-10-26T00:00:00.000Z' } }),
      doc('old-off', { marketingEmails: { booleanValue: false }, createdAt: { timestampValue: '2020-01-01T00:00:00.000Z' } }),
      doc('old-on', { marketingEmails: { booleanValue: true }, createdAt: { timestampValue: '2020-01-01T00:00:00.000Z' } }),
      doc('signed-up-today', { createdAt: { timestampValue: '2026-10-25T12:00:00.000Z' } }),
      doc('explicit-off-new', { marketingEmails: { booleanValue: false }, createdAt: { timestampValue: '2026-10-25T12:00:00.000Z' } }),
      doc('legacy-no-date', {}),
    ]);
    expect(plan.subscribe.sort()).toEqual(['legacy-no-date', 'old-missing', 'old-null', 'signed-up-today']);
    expect(plan.counts).toMatchObject({ scanned: 7, keptOptOut: 2, keptOn: 1, subscribe: 4 });
  });
});

describe('uidsStillMissingChoice', () => {
  it('drops anyone who stored a bool after the scan', () => {
    expect(uidsStillMissingChoice([
      doc('still', {}),
      doc('just-off', { marketingEmails: { booleanValue: false } }),
      doc('just-on', { marketingEmails: { booleanValue: true } }),
    ]).sort()).toEqual(['still']);
  });
});

describe('marketingSubscribeWrites', () => {
  it('patches only the consent fields to true', () => {
    const [w] = marketingSubscribeWrites(['abc'], { projectId: 'tradeos-91a58', nowIso: '2026-10-25T00:00:00.000Z' });
    expect(w.update.name).toBe('projects/tradeos-91a58/databases/(default)/documents/users/abc');
    expect(w.update.fields.marketingEmails).toEqual({ booleanValue: true });
    expect(w.updateMask.fieldPaths).toEqual(['marketingEmails', 'marketingEmailsAt']);
  });
});

describe('runMarketingEmailBackfill', () => {
  it('writes once and then skips', async () => {
    const committed = [];
    let done = false;
    const listAll = async () => [doc('old', {}), doc('off', { marketingEmails: { booleanValue: false } })];
    const first = await runMarketingEmailBackfill({
      alreadyDone: async () => done,
      markDone: async () => { done = true; },
      listAll,
      commit: async (uids) => { committed.push(...uids); },
    });
    expect(first.updated).toBe(1);
    expect(committed).toEqual(['old']);
    const second = await runMarketingEmailBackfill({
      alreadyDone: async () => done,
      markDone: async () => { done = true; },
      listAll,
      commit: async (uids) => { committed.push(...uids); },
    });
    expect(second.skipped).toBe('done');
    expect(committed).toEqual(['old']);
  });

  it('does not mark done when the write fails', async () => {
    let done = false;
    await expect(runMarketingEmailBackfill({
      alreadyDone: async () => false,
      markDone: async () => { done = true; },
      listAll: async () => [doc('old', {})],
      commit: async () => { throw new Error('firestore down'); },
    })).rejects.toThrow('firestore down');
    expect(done).toBe(false);
  });
});
