// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import NotebookPage from './NotebookPage';
import Sidebar from '../layout/Sidebar';
import GlobalSearch from '../layout/GlobalSearch';
import { createMemoryNotebookStore } from '../../services/notebookStore';
import { displayNotebookDay } from './notebookView';

const NOW = new Date('2026-03-20T12:00:00Z');
const JOURNALS = [{ id: 'j-ftmo', name: 'FTMO 100K', archived: false }];

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isPremium: false, isAdmin: false, loading: false }),
}));

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ active: false, enter: vi.fn(), exit: vi.fn() }),
}));

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ journals: [] }),
}));

vi.mock('../../services/adminInboxService', () => ({
  subscribeAdminMailboxUnread: () => () => {},
}));

vi.mock('../../services/firestoreService', () => ({
  getUserCollectionDocs: vi.fn(async () => []),
}));

function shell(node) {
  return (
    <MemoryRouter>
      <LazyMotion features={domAnimation} strict>
        {node}
      </LazyMotion>
    </MemoryRouter>
  );
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(node)); });
  await act(async () => { await Promise.resolve(); });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function text() {
  return document.body.textContent.replace(/\s+/g, ' ');
}

function buttonNamed(name, root = document) {
  return [...root.querySelectorAll('button')].find((btn) => btn.textContent.replace(/\s+/g, ' ').includes(name));
}

function setValue(el, value) {
  const proto = el instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const sample = [
  {
    id: 'lesson',
    title: 'לקח על BTC',
    body: 'היום **לא רדפתי**.\n\n<script>alert(1)</script>',
    tags: ['לקח', 'BTC'],
    date: '2026-03-18',
    journalName: 'FTMO 100K',
    createdAt: '2026-03-18T08:00:00Z',
    updatedAt: '2026-03-18T08:00:00Z',
  },
  {
    id: 'idea',
    title: 'רעיון Long',
    body: 'ETH מתחת ל-EMA',
    tags: ['רעיון'],
    date: '2026-03-04',
    createdAt: '2026-03-04T08:00:00Z',
    updatedAt: '2026-03-04T08:00:00Z',
  },
  {
    id: 'week',
    title: 'סיכום שבוע',
    body: 'שבוע שקט',
    tags: ['שבוע'],
    date: '2026-02-20',
    createdAt: '2026-02-20T08:00:00Z',
    updatedAt: '2026-02-20T08:00:00Z',
  },
];

describe('מחברת', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
      finished,
      ready: finished,
      currentTime: 0,
      playState: 'finished',
    });
  });

  it('explains an empty notebook and does not show a sample until demo is entered', async () => {
    const enter = vi.fn();
    const view = await mount(
      <NotebookPage demo={false} isPremium={false} now={NOW} onEnterDemo={enter} />,
    );
    expect(text()).toContain('המחברת ריקה');
    expect(text()).toContain('הערה חופשית ליום מסחר');
    expect(text()).toContain('השמירה לחשבון עדיין לא מופעלת');
    expect(document.querySelector('[data-testid="notebook-storage-note"]').textContent).toContain('השמירה לחשבון עדיין לא מופעלת');
    expect(document.querySelector('[data-testid="notebook-demo-flag"]')).toBeNull();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeNull();
    await act(async () => { buttonNamed('מצב דמו').click(); });
    expect(enter).toHaveBeenCalled();
    await view.cleanup();
  });

  it('shows the marked demo, groups months, and keeps the tag filter locked on the free plan', async () => {
    const view = await mount(
      <NotebookPage demo isPremium={false} journals={JOURNALS} now={NOW} />,
    );
    expect(document.querySelector('[data-testid="notebook-demo-flag"]').textContent).toContain('מצב דמו');
    expect(document.querySelector('[data-testid="notebook-storage-note"]').textContent).toContain('השמירה לחשבון עדיין לא מופעלת');
    expect(text()).toContain('FTMO 100K');
    expect(text()).toContain('מרץ 2026');
    expect(text()).toContain('פברואר 2026');
    expect(document.querySelector('[data-testid="notebook-month-2026-03"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-month-2026-02"]')).toBeTruthy();
    const lesson = document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]');
    expect(lesson.querySelector('script')).toBeNull();
    expect(lesson.querySelector('strong').textContent).toBe('לא רדפתי');
    expect(document.querySelector('[data-testid="notebook-tag-lock"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-tag-filter"]')).toBeNull();
    expect(text()).toContain('מתוך 20');

    const search = document.getElementById('notebook-search');
    await act(async () => { setValue(search, 'btc'); });
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-week"]')).toBeNull();
    expect(document.querySelector('[data-testid="notebook-month-2026-02"]')).toBeNull();
    await view.cleanup();
  });

  it('opens demo entries, search, and an in-memory new entry when the global demo flag stays off', async () => {
    const view = await mount(
      <NotebookPage isPremium journals={JOURNALS} now={NOW} />,
    );
    expect(document.querySelector('[data-testid="notebook-search"]')).toBeNull();
    expect(document.querySelector('[data-testid="notebook-add"]').disabled).toBe(true);
    await act(async () => { buttonNamed('מצב דמו').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-testid="notebook-demo-flag"]').textContent).toContain('מצב דמו');
    expect(document.querySelector('[data-testid="notebook-storage-note"]').textContent).toContain('השמירה לחשבון עדיין לא מופעלת');
    expect(document.querySelector('[data-testid="notebook-search"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-tag-filter"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeTruthy();
    const add = document.querySelector('[data-testid="notebook-add"]');
    expect(add.disabled).toBe(false);
    await act(async () => { add.click(); });
    expect(document.getElementById('notebook-title')).toBeTruthy();
    await act(async () => { setValue(document.getElementById('notebook-title'), 'הערה חדשה'); });
    await act(async () => { setValue(document.getElementById('notebook-body'), 'נשמרת רק על המסך'); });
    await act(async () => { buttonNamed('שמירה').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('הערה חדשה');
    expect(document.querySelector('[data-testid="notebook-storage-note"]')).toBeTruthy();
    await view.cleanup();
  });

  it('lets a premium reader filter by tag and marks the active chip', async () => {
    const view = await mount(
      <NotebookPage demo isPremium journals={JOURNALS} now={NOW} />,
    );
    expect(document.querySelector('[data-testid="notebook-tag-lock"]')).toBeNull();
    const filter = document.querySelector('[data-testid="notebook-tag-filter"]');
    const all = buttonNamed('כל התגיות', filter);
    const btc = buttonNamed('BTC', filter);
    const week = buttonNamed('שבוע', filter);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(all.className).toContain('bg-accent-primary/15');
    expect(all.className).toContain('border-accent-primary');
    expect(all.className).toContain('text-accent-hover');
    expect(btc.getAttribute('aria-pressed')).toBe('false');
    expect(btc.className).not.toContain('bg-accent-primary/15');
    expect(btc.className).toContain('border-border-primary');
    expect(btc.className).toContain('text-text-secondary');
    expect([...filter.querySelectorAll('button')].filter((btn) => btn.getAttribute('aria-pressed') === 'true')).toHaveLength(1);

    await act(async () => { btc.click(); });
    expect(btc.getAttribute('aria-pressed')).toBe('true');
    expect(btc.className).toContain('bg-accent-primary/15');
    expect(btc.className).toContain('text-accent-hover');
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(all.className).not.toContain('bg-accent-primary/15');
    expect(all.className).toContain('border-border-primary');
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-idea"]')).toBeNull();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-week"]')).toBeNull();

    await act(async () => { week.click(); });
    expect(week.getAttribute('aria-pressed')).toBe('true');
    expect(week.className).toContain('bg-accent-primary/15');
    expect(btc.getAttribute('aria-pressed')).toBe('false');
    expect(btc.className).not.toContain('bg-accent-primary/15');
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-week"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeNull();
    expect(document.querySelector('[data-testid="notebook-month-2026-02"]')).toBeTruthy();

    await act(async () => { all.click(); });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(all.className).toContain('bg-accent-primary/15');
    expect(week.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-lesson"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="notebook-entry-demo-nb-idea"]')).toBeTruthy();
    await view.cleanup();
  });

  it('does not render a demo entry dated after today', async () => {
    const now = new Date('2026-11-10T12:06:00Z');
    const view = await mount(
      <NotebookPage demo isPremium journals={JOURNALS} now={now} />,
    );
    expect(text()).not.toContain('18/11/2026');
    expect(text()).toContain('08/11/2026');
    expect(text()).toContain('01/11/2026');
    expect(text()).toContain('20/10/2026');
    expect(text()).toContain('נובמבר 2026');
    expect(text()).toContain('אוקטובר 2026');
    await view.cleanup();
  });

  it('stops a free notebook at 20 entries', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: `row-${index}`,
      title: `הערה ${index}`,
      body: '',
      date: '2026-03-02',
      createdAt: '2026-03-02T08:00:00Z',
      updatedAt: '2026-03-02T08:00:00Z',
    }));
    const view = await mount(
      <NotebookPage
        demo={false}
        isPremium={false}
        now={NOW}
        store={createMemoryNotebookStore(rows)}
      />,
    );
    expect(document.querySelector('[data-testid="notebook-add"]').disabled).toBe(true);
    expect(text()).toContain('שדרג ל-Premium');
    expect(document.querySelectorAll('[data-testid^="notebook-entry-"]').length).toBe(20);
    await view.cleanup();
  });

  it('adds, edits, and deletes on the memory book, and renders XSS as text', async () => {
    const store = createMemoryNotebookStore(sample);
    const view = await mount(
      <NotebookPage demo={false} isPremium journals={JOURNALS} now={NOW} store={store} />,
    );
    const lesson = document.querySelector('[data-testid="notebook-entry-lesson"]');
    expect(lesson.querySelector('script')).toBeNull();
    expect(lesson.textContent).toContain('<script>alert(1)</script>');
    expect(lesson.querySelector('strong').textContent).toBe('לא רדפתי');
    expect(text()).toContain('FTMO 100K');
    expect(document.querySelector('[data-testid="notebook-tag-filter"]')).toBeTruthy();

    await act(async () => { buttonNamed('עריכה', lesson).click(); });
    const title = document.getElementById('notebook-title');
    await act(async () => { setValue(title, 'לקח מעודכן'); });
    await act(async () => { buttonNamed('שמירה').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('לקח מעודכן');
    expect(text()).toContain('18/03/2026');
    const edited = (await store.list()).find((entry) => entry.title === 'לקח מעודכן');
    expect(edited.date).toBe('2026-03-18');

    const week = document.querySelector('[data-testid="notebook-entry-week"]');
    await act(async () => { buttonNamed('מחיקה', week).click(); });
    await act(async () => { buttonNamed('אישור מחיקה', week).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-testid="notebook-entry-week"]')).toBeNull();

    await act(async () => { document.querySelector('[data-testid="notebook-add"]').click(); });
    await act(async () => { setValue(document.getElementById('notebook-title'), 'הערה חדשה'); });
    await act(async () => { setValue(document.getElementById('notebook-body'), '**בטוח** <img src=x onerror=alert(1)>'); });
    const preview = document.querySelector('[data-testid="notebook-preview"]');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('strong').textContent).toContain('בטוח');
    await act(async () => { buttonNamed('שמירה').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('הערה חדשה');
    const listed = await store.list();
    expect(listed.some((entry) => entry.title === 'הערה חדשה')).toBe(true);
    expect(document.body.querySelector('img')).toBeNull();
    await view.cleanup();
  });

  it('slices a civil day for display and does not parse it as a timestamp', () => {
    expect(displayNotebookDay('2026-11-10')).toBe('10/11/2026');
    expect(displayNotebookDay('2026-07-11')).toBe('11/07/2026');
    expect(displayNotebookDay('2026-11-10T22:30:00.000Z')).toBe('');
  });

  it('defaults a new demo entry to the local calendar day, not the next day', async () => {
    const cases = [
      [new Date(2026, 10, 10, 14, 27), '10.11.2026', '10/11/2026', '2026-11-10'],
      [new Date(2026, 10, 10, 0, 30), '10.11.2026', '10/11/2026', '2026-11-10'],
      [new Date(2026, 10, 10, 23, 30), '10.11.2026', '10/11/2026', '2026-11-10'],
      [new Date(2026, 6, 10, 14, 27), '10.07.2026', '10/07/2026', '2026-07-10'],
      [new Date(2026, 6, 11, 0, 30), '11.07.2026', '11/07/2026', '2026-07-11'],
      [new Date(2026, 6, 10, 23, 30), '10.07.2026', '10/07/2026', '2026-07-10'],
    ];
    for (const [now, field, shown, stored] of cases) {
      const store = createMemoryNotebookStore([]);
      const view = await mount(
        <NotebookPage demo isPremium journals={JOURNALS} now={now} store={store} />,
      );
      await act(async () => { document.querySelector('[data-testid="notebook-add"]').click(); });
      const dateBtn = document.getElementById('notebook-date');
      expect(dateBtn.textContent, String(now)).toContain(field);
      await act(async () => { setValue(document.getElementById('notebook-title'), 'היי'); });
      await act(async () => { buttonNamed('שמירה').click(); });
      await act(async () => { await Promise.resolve(); });
      const row = (await store.list()).find((entry) => entry.title === 'היי');
      expect(row.date, String(now)).toBe(stored);
      expect(row.date, String(now)).not.toBe('2026-11-11');
      const card = [...document.querySelectorAll('[data-testid^="notebook-entry-"]')]
        .find((node) => node.textContent.includes('היי'));
      expect(card.textContent, String(now)).toContain(shown);
      expect(card.textContent, String(now)).not.toContain('11/11/2026');
      await view.cleanup();
    }
  });

  it('puts מחברת in the side menu next to the journal, and in search', async () => {
    const view = await mount(
      <>
        <Sidebar mobileOpen onClose={() => {}} />
        <GlobalSearch />
      </>,
    );
    const link = document.querySelector('nav[aria-label="תפריט ראשי"] a[href="/notebook"]');
    expect(link.textContent).toContain('מחברת');
    const labels = [...document.querySelectorAll('nav[aria-label="תפריט ראשי"] a')].map((anchor) => anchor.textContent);
    expect(labels.indexOf('יומן מסחר')).toBeLessThan(labels.indexOf('מחברת'));
    expect(labels.indexOf('מחברת')).toBeLessThan(labels.indexOf('בקטסט'));

    await act(async () => { document.querySelector('button[aria-label="חיפוש"]').click(); });
    await act(async () => { await Promise.resolve(); });
    const searchLink = [...document.querySelectorAll('button')].find((btn) => btn.textContent.includes('מחברת'));
    expect(searchLink).toBeTruthy();
    await view.cleanup();
  });
});
