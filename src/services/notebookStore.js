import { validateNotebookEntry } from '../utils/notebook';

// Persistence seam for the trader notebook (מחברת).
//
// `memory` is the in-memory book used by tests and by the marked demo.
// It does not touch localStorage.
// `disabled` is what the signed-in page uses while the feature flag is off.
// `firestore` is the real store. It stays off until the rules are published
// and NOTEBOOK_FIRESTORE_ENABLED is flipped. See docs/RELEASES.md.
// The live Firebase import runs only on that path. Tests pass a fake `io`.

export const NOTEBOOK_COLLECTION = 'notebookEntries';

/**
 * Single switch for account persistence.
 * The account notebook is on for v2.3.0. The `users/{uid}/notebookEntries`
 * rules have to be published before this build reaches production.
 */
export const NOTEBOOK_FIRESTORE_ENABLED = true;

const SAVING_OFF = 'השמירה לחשבון עדיין לא מופעלת.';
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function clone(row) {
  return { ...row, tags: Array.isArray(row.tags) ? [...row.tags] : [] };
}

function nextId(rows, demo) {
  const prefix = demo ? 'demo-nb' : 'nb';
  const used = new Set(rows.map((row) => row.id));
  let n = rows.length + 1;
  while (used.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

function toStored(raw, rows) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validateNotebookEntry(raw);
  const demo = raw.demo === true;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : nextId(rows, demo);
  const result = validateNotebookEntry({ ...raw, id });
  if (!result.ok) return result;
  return {
    ok: true,
    entry: {
      ...result.entry,
      ...(demo ? { demo: true } : {}),
    },
  };
}

/** In-memory book. No localStorage, no network. */
export function createMemoryNotebookStore(seed = []) {
  let rows = [];
  (Array.isArray(seed) ? seed : []).forEach((raw) => {
    const result = toStored(raw, rows);
    if (result.ok) rows.push(result.entry);
  });
  return {
    kind: 'memory',
    enabled: true,
    async list() {
      return rows.map(clone);
    },
    async save(raw) {
      const result = toStored(raw, rows);
      if (!result.ok) return result;
      const next = result.entry;
      const index = rows.findIndex((row) => row.id === next.id);
      if (index >= 0) rows[index] = next;
      else rows.push(next);
      return { ok: true, entry: clone(next) };
    },
    async remove(id) {
      const next = rows.filter((row) => row.id !== id);
      if (next.length === rows.length) return { ok: false, code: 'missing', message: 'הרשומה לא נמצאה.' };
      rows = next;
      return { ok: true };
    },
  };
}

/** Signed-in page while the flag is off. Reads empty, writes nothing. */
export function createDisabledNotebookStore() {
  return {
    kind: 'disabled',
    enabled: false,
    async list() {
      return [];
    },
    async save() {
      return { ok: false, code: 'storage_disabled', message: SAVING_OFF };
    },
    async remove() {
      return { ok: false, code: 'storage_disabled', message: SAVING_OFF };
    },
  };
}

function firestoreOffStore() {
  return {
    kind: 'firestore',
    enabled: false,
    async list() {
      return [];
    },
    async save() {
      return { ok: false, code: 'firestore_disabled', message: SAVING_OFF };
    },
    async remove() {
      return { ok: false, code: 'firestore_disabled', message: SAVING_OFF };
    },
  };
}

function storedFields(entry) {
  return {
    title: entry.title,
    body: entry.body,
    tags: [...entry.tags],
    date: entry.date,
    month: entry.month,
    journalName: entry.journalName,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function cleanId(id) {
  if (typeof id !== 'string') return '';
  const trimmed = id.trim();
  return ID_RE.test(trimmed) ? trimmed : '';
}

function newId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `nb-${uuid}`;
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fromStored(row) {
  const id = cleanId(row?.id);
  if (!id) return null;
  const result = validateNotebookEntry({ ...row, id });
  if (!result.ok) return null;
  return { ...result.entry, id };
}

function failed(message) {
  return { ok: false, code: 'storage', message: message || 'השמירה לחשבון נכשלה.' };
}

function bindFirestore(io) {
  return {
    kind: 'firestore',
    enabled: true,
    async list() {
      const uid = await io.uid();
      if (!uid) return [];
      const rows = await io.list(uid);
      return (Array.isArray(rows) ? rows : []).map(fromStored).filter(Boolean);
    },
    async save(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validateNotebookEntry(raw);
      if (raw.demo === true) {
        return { ok: false, code: 'demo', message: 'רשומת דמו לא נשמרת בחשבון.' };
      }
      const id = cleanId(raw.id) || newId();
      const result = validateNotebookEntry({ ...raw, id });
      if (!result.ok) return result;
      const uid = await io.uid();
      if (!uid) return failed('אין חשבון מחובר.');
      const data = storedFields(result.entry);
      try {
        await io.set(uid, id, data);
      } catch {
        return failed();
      }
      return { ok: true, entry: { ...result.entry, id } };
    },
    async remove(id) {
      const clean = cleanId(id);
      if (!clean) return { ok: false, code: 'missing', message: 'הרשומה לא נמצאה.' };
      const uid = await io.uid();
      if (!uid) return failed('אין חשבון מחובר.');
      try {
        await io.remove(uid, clean);
      } catch {
        return failed('הרשומה לא נמחקה.');
      }
      return { ok: true };
    },
  };
}

/**
 * Real Firestore book. With no `io` and the flag off, this returns the
 * disabled stub and does not import Firebase. Tests pass a fake `io`.
 * The live adapter is loaded only when the flag is on.
 */
export function createFirestoreNotebookStore(io = null) {
  if (io) return bindFirestore(io);
  if (!NOTEBOOK_FIRESTORE_ENABLED) return firestoreOffStore();
  return bindFirestore(createLiveNotebookIo());
}

function createLiveNotebookIo() {
  let api;
  const load = async () => {
    if (!api) {
      const [service, firestore, dbMod, authMod] = await Promise.all([
        import('./firestoreService.js'),
        import('firebase/firestore'),
        import('./firebaseDb.js'),
        import('./firebase.js'),
      ]);
      api = { service, firestore, db: dbMod.db, auth: authMod.auth };
    }
    return api;
  };
  return {
    async uid() {
      const { auth } = await load();
      return auth.currentUser?.uid || '';
    },
    async list(uid) {
      const { service } = await load();
      return service.getUserCollectionDocs(uid, NOTEBOOK_COLLECTION);
    },
    async set(uid, id, data) {
      const { firestore, db } = await load();
      const ref = firestore.doc(db, 'users', uid, NOTEBOOK_COLLECTION, id);
      await firestore.setDoc(ref, data);
    },
    async remove(uid, id) {
      const { service } = await load();
      await service.deleteUserDocument(uid, NOTEBOOK_COLLECTION, id);
    },
  };
}

/** What the page uses when it is not in the marked demo and no store was injected. */
export const NOTEBOOK_STORAGE_MODE = NOTEBOOK_FIRESTORE_ENABLED ? 'firestore' : 'disabled';

export function createNotebookStore(mode = NOTEBOOK_STORAGE_MODE, seed) {
  if (mode === 'memory') return createMemoryNotebookStore(seed);
  if (mode === 'firestore') return createFirestoreNotebookStore();
  return createDisabledNotebookStore();
}
