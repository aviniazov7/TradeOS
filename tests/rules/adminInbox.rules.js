// adminInbox is admin-read, and clients may only flip read / archive.
// The Worker creates rows with the Admin SDK, which bypasses these rules.
// Run against the local emulator: `npm run test:rules`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel,
} from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');

let env;
const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asGuest = () => env.unauthenticatedContext().firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const MESSAGE = {
  kind: 'feedback',
  type: 'feedback',
  title: 'משוב מ-Alice',
  body: 'הגרף נתקע',
  preview: 'הגרף נתקע',
  userId: 'alice',
  userName: 'Alice',
  userEmail: 'alice@example.com',
  source: 'contact',
  read: false,
  archived: false,
  readAt: null,
  archivedAt: null,
  createdAt: new Date('2026-10-30T09:00:00Z'),
};

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-tradeos-rules-admin-inbox',
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/alice', { displayName: 'Alice', role: 'user', plan: 'free' });
  await seed('users/root', { displayName: 'Admin', role: 'admin' });
  await seed('adminInbox/m1', MESSAGE);
});

afterAll(async () => {
  await env?.cleanup();
});

describe('adminInbox — non-admins', () => {
  it('guest cannot read or write the mailbox', async () => {
    const db = asGuest();
    await assertFails(getDoc(doc(db, 'adminInbox/m1')));
    await assertFails(getDocs(collection(db, 'adminInbox')));
    await assertFails(setDoc(doc(db, 'adminInbox/new'), MESSAGE));
  });

  it('a regular user cannot read or update a message, including their own feedback', async () => {
    const db = asUser('alice');
    await assertFails(getDoc(doc(db, 'adminInbox/m1')));
    await assertFails(getDocs(collection(db, 'adminInbox')));
    await assertFails(updateDoc(doc(db, 'adminInbox/m1'), { read: true }));
    await assertFails(deleteDoc(doc(db, 'adminInbox/m1')));
  });
});

describe('adminInbox — admins', () => {
  it('can read the mailbox', async () => {
    const db = asUser('root');
    await assertSucceeds(getDoc(doc(db, 'adminInbox/m1')));
    await assertSucceeds(getDocs(collection(db, 'adminInbox')));
  });

  it('can mark read, unread, and archived — and cannot rewrite the body or create a row', async () => {
    const db = asUser('root');
    await assertSucceeds(updateDoc(doc(db, 'adminInbox/m1'), { read: true, readAt: new Date() }));
    await assertSucceeds(updateDoc(doc(db, 'adminInbox/m1'), { read: false, readAt: null }));
    await assertSucceeds(updateDoc(doc(db, 'adminInbox/m1'), { archived: true, archivedAt: new Date() }));
    await assertFails(updateDoc(doc(db, 'adminInbox/m1'), { body: 'שונה' }));
    await assertFails(setDoc(doc(db, 'adminInbox/forged'), { ...MESSAGE, body: 'זיוף' }));
    await assertFails(deleteDoc(doc(db, 'adminInbox/m1')));
  });
});
