import { spawnSync } from 'node:child_process';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  createNotebookEntry,
  collectNotebook,
  groupNotebookByMonth,
  notebookDayKey,
  notebookLocalDay,
  renderNotebookBody,
  renderNotebookTitle,
  searchNotebook,
  sortNotebookEntries,
  validateNotebookEntry,
} from './notebook';

const NOW = new Date('2026-03-15T12:00:00Z');

const entry = (over = {}) => ({
  id: 'note-1',
  title: 'שיעור',
  body: '',
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:00:00Z',
  ...over,
});

const ALLOWED_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'ul', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'a',
]);

function tagsIn(html) {
  return [...String(html).matchAll(/<\/?([a-z0-9]+)/gi)].map((match) => match[1].toLowerCase());
}

function mount(html) {
  const document = new Window().document;
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

function assertSafeDom(root) {
  const nodes = [root, ...root.querySelectorAll('*')];
  nodes.forEach((el) => {
    [...el.attributes].forEach((attr) => {
      expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
      if (attr.name.toLowerCase() === 'href' || attr.name.toLowerCase() === 'src') {
        expect(attr.value).toMatch(/^https?:\/\//i);
      }
    });
  });
}

describe('validateNotebookEntry', () => {
  it('rejects a row that is not an object, and an entry with no title', () => {
    expect(validateNotebookEntry(null)).toEqual({ ok: false, code: 'invalid', message: 'רשומה לא תקינה.' });
    expect(validateNotebookEntry(['שיעור']).code).toBe('invalid');
    expect(validateNotebookEntry(entry({ title: '   ' })).code).toBe('title');
    expect(validateNotebookEntry(entry({ title: 12 })).code).toBe('title');
    expect(validateNotebookEntry(entry({ id: '' })).code).toBe('id');
    expect(validateNotebookEntry(entry({ id: '../secret' })).code).toBe('id');
  });

  it('keeps an empty body and drops an empty tag list, date, and journal name', () => {
    const result = validateNotebookEntry(entry({
      body: '   ',
      tags: [],
      date: '',
      journalName: '   ',
    }), NOW);
    expect(result.ok).toBe(true);
    expect(result.entry).toMatchObject({
      id: 'note-1',
      title: 'שיעור',
      body: '',
      tags: [],
      date: null,
      month: null,
      journalName: null,
      createdAt: '2026-03-15T10:00:00.000Z',
      updatedAt: '2026-03-15T10:00:00.000Z',
    });
  });

  it('accepts mixed Hebrew and English, and stamps a missing clock from now', () => {
    const result = validateNotebookEntry({
      id: 'note-mix',
      title: '  רעיון BTC מתחת ל-EMA  ',
      body: 'היום Long על BTC, ו-ETH נשאר בטווח.',
      tags: ['שיעור', ' BTC ', 'שיעור'],
      journalName: ' יומן קריפטו ',
      date: '2026-03-02',
    }, NOW);
    expect(result.ok).toBe(true);
    expect(result.entry).toMatchObject({
      title: 'רעיון BTC מתחת ל-EMA',
      tags: ['שיעור', 'BTC'],
      journalName: 'יומן קריפטו',
      date: '2026-03-02',
      month: '2026-03',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it('rejects a long title, a long body, a long tag, and too many tags', () => {
    expect(validateNotebookEntry(entry({ title: 'א'.repeat(120) })).ok).toBe(true);
    expect(validateNotebookEntry(entry({ title: 'א'.repeat(121) })).code).toBe('title');
    expect(validateNotebookEntry(entry({ body: 'ב'.repeat(20000) })).ok).toBe(true);
    expect(validateNotebookEntry(entry({ body: 'ב'.repeat(20001) })).code).toBe('body');
    expect(validateNotebookEntry(entry({ body: 12 })).code).toBe('body');
    expect(validateNotebookEntry(entry({ tags: ['א'.repeat(40)] })).ok).toBe(true);
    expect(validateNotebookEntry(entry({ tags: ['א'.repeat(41)] })).code).toBe('tags');
    expect(validateNotebookEntry(entry({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })).code).toBe('tags');
    expect(validateNotebookEntry(entry({ tags: ['<script>'] })).code).toBe('tags');
    expect(validateNotebookEntry(entry({ journalName: 'א'.repeat(81) })).code).toBe('journal');
  });

  it('stores XSS strings as plain text and does not keep unknown fields', () => {
    const xss = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const raw = entry({
      title: 'בדיקה <b>bold</b>',
      body: `${xss}\n\n**בטוח**`,
      html: '<script>alert(1)</script>',
      __proto__: { polluted: true },
    });
    const result = validateNotebookEntry(raw);
    expect(result.entry.body.startsWith('<script>alert(1)</script>')).toBe(true);
    expect(result.entry.title).toBe('בדיקה <b>bold</b>');
    expect(result.entry.html).toBeUndefined();
    expect(result.entry.polluted).toBeUndefined();
    expect(Object.keys(result.entry)).toEqual([
      'id', 'title', 'body', 'tags', 'date', 'month', 'journalName', 'createdAt', 'updatedAt',
    ]);
  });

  it('does not mutate the input and accepts its own normalized row', () => {
    const raw = entry({ body: 'טקסט', tags: ['יום'] });
    const copy = structuredClone(raw);
    const first = validateNotebookEntry(raw, NOW);
    expect(raw).toEqual(copy);
    expect(validateNotebookEntry(first.entry, new Date('2030-01-01T00:00:00Z')).entry).toEqual(first.entry);
  });

  it('rejects a clock that runs backwards', () => {
    const result = validateNotebookEntry(entry({
      createdAt: '2026-03-15T12:00:00Z',
      updatedAt: '2026-03-15T11:00:00Z',
    }));
    expect(result.code).toBe('timestamps');
  });
});

describe('notebookDayKey — Jerusalem month boundaries', () => {
  it('keeps a date-only day, and buckets instants on the Jerusalem calendar', () => {
    const cases = [
      ['2026-02-28', '2026-02-28'],
      ['2026-02-28T21:59:00Z', '2026-02-28'],
      ['2026-02-28T22:00:00Z', '2026-03-01'],
      ['2026-03-01', '2026-03-01'],
      ['2026-03-31T20:59:00Z', '2026-03-31'],
      ['2026-03-31T21:00:00Z', '2026-04-01'],
      ['2026-03-31T23:30:00+03:00', '2026-03-31'],
      ['2026-03-31T23:30:00+02:00', '2026-04-01'],
      ['2025-12-31T21:59:00Z', '2025-12-31'],
      ['2025-12-31T22:00:00Z', '2026-01-01'],
      ['2026-10-24T20:59:00Z', '2026-10-24'],
      ['2026-10-24T21:00:00Z', '2026-10-25'],
      ['2026-10-31T21:59:00Z', '2026-10-31'],
      ['2026-10-31T22:00:00Z', '2026-11-01'],
      ['2024-02-29', '2024-02-29'],
      ['2026-02-29', ''],
      ['2026-04-31', ''],
      ['2026-00-10', ''],
      ['2026-03', ''],
      ['31/03/2026', ''],
      ['', ''],
    ];
    cases.forEach(([input, day]) => {
      expect(notebookDayKey(input), String(input)).toBe(day);
    });
  });

  it('reads a Date, a timestamp, and a toDate() instant without treating them as UTC days', () => {
    expect(notebookDayKey(new Date('2026-02-28T22:00:00Z'))).toBe('2026-03-01');
    expect(notebookDayKey(Date.parse('2025-12-31T22:00:00Z'))).toBe('2026-01-01');
    const stamp = { toDate: () => new Date('2026-03-31T21:30:00Z') };
    expect(notebookDayKey(stamp)).toBe('2026-04-01');
    expect(notebookDayKey({ toDate() { throw new Error('unread'); } })).toBe('');
    expect(validateNotebookEntry(entry({ date: new Date('not a date') })).code).toBe('date');
  });

  it('puts the February/March instant on the Jerusalem month, not the UTC month', () => {
    const february = validateNotebookEntry(entry({
      id: 'feb',
      date: '2026-02-28T21:59:00Z',
    })).entry;
    const march = validateNotebookEntry(entry({
      id: 'mar',
      date: '2026-02-28T22:00:00Z',
    })).entry;
    expect(february).toMatchObject({ date: '2026-02-28', month: '2026-02' });
    expect(march).toMatchObject({ date: '2026-03-01', month: '2026-03' });
    const groups = groupNotebookByMonth([march, february]);
    expect(groups.map((group) => group.month)).toEqual(['2026-03', '2026-02']);
    expect(groups[0].label).toBe('מרץ 2026');
    expect(groups[1].entries.map((row) => row.id)).toEqual(['feb']);
  });
});

function dayOnClock(timeZone, input, { dateOnly = false } = {}) {
  const moduleUrl = new URL('./notebook.js', import.meta.url).href;
  const valueExpr = dateOnly
    ? JSON.stringify(input)
    : `new Date(${JSON.stringify(input)})`;
  const parsedExpr = dateOnly
    ? `new Date(${JSON.stringify(input)})`
    : valueExpr;
  const code = `
    import { notebookLocalDay } from ${JSON.stringify(moduleUrl)};
    const value = ${valueExpr};
    const parsed = ${parsedExpr};
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    process.stdout.write(JSON.stringify({
      day: notebookLocalDay(value),
      parsedLocal: parsed.getFullYear() + '-' + month + '-' + day,
      utc: parsed.toISOString().slice(0, 10),
      offset: parsed.getTimezoneOffset(),
    }));
  `;
  const node = globalThis.process;
  const result = spawnSync(node.execPath, ['--input-type=module', '-e', code], {
    env: { ...node.env, TZ: timeZone },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'date probe failed');
  return JSON.parse(result.stdout);
}

describe('notebookLocalDay — the device calendar, not UTC', () => {
  // Asia/Jerusalem is UTC+2 on 10 Nov 2026 and UTC+3 on 10 Jul 2026.
  // Each row is [zone, instant, civil day, expected getTimezoneOffset].
  const zones = [
    // 14:27. The note opened then was saved as 11/11; the clock said 10/11.
    ['Asia/Jerusalem', '2026-11-10T12:27:00Z', '2026-11-10', -120],
    // 23:30, still the 10th. Adding the offset in hours would land on the 11th.
    ['Asia/Jerusalem', '2026-11-10T21:30:00Z', '2026-11-10', -120],
    // 00:30 the next morning. toISOString().slice(0, 10) is still the 10th.
    ['Asia/Jerusalem', '2026-11-10T22:30:00Z', '2026-11-11', -120],
    // 02:30, inside the winter offset, still the 10th.
    ['Asia/Jerusalem', '2026-11-10T00:30:00Z', '2026-11-10', -120],
    // Summer, UTC+3. 14:27, 23:30, and 00:30 the next day.
    ['Asia/Jerusalem', '2026-07-10T11:27:00Z', '2026-07-10', -180],
    ['Asia/Jerusalem', '2026-07-10T20:30:00Z', '2026-07-10', -180],
    ['Asia/Jerusalem', '2026-07-10T21:30:00Z', '2026-07-11', -180],
  ];

  zones.forEach(([zone, iso, day, offset]) => {
    it(`${zone} ${iso} → ${day}`, () => {
      const got = dayOnClock(zone, iso);
      expect(got.offset).toBe(offset);
      expect(got.day).toBe(day);
      expect(got.parsedLocal).toBe(day);
      if (day !== got.utc) expect(got.utc).not.toBe(day);
    });
  });

  it('keeps a YYYY-MM-DD string on that civil day west of UTC', () => {
    const got = dayOnClock('Pacific/Honolulu', '2026-11-10', { dateOnly: true });
    expect(got.offset).toBe(600);
    expect(got.day).toBe('2026-11-10');
    // new Date('2026-11-10') is UTC midnight, the previous evening in Honolulu.
    expect(got.parsedLocal).toBe('2026-11-09');
    expect(got.utc).toBe('2026-11-10');
  });

  it('reads local fields at midnight and just before midnight', () => {
    expect(notebookLocalDay(new Date(2026, 10, 10, 0, 30))).toBe('2026-11-10');
    expect(notebookLocalDay(new Date(2026, 10, 10, 14, 27))).toBe('2026-11-10');
    expect(notebookLocalDay(new Date(2026, 10, 10, 23, 30))).toBe('2026-11-10');
    expect(notebookLocalDay(new Date(2026, 6, 10, 0, 30))).toBe('2026-07-10');
    expect(notebookLocalDay(new Date(2026, 6, 10, 23, 30))).toBe('2026-07-10');
    expect(notebookLocalDay(new Date(2026, 6, 11, 0, 30))).toBe('2026-07-11');
    expect(notebookLocalDay('2026-11-10')).toBe('2026-11-10');
    expect(notebookLocalDay('2026-02-29')).toBe('');
  });
});

describe('search, sort, and month groups', () => {
  const rows = [
    entry({
      id: 'late',
      title: 'סיכום שבוע',
      body: 'BTC עלה, ETH נשאר',
      tags: ['שבוע', 'BTC'],
      date: '2026-03-20',
      journalName: 'יומן קריפטו',
      createdAt: '2026-03-20T08:00:00Z',
      updatedAt: '2026-03-20T08:00:00Z',
    }),
    entry({
      id: 'early',
      title: 'רעיון לונג',
      body: 'לחכות לאישור',
      tags: ['רעיון'],
      date: '2026-03-02',
      createdAt: '2026-03-02T08:00:00Z',
      updatedAt: '2026-03-02T08:00:00Z',
    }),
    entry({
      id: 'same-day',
      title: 'עוד רעיון',
      body: 'אותו יום',
      date: '2026-03-02',
      createdAt: '2026-03-02T08:00:00Z',
      updatedAt: '2026-03-02T18:00:00Z',
    }),
    entry({
      id: 'january',
      title: 'לקח ישן',
      body: 'לא לרדוף',
      tags: ['לקח'],
      date: '2026-01-15',
      createdAt: '2026-01-15T08:00:00Z',
      updatedAt: '2026-01-15T08:00:00Z',
    }),
    entry({
      id: 'undated',
      title: 'בלי יום',
      body: 'נכתב אחרי חצות UTC ועדיין ינואר בירושלים',
      updatedAt: '2025-12-31T21:30:00Z',
      createdAt: '2025-12-31T21:30:00Z',
    }),
    entry({ id: 'bad', title: '' }),
  ];

  it('returns an empty book for no rows', () => {
    expect(collectNotebook([])).toEqual({ entries: [], rejected: [] });
    expect(collectNotebook(null)).toEqual({ entries: [], rejected: [] });
    expect(searchNotebook(undefined, 'btc')).toEqual([]);
    expect(groupNotebookByMonth('nope')).toEqual([]);
    expect(sortNotebookEntries(null)).toEqual([]);
  });

  it('sorts newest day first and leaves an invalid row out', () => {
    const collected = collectNotebook(rows);
    expect(collected.rejected).toEqual([
      { index: 5, code: 'title', message: 'כותרת חסרה או ארוכה מדי.' },
    ]);
    expect(collected.entries.map((row) => row.id)).toEqual(['late', 'same-day', 'early', 'january', 'undated']);
    expect(sortNotebookEntries(rows).map((row) => row.id)).toEqual(collected.entries.map((row) => row.id));
  });

  it('groups an undated note by the Jerusalem month of updatedAt', () => {
    const groups = groupNotebookByMonth(rows);
    expect(groups.map((group) => [group.month, group.label, group.entries.map((row) => row.id)])).toEqual([
      ['2026-03', 'מרץ 2026', ['late', 'same-day', 'early']],
      ['2026-01', 'ינואר 2026', ['january']],
      ['2025-12', 'דצמבר 2025', ['undated']],
    ]);
    const yearBoundary = validateNotebookEntry(entry({
      id: 'new-year',
      title: 'שנה חדשה',
      date: null,
      createdAt: '2025-12-31T22:00:00Z',
      updatedAt: '2025-12-31T22:00:00Z',
    })).entry;
    expect(groupNotebookByMonth([yearBoundary])[0].month).toBe('2026-01');
  });

  it('searches mixed Hebrew and English text, and filters by tag', () => {
    expect(searchNotebook(rows, 'btc').map((row) => row.id)).toEqual(['late']);
    expect(searchNotebook(rows, 'ETH').map((row) => row.id)).toEqual(['late']);
    expect(searchNotebook(rows, { text: 'רעיון' }).map((row) => row.id)).toEqual(['same-day', 'early']);
    expect(searchNotebook(rows, { tag: 'btc' }).map((row) => row.id)).toEqual(['late']);
    expect(searchNotebook(rows, { text: 'קריפטו', tag: 'שבוע' }).map((row) => row.id)).toEqual(['late']);
    expect(searchNotebook(rows, { text: 'btc', tag: 'לקח' })).toEqual([]);
    expect(searchNotebook(rows, '   ').map((row) => row.id)).toEqual(['late', 'same-day', 'early', 'january', 'undated']);
  });
});

describe('renderNotebookBody', () => {
  it('renders an empty body as nothing', () => {
    expect(renderNotebookBody('')).toBe('');
    expect(renderNotebookBody(null)).toBe('');
    expect(renderNotebookBody(undefined)).toBe('');
    expect(renderNotebookTitle('')).toBe('');
  });

  it('renders mixed Hebrew and English markdown, and escapes the rest', () => {
    const html = renderNotebookBody([
      '# שיעור **BTC**',
      '',
      'היום *Long* על ETH מתחת ל-100.',
      '',
      '- לא לרדוף',
      '- לחכות',
      '',
      '> כלל אחד',
      '',
      '`EMA` נשאר',
      '',
      '```',
      'price < 100 && size > 0',
      '```',
      '',
      '[מקור](https://example.com/lesson?a=1&b=2)',
    ].join('\n'));
    expect(html).toContain('<h1>שיעור <strong>BTC</strong></h1>');
    expect(html).toContain('<em>Long</em>');
    expect(html).toContain('<li>לא לרדוף</li>');
    expect(html).toContain('<blockquote>כלל אחד</blockquote>');
    expect(html).toContain('<code>EMA</code>');
    expect(html).toContain('<pre><code>price &lt; 100 &amp;&amp; size &gt; 0</code></pre>');
    expect(html).toContain('<a href="https://example.com/lesson?a=1&amp;b=2" rel="noopener noreferrer">מקור</a>');
    expect(tagsIn(html).every((tag) => ALLOWED_TAGS.has(tag))).toBe(true);
  });

  it('keeps XSS strings as text and refuses a javascript link', () => {
    const xss = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '[לחץ](javascript:alert(1))',
      '[דאטה](data:text/html,<script>alert(1)</script>)',
      '**בטוח <script>alert("xss")</script>**',
      'שיעור BTC',
    ].join('\n\n');
    const stored = validateNotebookEntry(entry({
      title: 'כותרת <img src=x onerror=alert(1)>',
      body: xss,
    })).entry;
    expect(stored.body).toContain('<script>alert(1)</script>');
    const html = renderNotebookBody(stored.body);
    const root = mount(html);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
    assertSafeDom(root);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>בטוח &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</strong>');
    expect(root.textContent).toContain('<script>alert(1)</script>');
    expect(root.textContent).toContain('שיעור BTC');

    const titleHtml = renderNotebookTitle(stored.title);
    const titleRoot = mount(titleHtml);
    expect(titleRoot.querySelector('img')).toBeNull();
    expect(titleHtml).toContain('&lt;img');
    expect(titleHtml.startsWith('כותרת ')).toBe(true);
    assertSafeDom(titleRoot);
    expect(tagsIn(html).every((tag) => ALLOWED_TAGS.has(tag))).toBe(true);
  });

  it('does not let a fenced block close itself with a forged end tag', () => {
    const html = renderNotebookBody('```\n</code></pre><script>alert(1)</script>\n```');
    const root = mount(html);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelectorAll('pre').length).toBe(1);
    expect(html).toContain('&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;');
  });
});

describe('createNotebookEntry', () => {
  it('fills an id and timestamps for a title-only draft', () => {
    const result = createNotebookEntry({ title: 'רעיון', body: '' }, NOW);
    expect(result.ok).toBe(true);
    expect(result.entry.id.startsWith('nb_')).toBe(true);
    expect(result.entry.body).toBe('');
    expect(result.entry.createdAt).toBe(NOW.toISOString());
    expect(result.entry.updatedAt).toBe(NOW.toISOString());
  });
});
