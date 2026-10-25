// One-shot backfill of marketingEmails for existing accounts.
// Pure planning + a tiny runner so tests don't need Firestore. index.js wires
// the real list/commit. Explicit true/false is never included in `subscribe`.
import { normalizeMarketingEmails } from './marketingConsent.js';

export const BACKFILL_KV_KEY = 'marketing-email-backfill:v1';

function docUid(doc) {
  return doc?.uid || (typeof doc?.name === 'string' ? doc.name.split('/').pop() : '');
}

function docChoice(doc) {
  const fields = doc?.fields || {};
  return normalizeMarketingEmails(
    fields.marketingEmails !== undefined ? fields.marketingEmails : doc?.marketingEmails,
  );
}

// `docs` is the snapshot of profiles that exist when the scan runs. Anyone
// created after listAll returns is not in it. A stored true/false is kept.
export function planMarketingBackfill(docs) {
  const subscribe = [];
  const counts = { scanned: 0, subscribe: 0, keptOn: 0, keptOptOut: 0 };
  for (const doc of docs || []) {
    counts.scanned += 1;
    const uid = docUid(doc);
    const marketingEmails = docChoice(doc);
    if (marketingEmails === true) { counts.keptOn += 1; continue; }
    if (marketingEmails === false) { counts.keptOptOut += 1; continue; }
    if (uid) subscribe.push(uid);
    counts.subscribe += 1;
  }
  return { subscribe, counts };
}

/** Uids from a fresh read that still have no choice. A bool saved since the scan is dropped. */
export function uidsStillMissingChoice(docs) {
  const missing = [];
  for (const doc of docs || []) {
    const uid = docUid(doc);
    if (uid && docChoice(doc) === null) missing.push(uid);
  }
  return missing;
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
export async function runMarketingEmailBackfill({ alreadyDone, markDone, listAll, commit } = {}) {
  if (await alreadyDone?.()) return { ok: true, skipped: 'done', updated: 0 };
  const docs = await listAll();
  const plan = planMarketingBackfill(docs);
  if (plan.subscribe.length) await commit(plan.subscribe);
  await markDone?.();
  return { ok: true, skipped: null, updated: plan.subscribe.length, ...plan.counts };
}
