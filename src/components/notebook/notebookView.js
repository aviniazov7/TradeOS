import { FREE_LIMITS } from '../../utils/constants';
import { NOTEBOOK_DEMO_JOURNAL_NAME } from '../../utils/notebookDemo';

/** Free plan keeps the list and text search, capped at FREE_LIMITS.notebookEntries. */
export function notebookEntryLimit(count, isPremium) {
  const used = Number.isFinite(count) && count > 0 ? count : 0;
  const cap = isPremium ? null : FREE_LIMITS.notebookEntries;
  return { cap, count: used, canAdd: cap == null || used < cap };
}

export function displayNotebookDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Journal link is the journal's name, not its id. */
export function notebookJournalOptions(journals, { demo = false, current = '' } = {}) {
  const options = [{ value: '', label: 'בלי קישור ליומן' }];
  const names = new Set();
  (journals || []).forEach((journal) => {
    if (!journal || journal.archived) return;
    const name = typeof journal.name === 'string' ? journal.name.trim() : '';
    if (!name || names.has(name)) return;
    names.add(name);
    options.push({ value: name, label: name });
  });
  if (demo && !names.has(NOTEBOOK_DEMO_JOURNAL_NAME)) {
    names.add(NOTEBOOK_DEMO_JOURNAL_NAME);
    options.push({ value: NOTEBOOK_DEMO_JOURNAL_NAME, label: NOTEBOOK_DEMO_JOURNAL_NAME });
  }
  const extra = typeof current === 'string' ? current.trim() : '';
  if (extra && !names.has(extra)) options.push({ value: extra, label: extra });
  return options;
}

/** First spelling of each tag, for the premium filter. */
export function notebookTagOptions(entries) {
  const seen = new Map();
  (entries || []).forEach((entry) => {
    (entry.tags || []).forEach((tag) => {
      const key = String(tag).normalize('NFKC').toLocaleLowerCase('en');
      if (key && !seen.has(key)) seen.set(key, tag);
    });
  });
  return [...seen.values()];
}

export function parseNotebookTags(value) {
  return String(value || '').split(/[,،]/).map((part) => part.trim()).filter(Boolean);
}
