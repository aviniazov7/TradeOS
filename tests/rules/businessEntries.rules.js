// Owner-only prop-firm cash book. Admins can read trades, not these rows.
// Synthetic data on the Firestore emulator only. No production project.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();

function validEntry(over = {}) {
  return {
    kind: 'expense',
    category: 'challenge_fee',
    amount: 155,
    currency: 'USD',
    date: '2026-03-04',
    month: '2026-03',
    journalId: 'j-ftmo',
    note: 'דמי אתגר',
    cashOnly: false,
    ...over,
  };
}

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-business',
    firestore: { rules: RULES },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env?.cleanup(); });

describe('businessEntries are owner-only and field-bounded', () => {
  it('lets the owner write and read a valid row', async () => {
    const ref = doc(asUser('alice'), 'users/alice/businessEntries/fee-1');
    await assertSucceeds(setDoc(ref, validEntry()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(doc(asUser('alice'), 'users/alice/businessEntries/pay-1'), validEntry({
      kind: 'income',
      category: 'payout',
      amount: 400,
      journalId: null,
      note: '',
      cashOnly: true,
    })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('blocks a stranger from reading or writing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/businessEntries/fee-1'), validEntry());
    });
    await assertFails(getDoc(doc(asUser('bob'), 'users/alice/businessEntries/fee-1')));
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice/businessEntries/fee-1'), validEntry()));
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice/businessEntries/other'), validEntry()));
    await assertFails(deleteDoc(doc(asUser('bob'), 'users/alice/businessEntries/fee-1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/businessEntries/fee-1')));
  });

  it('does not let an admin read the book', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/root'), { role: 'admin' });
      await setDoc(doc(ctx.firestore(), 'users/alice/businessEntries/fee-1'), validEntry());
    });
    await assertFails(getDoc(doc(asUser('root'), 'users/alice/businessEntries/fee-1')));
  });

  it('blocks invalid fields', async () => {
    const ref = doc(asUser('alice'), 'users/alice/businessEntries/bad');
    await assertFails(setDoc(ref, validEntry({ netPnl: 900 })));
    await assertFails(setDoc(ref, validEntry({ kind: 'profit' })));
    await assertFails(setDoc(ref, validEntry({ currency: 'EUR' })));
    await assertFails(setDoc(ref, validEntry({ amount: 0 })));
    await assertFails(setDoc(ref, validEntry({ amount: -5 })));
    await assertFails(setDoc(ref, validEntry({ note: 'א'.repeat(161) })));
    await assertFails(setDoc(ref, validEntry({ cashOnly: true })));
    await assertFails(setDoc(ref, validEntry({ month: '2026-04' })));
    const missing = validEntry();
    delete missing.note;
    await assertFails(setDoc(ref, missing));
  });
});
