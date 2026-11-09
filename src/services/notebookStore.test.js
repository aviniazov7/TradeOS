import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  NOTEBOOK_COLLECTION,
  NOTEBOOK_FIRESTORE_ENABLED,
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

  it('keeps the real Firestore store off while the flag is false', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(NOTEBOOK_FIRESTORE_ENABLED).toBe(false);
    expect(NOTEBOOK_STORAGE_MODE).toBe('disabled');
    expect(NOTEBOOK_COLLECTION).toBe('notebookEntries');
    expect(createNotebookStore().enabled).toBe(false);
    expect(createNotebookStore().kind).not.toBe('firestore');

    const firestore = createFirestoreNotebookStore();
    expect(firestore.enabled).toBe(false);
    expect(await firestore.list()).toEqual([]);
    expect(await firestore.save(row())).toMatchObject({
      ok: false,
      code: 'firestore_disabled',
      message: 'השמירה לחשבון עדיין לא מופעלת.',
    });
    expect(await firestore.remove('a')).toMatchObject({ ok: false, code: 'firestore_disabled' });
    expect(await createNotebookStore('firestore').save(row())).toMatchObject({ code: 'firestore_disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const src = readFileSync(new URL('./notebookStore.js', import.meta.url), 'utf8');
    const page = readFileSync(new URL('../components/notebook/NotebookPage.jsx', import.meta.url), 'utf8');
    expect(src).toMatch(/NOTEBOOK_FIRESTORE_ENABLED = false/);
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
    const store = createFirestoreNotebookStore(io);
    const saved = await store.save(row({
      id: 'lesson',
      title: 'לקח על BTC',
      body: '<script>alert(1)</script>',
      tags: ['לקח', 'BTC'],
      date: '2026-03-18',
      journalName: 'FTMO 100K',
      html: '<b>לא</b>',
    }));
    expect(saved.ok).toBe(true);
    expect(saved.entry.demo).toBeUndefined();
    expect(saved.entry.html).toBeUndefined();
    const written = docs.get('lesson');
    expect(Object.keys(written).sort()).toEqual([
      'body', 'createdAt', 'date', 'id', 'journalName', 'month', 'tags', 'title', 'updatedAt',
    ]);
    expect(written).toMatchObject({
      title: 'לקח על BTC',
      body: '<script>alert(1)</script>',
      tags: ['לקח', 'BTC'],
      date: '2026-03-18',
      month: '2026-03',
      journalName: 'FTMO 100K',
      createdAt: '2026-03-04T08:00:00.000Z',
      updatedAt: '2026-03-04T08:00:00.000Z',
    });
    expect(written.html).toBeUndefined();

    const undated = await store.save(row({ id: 'idea', title: 'רעיון', date: null, journalName: null, tags: [] }));
    expect(undated.ok).toBe(true);
    expect(docs.get('idea')).toMatchObject({ date: null, month: null, journalName: null, tags: [] });

    const refused = await store.save(row({ id: 'bad', title: '' }));
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('title');
    const demo = await store.save(row({ id: 'demo-nb-1', demo: true }));
    expect(demo).toMatchObject({ ok: false, code: 'demo' });
    expect(calls.filter((call) => call[0] === 'set')).toHaveLength(2);

    docs.set('poison', {
      id: 'poison',
      title: '',
      body: 'x',
      tags: [],
      date: null,
      month: null,
      journalName: null,
      createdAt: '2026-03-04T08:00:00.000Z',
      updatedAt: '2026-03-04T08:00:00.000Z',
      html: '<b>',
    });
    const listed = await store.list();
    expect(listed.map((entry) => entry.id).sort()).toEqual(['idea', 'lesson']);
    expect(listed.every((entry) => entry.html == null && entry.demo == null)).toBe(true);

    expect((await store.remove('lesson')).ok).toBe(true);
    expect(docs.has('lesson')).toBe(false);
    expect(calls.some((call) => call[0] === 'list' && call[1] === 'u1')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const signedOut = createFirestoreNotebookStore({
      async uid() { return ''; },
      async list() { throw new Error('should not list'); },
      async set() { throw new Error('should not set'); },
      async remove() { throw new Error('should not remove'); },
    });
    expect(await signedOut.list()).toEqual([]);
    expect(await signedOut.save(row())).toMatchObject({ ok: false, code: 'storage' });
  });
});
