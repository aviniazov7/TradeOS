// The mental journals (morning/evening) are owner-only: admins can read other
// users' trades etc., but not these. Also the marketing-consent profile fields.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({ projectId: 'demo-tradeos-rules-mental', firestore: { rules: RULES } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { displayName: 'Alice', role: 'user', plan: 'free' });
  await seed('users/root', { displayName: 'Admin', role: 'admin' });
  await seed('users/alice/morningJournals/m1', { emotion: 'calm', notes: 'private' });
  await seed('users/alice/eveningJournals/e1', { lessonsLearned: 'private' });
  await seed('users/alice/trades/t1', { pair: 'BTCUSDT' });
  await seed('users/alice/tradeImages/i1', { tradeId: 't1' });
});
afterAll(async () => { await env?.cleanup(); });

describe('mental journals are owner-only', () => {
  for (const [col, id] of [['morningJournals', 'm1'], ['eveningJournals', 'e1']]) {
    it(`${col}: the owner can read a document and list the collection`, async () => {
      await assertSucceeds(getDoc(doc(asUser('alice'), `users/alice/${col}/${id}`)));
      await assertSucceeds(getDocs(collection(asUser('alice'), `users/alice/${col}`)));
    });
    it(`${col}: an admin cannot read them`, async () => {
      await assertFails(getDoc(doc(asUser('root'), `users/alice/${col}/${id}`)));
      await assertFails(getDocs(collection(asUser('root'), `users/alice/${col}`)));
    });
    it(`${col}: another user cannot read them`, async () => {
      await assertFails(getDoc(doc(asUser('bob'), `users/alice/${col}/${id}`)));
    });
    it(`${col}: the owner can still write them`, async () => {
      await assertSucceeds(setDoc(doc(asUser('alice'), `users/alice/${col}/new`), { text: 'x' }));
    });
  }

  it('unchanged: an admin can still read trades, but still not trade images', async () => {
    await assertSucceeds(getDoc(doc(asUser('root'), 'users/alice/trades/t1')));
    await assertFails(getDoc(doc(asUser('root'), 'users/alice/tradeImages/i1')));
  });
});

describe('marketing consent fields on the own profile', () => {
  it('lets the owner opt in and out', async () => {
    const ref = doc(asUser('alice'), 'users/alice');
    await assertSucceeds(updateDoc(ref, { marketingEmails: true, marketingEmailsAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { marketingEmails: false, marketingEmailsAt: serverTimestamp() }));
  });

  it('allows the consent at account creation', async () => {
    await assertSucceeds(setDoc(doc(asUser('carol'), 'users/carol'), {
      displayName: 'Carol', email: 'c@example.com', createdAt: serverTimestamp(),
      marketingEmails: true, marketingEmailsAt: serverTimestamp(),
    }));
  });

  it('rejects wrong types', async () => {
    const ref = doc(asUser('alice'), 'users/alice');
    await assertFails(updateDoc(ref, { marketingEmails: 'yes' }));
    await assertFails(updateDoc(ref, { marketingEmails: 1 }));
    await assertFails(updateDoc(ref, { marketingEmailsAt: 'yesterday' }));
  });

  it("does not let a user set someone else's consent", async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/bob'), { marketingEmails: true }));
  });
});
