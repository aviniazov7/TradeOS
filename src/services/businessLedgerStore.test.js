import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BUSINESS_LEDGER_COLLECTION,
  BUSINESS_LEDGER_FIRESTORE_ENABLED,
  BUSINESS_LEDGER_STORAGE_MODE,
  createBusinessLedgerStore,
  createFirestoreBusinessLedgerStore,
  createMemoryBusinessLedgerStore,
} from './businessLedgerStore';

const row = (over = {}) => ({
  kind: 'expense',
  category: 'challenge_fee',
  amount: 100,
  currency: 'USD',
  date: '2026-03-04',
  ...over,
});

describe('business ledger store', () => {
  it('keeps an in-memory book and does not touch localStorage or the network', async () => {
    const setItem = vi.fn();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { setItem, getItem: () => null, removeItem() {}, clear() {} };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const store = createMemoryBusinessLedgerStore([row({ id: 'a', note: 'אתגר' })]);
    expect(store.enabled).toBe(true);
    expect((await store.list()).map((entry) => entry.id)).toEqual(['a']);

    const saved = await store.save(row({ kind: 'income', category: 'payout', amount: 40, note: 'מזומן' }));
    expect(saved.ok).toBe(true);
    expect(saved.entry.demo).toBeUndefined();
    expect(saved.entry.netPnl).toBeUndefined();
    const edited = await store.save({ ...saved.entry, note: 'עודכן', amount: 40 });
    expect(edited.entry.note).toBe('עודכן');
    expect((await store.list()).filter((entry) => entry.note === 'עודכן')).toHaveLength(1);

    expect(await store.remove('missing')).toMatchObject({ ok: false, code: 'missing' });
    expect((await store.remove('a')).ok).toBe(true);
    expect((await store.list()).some((entry) => entry.id === 'a')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });

  it('rejects a row that tries to attach trading profit', async () => {
    const store = createMemoryBusinessLedgerStore();
    const refused = await store.save(row({ kind: 'income', category: 'payout', netPnl: 900 }));
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('trading_profit');
    expect(await store.list()).toEqual([]);
  });

  it('uses the Firestore book now that the release flag is on', () => {
    expect(BUSINESS_LEDGER_FIRESTORE_ENABLED).toBe(true);
    expect(BUSINESS_LEDGER_STORAGE_MODE).toBe('firestore');
    expect(BUSINESS_LEDGER_COLLECTION).toBe('businessEntries');
    const store = createBusinessLedgerStore();
    expect(store.enabled).toBe(true);
    expect(store.kind).toBe('firestore');
    expect(createFirestoreBusinessLedgerStore().kind).toBe('firestore');

    const src = readFileSync(new URL('./businessLedgerStore.js', import.meta.url), 'utf8');
    const page = readFileSync(new URL('../components/business/BusinessLedgerPage.jsx', import.meta.url), 'utf8');
    expect(src).toMatch(/BUSINESS_LEDGER_FIRESTORE_ENABLED = true/);
    expect(src).not.toMatch(/^import\s.+from\s+['"]firebase/m);
    expect(src).not.toMatch(/^import\s.+firestoreService/m);
    expect(page).not.toMatch(/from ['"]firebase|firestoreService/);
    expect(page).toContain('השמירה לחשבון עדיין לא מופעלת.');
  });

  it('writes only the bounded fields through a fake adapter, never the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const docs = new Map();
    const calls = [];
    const io = {
      async uid() { return 'u1'; },
      async list(uid) {
        calls.push(['list', uid]);
        return [...docs.values()];
      },
      async set(uid, id, data) {
        calls.push(['set', uid, id, data]);
        docs.set(id, { id, ...data });
      },
      async remove(uid, id) {
        calls.push(['remove', uid, id]);
        docs.delete(id);
      },
    };
    const store = createFirestoreBusinessLedgerStore(io);
    const saved = await store.save(row({ note: 'אתגר', journalId: 'j-ftmo', netPnl: null }));
    expect(saved.ok).toBe(true);
    expect(saved.entry.cashOnly).toBe(false);
    const written = docs.get(saved.entry.id);
    expect(Object.keys(written).sort()).toEqual(['amount', 'cashOnly', 'category', 'currency', 'date', 'id', 'journalId', 'kind', 'month', 'note']);
    expect(written).toMatchObject({
      kind: 'expense',
      category: 'challenge_fee',
      amount: 100,
      currency: 'USD',
      date: '2026-03-04',
      month: '2026-03',
      journalId: 'j-ftmo',
      note: 'אתגר',
      cashOnly: false,
    });
    expect(written.netPnl).toBeUndefined();

    const payout = await store.save(row({ kind: 'income', category: 'payout', amount: 40 }));
    expect(docs.get(payout.entry.id).cashOnly).toBe(true);

    const refused = await store.save(row({ kind: 'income', category: 'payout', netPnl: 900 }));
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('trading_profit');
    const demo = await store.save(row({ demo: true }));
    expect(demo).toMatchObject({ ok: false, code: 'demo' });
    expect(calls.filter((call) => call[0] === 'set')).toHaveLength(2);

    docs.set('poison', { id: 'poison', kind: 'expense', category: 'other', amount: 1, currency: 'EUR', date: '2026-03-04', note: '' });
    const listed = await store.list();
    expect(listed.map((entry) => entry.id).sort()).toEqual([payout.entry.id, saved.entry.id].sort());
    expect(listed.every((entry) => entry.demo == null && entry.netPnl == null)).toBe(true);

    expect((await store.remove(saved.entry.id)).ok).toBe(true);
    expect(docs.has(saved.entry.id)).toBe(false);
    expect(calls.some((call) => call[0] === 'list' && call[1] === 'u1')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const signedOut = createFirestoreBusinessLedgerStore({
      async uid() { return ''; },
      async list() { throw new Error('should not list'); },
      async set() { throw new Error('should not set'); },
      async remove() { throw new Error('should not remove'); },
    });
    expect(await signedOut.list()).toEqual([]);
    expect(await signedOut.save(row())).toMatchObject({ ok: false, code: 'storage' });
  });
});
