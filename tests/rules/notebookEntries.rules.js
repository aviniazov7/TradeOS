// Owner-only trader notebook. Admins can read trades, not these rows.
// Synthetic data on the Firestore emulator only. No production project.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();

function validEntry(over = {}) {
  return {
    title: 'לקח על BTC',
    body: 'היום לא רדפתי.',
    tags: ['לקח', 'BTC'],
    date: '2026-03-18',
    month: '2026-03',
    journalName: 'יומן לדוגמה',
    createdAt: '2026-03-18T08:00:00.000Z',
    updatedAt: '2026-03-18T08:00:00.000Z',
    ...over,
  };
}

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-notebook',
    firestore: { rules: RULES },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env?.cleanup(); });

describe('notebookEntries are owner-only and field-bounded', () => {
  it('lets the owner write and read a valid row', async () => {
    const ref = doc(asUser('alice'), 'users/alice/notebookEntries/lesson-1');
    await assertSucceeds(setDoc(ref, validEntry()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(asUser('alice'), 'users/alice/notebookEntries')));
    await assertSucceeds(setDoc(doc(asUser('alice'), 'users/alice/notebookEntries/idea-1'), validEntry({
      title: 'רעיון',
      body: '',
      tags: [],
      date: null,
      month: null,
      journalName: null,
    })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('blocks a stranger from reading or writing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/notebookEntries/lesson-1'), validEntry());
    });
    await assertFails(getDoc(doc(asUser('bob'), 'users/alice/notebookEntries/lesson-1')));
    await assertFails(getDocs(collection(asUser('bob'), 'users/alice/notebookEntries')));
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice/notebookEntries/lesson-1'), validEntry()));
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice/notebookEntries/other'), validEntry()));
    await assertFails(deleteDoc(doc(asUser('bob'), 'users/alice/notebookEntries/lesson-1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/notebookEntries/lesson-1')));
  });

  it('does not let an admin read the notebook', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/root'), { role: 'admin' });
      await setDoc(doc(ctx.firestore(), 'users/alice/notebookEntries/lesson-1'), validEntry());
    });
    await assertFails(getDoc(doc(asUser('root'), 'users/alice/notebookEntries/lesson-1')));
    await assertFails(getDocs(collection(asUser('root'), 'users/alice/notebookEntries')));
  });

  it('blocks invalid fields', async () => {
    const ref = doc(asUser('alice'), 'users/alice/notebookEntries/bad');
    await assertFails(setDoc(ref, validEntry({ html: '<b>לא</b>' })));
    await assertFails(setDoc(ref, validEntry({ title: '' })));
    await assertFails(setDoc(ref, validEntry({ title: 'א'.repeat(121) })));
    await assertFails(setDoc(ref, validEntry({ body: 'א'.repeat(20001) })));
    await assertFails(setDoc(ref, validEntry({ tags: ['<script>'] })));
    await assertFails(setDoc(ref, validEntry({ tags: ['א'.repeat(41)] })));
    await assertFails(setDoc(ref, validEntry({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })));
    await assertFails(setDoc(ref, validEntry({ date: '2026-13-40', month: '2026-13' })));
    await assertFails(setDoc(ref, validEntry({ month: '2026-04' })));
    await assertFails(setDoc(ref, validEntry({ date: null, month: '2026-03' })));
    await assertFails(setDoc(ref, validEntry({ journalName: 'א'.repeat(81) })));
    await assertFails(setDoc(ref, validEntry({ updatedAt: '2026-03-01T08:00:00.000Z' })));
    await assertFails(setDoc(doc(asUser('alice'), 'users/alice/notebookEntries/bad id'), validEntry()));
    const missing = validEntry();
    delete missing.tags;
    await assertFails(setDoc(ref, missing));
  });
});
