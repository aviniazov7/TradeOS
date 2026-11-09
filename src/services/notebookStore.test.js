import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  NOTEBOOK_STORAGE_MODE,
  createFirestoreNotebookStore,
  createMemoryNotebookStore,
  createNotebookStore,
} from './notebookStore';

const row = (over = {}) => ({
  id: 'note-1',
  title: 'לקח',
  body: 'טקסט',
  createdAt: '2026-03-04T08:00:00Z',
  updatedAt: '2026-03-04T08:00:00Z',
  ...over,
});

describe('notebook store', () => {
  it('keeps an in-memory book and does not touch localStorage or the network', async () => {
    const setItem = vi.fn();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = { setItem, getItem: () => null, removeItem() {}, clear() {} };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const store = createMemoryNotebookStore([row({ id: 'a', title: 'יום' })]);
    expect(store.enabled).toBe(true);
    expect((await store.list()).map((entry) => entry.id)).toEqual(['a']);

    const saved = await store.save(row({ id: '', title: 'רעיון', tags: ['BTC'] }));
    expect(saved.ok).toBe(true);
    expect(saved.entry.demo).toBeUndefined();
    expect(saved.entry.id).toBe('nb-2');
    const edited = await store.save({ ...saved.entry, title: 'עודכן', updatedAt: '2026-03-05T08:00:00Z' });
    expect(edited.entry.title).toBe('עודכן');
    expect((await store.list()).filter((entry) => entry.title === 'עודכן')).toHaveLength(1);

    expect(await store.remove('missing')).toMatchObject({ ok: false, code: 'missing' });
    expect((await store.remove('a')).ok).toBe(true);
    expect((await store.list()).some((entry) => entry.id === 'a')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });

  it('rejects markup that is not a notebook entry, and keeps XSS text as text', async () => {
    const store = createMemoryNotebookStore();
    const refused = await store.save({ title: '' });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('title');
    const xss = await store.save(row({
      id: 'xss',
      title: 'בדיקה <b>',
      body: '<script>alert(1)</script>',
    }));
    expect(xss.ok).toBe(true);
    expect(xss.entry.body).toBe('<script>alert(1)</script>');
    expect(xss.entry.html).toBeUndefined();
    expect(await store.list()).toHaveLength(1);
  });

  it('leaves the Firestore stub disabled and unselected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(NOTEBOOK_STORAGE_MODE).toBe('disabled');
    expect(createNotebookStore().enabled).toBe(false);
    expect(createNotebookStore().kind).not.toBe('firestore');

    const firestore = createFirestoreNotebookStore();
    expect(firestore.enabled).toBe(false);
    expect(await firestore.list()).toEqual([]);
    expect(await firestore.save(row())).toMatchObject({ ok: false, code: 'firestore_disabled' });
    expect(await firestore.remove('a')).toMatchObject({ ok: false, code: 'firestore_disabled' });
    expect(await createNotebookStore('firestore').save(row())).toMatchObject({ code: 'firestore_disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const src = readFileSync(new URL('./notebookStore.js', import.meta.url), 'utf8');
    const page = readFileSync(new URL('../components/notebook/NotebookPage.jsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from ['"]firebase|firestoreService/);
    expect(page).not.toMatch(/from ['"]firebase|firestoreService/);
  });
});
