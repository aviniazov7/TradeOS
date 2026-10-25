// One-shot backfill of marketingEmails for existing accounts.
// Pure planning + a tiny runner so tests don't need Firestore. index.js wires
// the real list/commit. Explicit true/false is never included in `subscribe`.
import { shouldBackfillMarketingEmail, normalizeMarketingEmails, createdAtMillis } from './marketingConsent.js';

export const BACKFILL_KV_KEY = 'marketing-email-backfill:v1';

export function planMarketingBackfill(docs, cutoffMs) {
  const subscribe = [];
  const counts = { scanned: 0, subscribe: 0, keptOn: 0, keptOptOut: 0, keptUnset: 0 };
  for (const doc of docs || []) {
    counts.scanned += 1;
    const fields = doc?.fields || {};
    const uid = doc?.uid || (typeof doc?.name === 'string' ? doc.name.split('/').pop() : '');
    const marketingEmails = normalizeMarketingEmails(
      fields.marketingEmails !== undefined ? fields.marketingEmails : doc?.marketingEmails,
    );
    const createdAtMs = createdAtMillis(
      fields.createdAt !== undefined ? fields.createdAt : (doc?.createdAtMs ?? doc?.createdAt),
    );
    if (marketingEmails === true) { counts.keptOn += 1; continue; }
    if (marketingEmails === false) { counts.keptOptOut += 1; continue; }
    if (shouldBackfillMarketingEmail({ marketingEmails: null, createdAtMs }, cutoffMs)) {
      if (uid) subscribe.push(uid);
      counts.subscribe += 1;
    } else {
      counts.keptUnset += 1;
    }
  }
  return { subscribe, counts };
}

/** Firestore documents:batchWrite entries. Field mask so nothing else is touched. */
export function marketingSubscribeWrites(uids, { projectId, nowIso }) {
  return (uids || []).map((uid) => ({
    update: {
      name: `projects/${projectId}/databases/(default)/documents/users/${uid}`,
      fields: {
        marketingEmails: { booleanValue: true },
        marketingEmailsAt: { timestampValue: nowIso },
      },
    },
    updateMask: { fieldPaths: ['marketingEmails', 'marketingEmailsAt'] },
  }));
}

/**
 * alreadyDone / markDone talk to KV. listAll returns user docs. commit receives
 * uids to set true. A failed list or commit does not mark the job done.
 */
export async function runMarketingEmailBackfill({ alreadyDone, markDone, listAll, commit, cutoffMs } = {}) {
  if (await alreadyDone?.()) return { ok: true, skipped: 'done', updated: 0 };
  const docs = await listAll();
  const plan = planMarketingBackfill(docs, cutoffMs);
  if (plan.subscribe.length) await commit(plan.subscribe);
  await markDone?.();
  return { ok: true, skipped: null, updated: plan.subscribe.length, ...plan.counts };
}
