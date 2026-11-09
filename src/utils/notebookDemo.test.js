import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './constants';
import { buildNotebookDemoEntries } from './notebookDemo';
import { notebookEntryLimit } from '../components/notebook/notebookView';
import { groupNotebookByMonth, renderNotebookBody } from './notebook';

const NOW = new Date('2026-03-20T12:00:00Z');

describe('notebook demo entries', () => {
  it('builds a marked sample across two Jerusalem months', () => {
    const rows = buildNotebookDemoEntries({
      journals: [{ id: 'j-ftmo', name: 'FTMO 100K', archived: false }],
      now: NOW,
    });
    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.demo === true && row.id.startsWith('demo-nb-'))).toBe(true);
    expect(rows.some((row) => row.month === '2026-03' && row.journalName === 'FTMO 100K')).toBe(true);
    expect(rows.some((row) => row.month === '2026-02')).toBe(true);
    expect(rows.some((row) => row.tags.includes('BTC'))).toBe(true);
    const html = renderNotebookBody(rows.find((row) => row.id === 'demo-nb-lesson').body);
    expect(html).toContain('<strong>לא רדפתי</strong>');
    expect(html).not.toMatch(/<script/i);
    expect(groupNotebookByMonth(rows).map((group) => group.month)).toEqual(['2026-03', '2026-02']);
  });

  it('caps the free list at 20 and leaves premium unlimited', () => {
    expect(FREE_LIMITS.notebookEntries).toBe(20);
    expect(notebookEntryLimit(19, false).canAdd).toBe(true);
    expect(notebookEntryLimit(20, false)).toMatchObject({ cap: 20, canAdd: false });
    expect(notebookEntryLimit(40, true)).toMatchObject({ cap: null, canAdd: true });
  });
});
