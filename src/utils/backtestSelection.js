// The selected backtest journal used to live in one localStorage key shared by
// every account on this browser. After A → B → A that key held B's journal, A's
// id no longer matched, and the screen fell back to A's oldest journal — so
// the BTC journal's settings and trades were still stored and not on screen.

export const BACKTEST_JOURNAL_STORAGE_KEY = 'tradeos_activeBacktestJournal';

export function backtestJournalStorageKey(uid) {
  return `${BACKTEST_JOURNAL_STORAGE_KEY}:${uid}`;
}

export function readStoredBacktestJournalId(storage, uid) {
  if (!uid || !storage) return null;
  try {
    const scoped = storage.getItem(backtestJournalStorageKey(uid));
    if (scoped) return scoped;
    // Legacy unscoped pointer. Used only until this account claims it.
    return storage.getItem(BACKTEST_JOURNAL_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Remember `journalId` for `uid` when it is one of this account's journals.
 * The legacy unscoped key is removed only when it is that same id. Another
 * account's pointer is left in place so opening this account cannot erase it.
 * An empty journal list clears this account's key. A missing id with journals
 * still loaded (selection not resolved yet) writes nothing.
 */
export function rememberBacktestJournalId(storage, uid, journalId, ownedIds) {
  if (!uid || !storage) return;
  const ids = ownedIds || [];
  try {
    const key = backtestJournalStorageKey(uid);
    const owns = Boolean(journalId) && ids.includes(journalId);
    if (owns) storage.setItem(key, journalId);
    else if (!journalId && ids.length === 0) storage.removeItem(key);
    if (owns && storage.getItem(BACKTEST_JOURNAL_STORAGE_KEY) === journalId) {
      storage.removeItem(BACKTEST_JOURNAL_STORAGE_KEY);
    }
  } catch {
    /* private mode / blocked storage */
  }
}

/**
 * Keep `candidateId` when it belongs to `journals` or when it is a journal
 * this account just created and the listener has not echoed yet. Otherwise
 * use the oldest loaded journal, or null when the account has none.
 */
export function resolveBacktestJournalId(journals, candidateId, pendingId) {
  const list = journals || [];
  if (candidateId && list.some((j) => j.id === candidateId)) return candidateId;
  if (pendingId && pendingId === candidateId) return candidateId;
  return list[0]?.id ?? null;
}
