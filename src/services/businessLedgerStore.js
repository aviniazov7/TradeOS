import { validateBusinessEntry } from '../utils/businessLedger';

// Persistence seam for the prop-firm business ledger.
//
// `memory` is the in-memory book used by tests and by the marked demo.
// It does not touch localStorage.
// `disabled` is what the signed-in page uses while the feature flag is off.
// `firestore` is the real store. It stays off until the rules are published
// and BUSINESS_LEDGER_FIRESTORE_ENABLED is flipped. See docs/RELEASES.md.
// The live Firebase import runs only on that path. Tests pass a fake `io`.

export const BUSINESS_LEDGER_COLLECTION = 'businessEntries';

/**
 * Single switch for account persistence.
 * Publish the `users/{uid}/businessEntries` rules to production first,
 * then set this to true. Default false: the page stays on the marked demo.
 */
export const BUSINESS_LEDGER_FIRESTORE_ENABLED = false;

const SAVING_OFF = 'השמירה לחשבון עדיין לא מופעלת.';

const STORED_FIELDS = ['kind', 'category', 'amount', 'currency', 'date', 'month', 'journalId', 'note', 'cashOnly'];

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

/** Signed-in page while the flag is off. Reads empty, writes nothing. */
export function createDisabledBusinessLedgerStore() {
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
  const doc = {};
  STORED_FIELDS.forEach((key) => {
    doc[key] = entry[key] == null && key === 'journalId' ? null : entry[key];
  });
  if (doc.journalId == null) doc.journalId = null;
  if (typeof doc.note !== 'string') doc.note = '';
  doc.cashOnly = entry.cashOnly === true;
  return doc;
}

function cleanId(id) {
  if (typeof id !== 'string') return '';
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128 || /[/\s]/.test(trimmed)) return '';
  return trimmed;
}

function newId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `biz-${uuid}`;
  return `biz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fromStored(row) {
  const result = validateBusinessEntry(row);
  const id = cleanId(row?.id);
  if (!result.ok || !id) return null;
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
      if (raw?.demo === true) {
        return { ok: false, code: 'demo', message: 'רשומת דמו לא נשמרת בחשבון.' };
      }
      const result = validateBusinessEntry(raw);
      if (!result.ok) return result;
      const uid = await io.uid();
      if (!uid) return failed('אין חשבון מחובר.');
      const id = cleanId(raw?.id) || newId();
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
export function createFirestoreBusinessLedgerStore(io = null) {
  if (io) return bindFirestore(io);
  if (!BUSINESS_LEDGER_FIRESTORE_ENABLED) return firestoreOffStore();
  return bindFirestore(createLiveBusinessLedgerIo());
}

function createLiveBusinessLedgerIo() {
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
      return service.getUserCollectionDocs(uid, BUSINESS_LEDGER_COLLECTION);
    },
    async set(uid, id, data) {
      const { firestore, db } = await load();
      const ref = firestore.doc(db, 'users', uid, BUSINESS_LEDGER_COLLECTION, id);
      await firestore.setDoc(ref, data);
    },
    async remove(uid, id) {
      const { service } = await load();
      await service.deleteUserDocument(uid, BUSINESS_LEDGER_COLLECTION, id);
    },
  };
}

/** What the page uses when it is not in the marked demo and no store was injected. */
export const BUSINESS_LEDGER_STORAGE_MODE = BUSINESS_LEDGER_FIRESTORE_ENABLED ? 'firestore' : 'disabled';

export function createBusinessLedgerStore(mode = BUSINESS_LEDGER_STORAGE_MODE, seed) {
  if (mode === 'memory') return createMemoryBusinessLedgerStore(seed);
  if (mode === 'firestore') return createFirestoreBusinessLedgerStore();
  return createDisabledBusinessLedgerStore();
}
