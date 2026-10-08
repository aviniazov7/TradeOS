import { describe, it, expect } from 'vitest';
import { readDraft, writeDraft, clearDraft, pruneDrafts } from './journalDraft';
import { draftKey } from './mentalityJournalForm';

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const throwing = {
  get length() { throw new Error('blocked'); },
  key() { throw new Error('blocked'); },
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('quota'); },
  removeItem() { throw new Error('blocked'); },
};

describe('journal drafts', () => {
  const key = draftKey('u1', 'morning', '2026-10-08');

  it('round-trips a form', () => {
    const s = memoryStorage();
    writeDraft(key, { mainGoal: 'x' }, s);
    expect(readDraft(key, s)).toEqual({ mainGoal: 'x' });
    clearDraft(key, s);
    expect(readDraft(key, s)).toBe(null);
  });

  it('ignores corrupt values and never throws when storage is blocked', () => {
    const s = memoryStorage();
    s.setItem(key, '{not json');
    expect(readDraft(key, s)).toBe(null);
    s.setItem(key, JSON.stringify({ savedAt: 1 }));
    expect(readDraft(key, s)).toBe(null);
    expect(() => writeDraft(key, {}, throwing)).not.toThrow();
    expect(readDraft(key, throwing)).toBe(null);
    expect(() => clearDraft(key, throwing)).not.toThrow();
    expect(() => pruneDrafts(key, throwing)).not.toThrow();
    expect(readDraft(key, null)).toBe(null);
  });

  it("prunes only this user's other-day drafts of the same journal", () => {
    const s = memoryStorage();
    const old = draftKey('u1', 'morning', '2026-10-07');
    const evening = draftKey('u1', 'evening', '2026-10-07');
    const other = draftKey('u2', 'morning', '2026-10-07');
    [key, old, evening, other, 'unrelated'].forEach((k) => s.setItem(k, '{}'));
    pruneDrafts(key, s);
    expect(s.getItem(old)).toBe(null);
    expect(s.getItem(key)).not.toBe(null);
    expect(s.getItem(evening)).not.toBe(null);
    expect(s.getItem(other)).not.toBe(null);
    expect(s.getItem('unrelated')).not.toBe(null);
  });
});
