import { validateBusinessEntry } from '../utils/businessLedger';

// Persistence seam for the prop-firm business ledger.
//
// Stage 2 does not talk to Firestore and does not touch localStorage.
// `memory` is the in-memory book used by tests and by the marked demo.
// `disabled` is what the signed-in page uses until stage 3.
// `firestore` is the stub stage 3 will enable together with the security rule.
// Nothing in this file imports firebase.

function clone(row) {
  return { ...row };
}

function storedId(raw, rows, demo) {
  if (typeof raw?.id === 'string' && raw.id.trim()) return raw.id.trim();
  const prefix = demo ? 'demo-biz' : 'biz';
  return `${prefix}-${rows.length + 1}`;
}

function toStored(raw, rows) {
  const result = validateBusinessEntry(raw);
  if (!result.ok) return result;
  const demo = raw?.demo === true;
  return {
    ok: true,
    entry: {
      ...result.entry,
      id: storedId(raw, rows, demo),
      ...(demo ? { demo: true } : {}),
    },
  };
}

/** In-memory book. No localStorage, no network. */
export function createMemoryBusinessLedgerStore(seed = []) {
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
export function createDisabledBusinessLedgerStore() {
  return {
    kind: 'disabled',
    enabled: false,
    async list() {
      return [];
    },
    async save() {
      return { ok: false, code: 'storage_disabled', message: 'השמירה לחשבון עדיין לא מחוברת.' };
    },
    async remove() {
      return { ok: false, code: 'storage_disabled', message: 'השמירה לחשבון עדיין לא מחוברת.' };
    },
  };
}

/**
 * Firestore stub. Not enabled: it does not import the SDK and it does not write.
 * Stage 3 adds the security rule and switches the mode on.
 */
export function createFirestoreBusinessLedgerStore() {
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
export const BUSINESS_LEDGER_STORAGE_MODE = 'disabled';

export function createBusinessLedgerStore(mode = BUSINESS_LEDGER_STORAGE_MODE, seed) {
  if (mode === 'memory') return createMemoryBusinessLedgerStore(seed);
  if (mode === 'firestore') return createFirestoreBusinessLedgerStore();
  return createDisabledBusinessLedgerStore();
}
