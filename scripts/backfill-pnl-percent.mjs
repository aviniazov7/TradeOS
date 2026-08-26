#!/usr/bin/env node
/**
 * One-off backfill: recompute pnlPercent on existing trades from NET P&L.
 *
 * WHY THIS EXISTS
 * pnlPercent used to be measured on GROSS P&L, which overstated every trade by
 * its own cost — 4.53% where the exchange showed 3.34%. Trades written after
 * that fix store the net figure. Nothing recomputes the field on read, so
 * without this script the journal shows both conventions side by side, in the
 * same column, under the same label, with no way to tell them apart. Two trades
 * with identical economics read differently depending only on when they were
 * imported.
 *
 * It is also the only way to avoid the worse version of that: an old trade's
 * percentage changes on its own the first time the user edits an unrelated
 * field, because saving routes through computeTradeFields. That reads as data
 * loss even though the new number is the correct one.
 *
 * SAFETY
 * Firestore is SHARED between production and staging in this project (see
 * CLAUDE.md), so there is no rehearsal environment. Accordingly:
 *   - Dry run is the DEFAULT. It writes nothing and prints every change.
 *   - --apply is required to write, and it asks for confirmation.
 *   - Only pnlPercent is touched. Nothing else in the document is read back,
 *     recomputed or rewritten — in particular pnl, netPnl and fees are left
 *     exactly as they are, so a bad run cannot destroy the inputs.
 *   - A trade whose new value is within 0.0001pp of the old one is skipped, so
 *     re-running is a no-op and an interrupted run can simply be re-run.
 *   - Every write is logged to a JSON file before it is sent, so the previous
 *     values are recoverable without a Firestore export.
 *
 * USAGE
 *   npm --prefix functions i           # firebase-admin lives there
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   node scripts/backfill-pnl-percent.mjs                 # dry run, prints
 *   node scripts/backfill-pnl-percent.mjs --uid <uid>     # one user only
 *   node scripts/backfill-pnl-percent.mjs --apply         # writes
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const require = createRequire(import.meta.url);
let admin;
try {
  admin = require('../functions/node_modules/firebase-admin/lib/index.js');
} catch {
  console.error('firebase-admin not found. Run:  npm --prefix functions i');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_UID = args[args.indexOf('--uid') + 1] || null;
const hasUid = args.includes('--uid');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path.');
  process.exit(1);
}

// Mirrors src/utils/calculations.js. Deliberately duplicated rather than
// imported: this script must keep computing what the app computed on the day it
// was written, even if the app's definition changes again later.
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
function newPercent(t) {
  const pnl = num(t.pnl);
  const netPnl = Number.isFinite(parseFloat(t.netPnl)) ? num(t.netPnl) : pnl - num(t.fees);
  const isFutures = t.assetClass === 'futures_cme' && t.contract;
  if (isFutures) {
    const notional = num(t.entryPrice) * num(t.contract.pointValue) * num(t.contract.contracts);
    return notional ? (netPnl / notional) * 100 : 0;
  }
  const entry = num(t.entryPrice);
  const qty = num(t.quantity);
  if (!entry || !qty) return null;          // cannot recompute — leave it alone
  const lev = num(t.leverage) || 1;
  return (netPnl / (entry * qty)) * 100 * lev;
}

admin.initializeApp({ projectId: 'tradeos-91a58' });
const db = admin.firestore();

const userIds = ONLY_UID && hasUid
  ? [ONLY_UID]
  : (await db.collection('users').select().get()).docs.map((d) => d.id);

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${userIds.length} user(s)\n`);

const changes = [];
let scanned = 0, skipped = 0, unchanged = 0;

for (const uid of userIds) {
  const snap = await db.collection('users').doc(uid).collection('trades').get();
  for (const doc of snap.docs) {
    scanned++;
    const t = doc.data();
    const next = newPercent(t);
    if (next === null) { skipped++; continue; }
    const prev = num(t.pnlPercent);
    if (Math.abs(next - prev) < 0.0001) { unchanged++; continue; }
    changes.push({ uid, id: doc.id, pair: t.pair || '', prev, next });
  }
}

console.log(`scanned ${scanned} · already correct ${unchanged} · not recomputable ${skipped} · to change ${changes.length}\n`);
for (const c of changes.slice(0, 40)) {
  console.log(`  ${c.pair.padEnd(12)} ${c.prev.toFixed(2).padStart(9)}%  →  ${c.next.toFixed(2).padStart(9)}%   ${c.id}`);
}
if (changes.length > 40) console.log(`  … and ${changes.length - 40} more`);

if (!changes.length) process.exit(0);

const logPath = `backfill-pnl-percent-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(logPath, JSON.stringify(changes, null, 2));
console.log(`\nprevious values written to ${logPath}`);

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply to write.');
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`\nWrite ${changes.length} document(s) to PRODUCTION Firestore? [yes/N] `);
rl.close();
if (answer.trim().toLowerCase() !== 'yes') {
  console.log('Aborted. Nothing written.');
  process.exit(0);
}

// Firestore caps a batch at 500 writes.
let written = 0;
for (let i = 0; i < changes.length; i += 400) {
  const batch = db.batch();
  for (const c of changes.slice(i, i + 400)) {
    batch.update(db.collection('users').doc(c.uid).collection('trades').doc(c.id), { pnlPercent: c.next });
  }
  await batch.commit();
  written += Math.min(400, changes.length - i);
  console.log(`  committed ${written}/${changes.length}`);
}
console.log(`\nDone. ${written} document(s) updated. Previous values are in ${logPath}.`);
