import { DRAFT_PREFIX } from './mentalityJournalForm';

// Unsaved journal input kept in localStorage, so leaving the page mid-way
// doesn't lose it. Every access is wrapped: storage can be missing, full or
// blocked (private mode), and the journal must work without it.

const store = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function readDraft(key, storage = store()) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.form && typeof parsed.form === 'object' ? parsed.form : null;
  } catch {
    return null;
  }
}

export function writeDraft(key, form, storage = store()) {
  try {
    storage?.setItem(key, JSON.stringify({ form, savedAt: Date.now() }));
  } catch {
    /* quota / blocked — the draft is a convenience only */
  }
}

export function clearDraft(key, storage = store()) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Drop this user's drafts of this journal from other days (they can't be
// restored anyway — a draft belongs to its day).
export function pruneDrafts(keepKey, storage = store()) {
  try {
    if (!storage) return;
    const scope = keepKey.slice(0, keepKey.lastIndexOf(':') + 1); // …:uid:kind:
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX) && k.startsWith(scope) && k !== keepKey) stale.push(k);
    }
    stale.forEach((k) => storage.removeItem(k));
  } catch {
    /* ignore */
  }
}
