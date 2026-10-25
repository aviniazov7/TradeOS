import { describe, it, expect } from 'vitest';
import { planMarketingBackfill, marketingSubscribeWrites, runMarketingEmailBackfill } from './marketingBackfill';
import { MARKETING_CONSENT_CUTOFF_MS } from './marketingConsent';

const BEFORE = new Date(MARKETING_CONSENT_CUTOFF_MS - 86_400_000).toISOString();
const AFTER = new Date(MARKETING_CONSENT_CUTOFF_MS + 86_400_000).toISOString();

const doc = (uid, fields) => ({ name: `projects/p/databases/(default)/documents/users/${uid}`, fields });

describe('planMarketingBackfill', () => {
  it('subscribes only existing users with no choice', () => {
    const plan = planMarketingBackfill([
      doc('old-missing', { createdAt: { timestampValue: BEFORE } }),
      doc('old-null', { marketingEmails: { nullValue: null }, createdAt: { timestampValue: BEFORE } }),
      doc('old-off', { marketingEmails: { booleanValue: false }, createdAt: { timestampValue: BEFORE } }),
      doc('old-on', { marketingEmails: { booleanValue: true }, createdAt: { timestampValue: BEFORE } }),
      doc('new-missing', { createdAt: { timestampValue: AFTER } }),
      doc('legacy-no-date', {}),
    ]);
    expect(plan.subscribe.sort()).toEqual(['legacy-no-date', 'old-missing', 'old-null']);
    expect(plan.counts).toMatchObject({ keptOptOut: 1, keptOn: 1, keptUnset: 1, subscribe: 3 });
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
    const listAll = async () => [doc('old', { createdAt: { timestampValue: BEFORE } }), doc('off', { marketingEmails: { booleanValue: false }, createdAt: { timestampValue: BEFORE } })];
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
      listAll: async () => [doc('old', { createdAt: { timestampValue: BEFORE } })],
      commit: async () => { throw new Error('firestore down'); },
    })).rejects.toThrow('firestore down');
    expect(done).toBe(false);
  });
});
