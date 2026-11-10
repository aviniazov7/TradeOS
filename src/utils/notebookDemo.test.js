import { describe, expect, it } from 'vitest';
import { FREE_LIMITS } from './constants';
import { buildNotebookDemoEntries } from './notebookDemo';
import { notebookEntryLimit } from '../components/notebook/notebookView';
import { groupNotebookByMonth, notebookDayKey, renderNotebookBody } from './notebook';

const NOW = new Date('2026-03-20T12:00:00Z');

function byId(rows) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

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
    const dated = byId(rows);
    expect(dated['demo-nb-lesson'].date).toBe('2026-03-18');
    expect(dated['demo-nb-idea'].date).toBe('2026-03-11');
    expect(dated['demo-nb-week'].date).toBe('2026-02-20');
  });

  it('dates every demo entry on or before today, including early in the month', () => {
    const samples = [
      '2026-11-10T12:06:00Z',
      '2026-11-02T00:30:00Z',
      '2026-11-01T12:00:00Z',
      '2026-03-01T12:00:00Z',
      '2026-01-01T12:00:00Z',
      '2024-03-01T12:00:00Z',
      '2024-02-29T12:00:00Z',
      '2026-03-20T12:00:00Z',
    ];
    samples.forEach((iso) => {
      const now = new Date(iso);
      const today = notebookDayKey(now);
      const rows = buildNotebookDemoEntries({ now });
      expect(rows, iso).toHaveLength(3);
      const months = new Set();
      rows.forEach((row) => {
        expect(row.date <= today, `${iso} ${row.id} ${row.date}`).toBe(true);
        expect(row.date >= '1970-01-01', row.date).toBe(true);
        expect(new Date(row.createdAt).getTime(), row.id).toBeLessThanOrEqual(now.getTime());
        expect(new Date(row.updatedAt).getTime(), row.id).toBeLessThanOrEqual(now.getTime());
        expect(row.updatedAt >= row.createdAt).toBe(true);
        months.add(row.month);
      });
      expect(months.size, iso).toBeGreaterThanOrEqual(2);
      const lesson = rows.find((row) => row.id === 'demo-nb-lesson');
      expect(lesson.month, iso).toBe(today.slice(0, 7));
    });

    const early = byId(buildNotebookDemoEntries({ now: new Date('2026-11-10T12:06:00Z') }));
    expect(notebookDayKey(new Date('2026-11-10T12:06:00Z'))).toBe('2026-11-10');
    expect(early['demo-nb-lesson'].date).toBe('2026-11-08');
    expect(early['demo-nb-idea'].date).toBe('2026-11-01');
    expect(early['demo-nb-week'].date).toBe('2026-10-20');
    expect(early['demo-nb-lesson'].date).not.toBe('2026-11-18');

    const first = byId(buildNotebookDemoEntries({ now: new Date('2026-11-01T12:00:00Z') }));
    expect(first['demo-nb-lesson'].date).toBe('2026-11-01');
    expect(first['demo-nb-idea'].date).toBe('2026-10-23');
    expect(first['demo-nb-week'].date).toBe('2026-10-20');

    const later = byId(buildNotebookDemoEntries({ now: new Date('2026-11-20T12:00:00Z') }));
    expect(later['demo-nb-lesson'].date).toBe('2026-11-18');
    expect(later['demo-nb-lesson'].date < '2026-11-20').toBe(true);
  });

  it('caps the free list at 20 and leaves premium unlimited', () => {
    expect(FREE_LIMITS.notebookEntries).toBe(20);
    expect(notebookEntryLimit(19, false).canAdd).toBe(true);
    expect(notebookEntryLimit(20, false)).toMatchObject({ cap: 20, canAdd: false });
    expect(notebookEntryLimit(40, true)).toMatchObject({ cap: null, canAdd: true });
  });
});
