import { describe, expect, it } from 'vitest';
import { computeMentalStats } from './mentalStats';
import {
  REMOVED_ROUTINE_LABEL,
  addRoutineItem,
  defaultRoutineItems,
  moveRoutineItem,
  normalizeRoutineDoc,
  removeRoutineItem,
  resolveRoutineLabel,
  routineProgress,
  updateRoutineItem,
} from './morningRoutine';

const labelsOf = (doc) => doc.items.map((item) => item.label);

describe('morning routine list', () => {
  it('seeds an account that has no saved list with the built-in six', () => {
    const doc = normalizeRoutineDoc(null);
    expect(doc.persisted).toBe(false);
    expect(doc.items.map((item) => item.id)).toEqual(['news', 'charts', 'meditation', 'exercise', 'review', 'planning']);
    expect(labelsOf(doc)[0]).toBe('בדיקת חדשות כלכליות');
    expect(routineProgress(['news', 'charts', 'missing'], undefined)).toBe('2/6');
  });

  it('does not put deleted defaults back when the saved list is empty', () => {
    expect(normalizeRoutineDoc({ items: [], seq: 0, retired: [] }).items).toEqual([]);
    expect(routineProgress(['news'], [])).toBe('1');
  });

  it('drops malformed rows and keeps the first copy of an id', () => {
    const doc = normalizeRoutineDoc({
      items: [
        { id: 'news', label: '  חדשות   מאקרו ' },
        { id: 'news', label: 'כפילות' },
        { id: 'Bad', label: 'אות גדולה' },
        { id: 'r1', label: '' },
        { label: 'בלי מזהה' },
        { id: 'r2', label: 'מים' },
      ],
      seq: 1,
      retired: [{ id: 'r2', label: 'לא אמור להישאר' }, { id: 'r9', label: 'ישן' }],
    });
    expect(doc.items).toEqual([
      { id: 'news', label: 'חדשות מאקרו' },
      { id: 'r2', label: 'מים' },
    ]);
    expect(doc.retired).toEqual([{ id: 'r9', label: 'ישן' }]);
    expect(doc.seq).toBe(9);
  });

  it('renames a built-in step without changing its id', () => {
    const result = updateRoutineItem(null, 'news', '  חדשות מאקרו  ');
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.doc.items[0]).toEqual({ id: 'news', label: 'חדשות מאקרו' });
    expect(result.doc.items).toHaveLength(defaultRoutineItems().length);
  });

  it('adds, reorders, and refuses a duplicate or a blank label', () => {
    const added = addRoutineItem(null, ' כוס מים ');
    expect(added.ok).toBe(true);
    expect(added.doc.items.at(-1)).toEqual({ id: 'r1', label: 'כוס מים' });
    const moved = moveRoutineItem(added.doc, 'r1', -1);
    expect(moved.doc.items.at(-2).id).toBe('r1');
    expect(moveRoutineItem(added.doc, 'news', -1).changed).toBe(false);
    expect(addRoutineItem(added.doc, 'כוס מים').ok).toBe(false);
    expect(addRoutineItem(added.doc, '   ').error).toMatch(/80/);
  });

  it('keeps a deleted label for old checks and does not reuse the id', () => {
    const added = addRoutineItem(null, 'כוס מים').doc;
    const removed = removeRoutineItem(added, 'r1');
    expect(removed.ok).toBe(true);
    expect(removed.doc.items.some((item) => item.id === 'r1')).toBe(false);
    expect(resolveRoutineLabel('r1', removed.doc)).toBe('כוס מים');
    const again = addRoutineItem(removed.doc, 'כוס מים');
    expect(again.doc.items.at(-1).id).toBe('r2');
    expect(resolveRoutineLabel('r1', again.doc)).toBe('כוס מים');
    expect(resolveRoutineLabel('nope', again.doc)).toBe(REMOVED_ROUTINE_LABEL);
    expect(resolveRoutineLabel(null, again.doc)).toBe(REMOVED_ROUTINE_LABEL);
    expect(resolveRoutineLabel('news', { items: [], retired: [] })).toBe('בדיקת חדשות כלכליות');
  });

  it('stops at 20 items', () => {
    let doc = normalizeRoutineDoc({ items: [], seq: 0, retired: [] });
    for (let i = 0; i < 20; i += 1) doc = addRoutineItem(doc, `פריט ${i + 1}`).doc;
    expect(doc.items).toHaveLength(20);
    expect(addRoutineItem(doc, 'עוד אחד').ok).toBe(false);
  });
});

describe('routine stats catalog', () => {
  const trade = { status: 'closed', result: 'win', id: 't', exitDate: '2026-11-01T12:00', netPnl: 10 };
  const morning = [{ date: '2026-11-01', preMarketChecklist: ['news', 'gone'] }];

  it('keeps the built-in six when no personal list is passed', () => {
    const stats = computeMentalStats([trade], morning, []);
    expect(stats.checklistStats.map((row) => row.key)).toEqual(['news', 'charts', 'meditation', 'exercise', 'review', 'planning']);
    expect(stats.checklistStats[0]).toMatchObject({ label: 'בדיקת חדשות כלכליות', with: { trades: 1 } });
  });

  it('uses a renamed personal list and ignores an unknown id', () => {
    const renamed = updateRoutineItem(null, 'news', 'חדשות מאקרו').doc;
    const stats = computeMentalStats([trade], morning, [], renamed.items);
    expect(stats.checklistStats.find((row) => row.key === 'news').label).toBe('חדשות מאקרו');
    expect(stats.checklistStats.some((row) => row.key === 'gone')).toBe(false);
  });
});
