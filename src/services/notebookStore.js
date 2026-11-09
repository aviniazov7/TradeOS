import { validateNotebookEntry } from '../utils/notebook';

// Persistence seam for the trader notebook (מחברת).
//
// Stage 2 does not talk to Firestore and does not touch localStorage.
// `memory` is the in-memory book used by tests and by the marked demo.
// `disabled` is what the signed-in page uses until stage 3.
// `firestore` is the stub stage 3 will enable together with the security rule.
// Nothing in this file imports firebase.

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

/** Signed-in page until stage 3 turns storage on. Reads empty, writes nothing. */
export function createDisabledNotebookStore() {
  return {
    kind: 'disabled',
    enabled: false,
    async list() {
      return [];
    },
    async save() {
      return { ok: false, code: 'storage_disabled', message: 'השמירה לחשבון עדיין לא מופעלת.' };
    },
    async remove() {
      return { ok: false, code: 'storage_disabled', message: 'השמירה לחשבון עדיין לא מופעלת.' };
    },
  };
}

/**
 * Firestore stub. Not enabled: it does not import the SDK and it does not write.
 * Stage 3 adds the security rule and switches the mode on.
 */
export function createFirestoreNotebookStore() {
  return {
    kind: 'firestore',
    enabled: false,
    async list() {
      return [];
    },
    async save() {
      return { ok: false, code: 'firestore_disabled', message: 'השמירה ל-Firestore לא מופעלת בשלב הזה.' };
    },
    async remove() {
      return { ok: false, code: 'firestore_disabled', message: 'השמירה ל-Firestore לא מופעלת בשלב הזה.' };
    },
  };
}

/** What the page uses when it is not in the marked demo and no store was injected. */
export const NOTEBOOK_STORAGE_MODE = 'disabled';

export function createNotebookStore(mode = NOTEBOOK_STORAGE_MODE, seed) {
  if (mode === 'memory') return createMemoryNotebookStore(seed);
  if (mode === 'firestore') return createFirestoreNotebookStore();
  return createDisabledNotebookStore();
}
