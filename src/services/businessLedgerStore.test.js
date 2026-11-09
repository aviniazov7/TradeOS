import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
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

  it('leaves the Firestore stub disabled and unselected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(BUSINESS_LEDGER_STORAGE_MODE).toBe('disabled');
    expect(createBusinessLedgerStore().enabled).toBe(false);
    expect(createBusinessLedgerStore().kind).not.toBe('firestore');

    const firestore = createFirestoreBusinessLedgerStore();
    expect(firestore.enabled).toBe(false);
    expect(await firestore.list()).toEqual([]);
    expect(await firestore.save(row())).toMatchObject({ ok: false, code: 'firestore_disabled' });
    expect(await firestore.remove('a')).toMatchObject({ ok: false, code: 'firestore_disabled' });
    expect(await createBusinessLedgerStore('firestore').save(row())).toMatchObject({ code: 'firestore_disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const src = readFileSync(new URL('./businessLedgerStore.js', import.meta.url), 'utf8');
    const page = readFileSync(new URL('../components/business/BusinessLedgerPage.jsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from ['"]firebase|firestoreService/);
    expect(page).not.toMatch(/from ['"]firebase|firestoreService/);
  });
});
