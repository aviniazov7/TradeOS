// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import BusinessLedgerPage from './BusinessLedgerPage';
import Sidebar from '../layout/Sidebar';
import { createMemoryBusinessLedgerStore } from '../../services/businessLedgerStore';

const NOW = new Date('2026-03-20T12:00:00Z');
const JOURNALS = [{ id: 'j-ftmo', name: 'FTMO 100K' }];

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

function net(currency) {
  return document.querySelector(`[data-testid="business-net"][data-currency="${currency}"]`);
}

const sample = [
  { id: 'a', kind: 'income', category: 'payout', amount: 400, currency: 'USD', date: '2026-03-10', journalId: 'j-ftmo', note: 'תשלום מרץ' },
  { id: 'b', kind: 'expense', category: 'challenge_fee', amount: 155, currency: 'USD', date: '2026-03-04', note: 'אתגר' },
  { id: 'c', kind: 'expense', category: 'subscription', amount: 49, currency: 'ILS', date: '2026-03-06' },
];

describe('ניהול עסק', () => {
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
    if (!navigator.clipboard) navigator.clipboard = { writeText: async () => {} };
  });

  it('explains an empty book and does not show a sample until the demo flag is on', async () => {
    const enter = vi.fn();
    const view = await mount(
      <BusinessLedgerPage demo={false} isPremium={false} now={NOW} onEnterDemo={enter} />,
    );
    expect(text()).toContain('אין רשומות עדיין');
    expect(text()).toContain('דמי אתגר, איפוסים, מנויים, תשלומים ומשיכות');
    expect(document.querySelector('[data-testid="business-demo-flag"]')).toBeNull();
    expect(net('USD')).toBeNull();
    await act(async () => { buttonNamed('צפה בדוגמה').click(); });
    expect(enter).toHaveBeenCalledOnce();
    await view.cleanup();
  });

  it('shows the marked demo, monthly nets per currency, and the free lock', async () => {
    const view = await mount(
      <BusinessLedgerPage demo isPremium={false} journals={JOURNALS} now={NOW} />,
    );
    expect(document.querySelector('[data-testid="business-demo-flag"]').textContent).toContain('מצב דמו');
    expect(text()).toContain('דמי אתגר');
    expect(text()).toContain('FTMO 100K');
    expect(net('USD').getAttribute('data-net')).toBe('245');
    expect(net('ILS').getAttribute('data-net')).toBe('-49');
    expect(net('USDT').getAttribute('data-net')).toBe('25');
    expect(document.querySelector('[data-testid="business-net-total"]')).toBeNull();
    expect(document.querySelector('[data-testid="business-premium-lock"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="business-report"]')).toBeNull();
    expect(document.querySelector('[data-testid="business-chart"]')).toBeNull();
    expect(text()).toContain('מתוך 15');
    await view.cleanup();
  });

  it('stops a free book at 15 entries', async () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      id: `row-${index}`,
      kind: 'expense',
      category: 'other',
      amount: 1,
      currency: 'USD',
      date: '2026-03-02',
    }));
    const view = await mount(
      <BusinessLedgerPage
        demo={false}
        isPremium={false}
        now={NOW}
        store={createMemoryBusinessLedgerStore(rows)}
      />,
    );
    expect(net('USD').getAttribute('data-net')).toBe('-15');
    expect(document.querySelector('[data-testid="business-add"]').disabled).toBe(true);
    expect(text()).toContain('שדרג ל-Premium');
    await view.cleanup();
  });

  it('adds, edits, and deletes on the memory book, and copies the premium report', async () => {
    const store = createMemoryBusinessLedgerStore(sample);
    const writeText = vi.fn(async () => {});
    navigator.clipboard.writeText = writeText;
    const view = await mount(
      <BusinessLedgerPage demo={false} isPremium journals={JOURNALS} now={NOW} store={store} />,
    );
    expect(net('USD').getAttribute('data-net')).toBe('245');
    expect(net('ILS').getAttribute('data-net')).toBe('-49');
    expect(text()).toContain('FTMO 100K');
    expect(document.querySelector('[data-testid="business-chart"]').getAttribute('data-currency')).toBe('USD');
    const report = document.querySelector('[data-testid="business-report"]').textContent;
    expect(report).toContain('ניהול עסק — מרץ 2026');
    expect(report).toContain('דולר (USD)');
    expect(report).toContain('שקל (ILS)');
    expect(report).not.toContain('294');

    await act(async () => { buttonNamed('העתקת הדוח').click(); });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('מרץ 2026'));

    await act(async () => { buttonNamed('שקל').click(); });
    expect(document.querySelector('[data-testid="business-chart"]').getAttribute('data-currency')).toBe('ILS');

    const card = document.querySelector('[data-testid="business-entry-b"]');
    await act(async () => { buttonNamed('עריכה', card).click(); });
    const note = document.getElementById('biz-note');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(note, 'אתגר מעודכן');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { buttonNamed('שמירה').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('אתגר מעודכן');

    const ils = document.querySelector('[data-testid="business-entry-c"]');
    await act(async () => { buttonNamed('מחיקה', ils).click(); });
    await act(async () => { buttonNamed('אישור מחיקה', ils).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-testid="business-entry-c"]')).toBeNull();
    expect(net('ILS')).toBeNull();

    await act(async () => { document.querySelector('[data-testid="business-add"]').click(); });
    const amount = document.getElementById('biz-amount');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(amount, '10');
      amount.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { buttonNamed('שמירה').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('$10.00');
    const listed = await store.list();
    expect(listed.some((entry) => entry.amount === 10 && entry.kind === 'expense')).toBe(true);
    expect(listed.some((entry) => entry.netPnl != null)).toBe(false);
    await view.cleanup();
  });

  it('puts ניהול עסק in the side menu next to the other pages', async () => {
    const view = await mount(<Sidebar mobileOpen onClose={() => {}} />);
    const link = document.querySelector('nav[aria-label="תפריט ראשי"] a[href="/business"]');
    expect(link.textContent).toContain('ניהול עסק');
    const labels = [...document.querySelectorAll('nav[aria-label="תפריט ראשי"] a')].map((anchor) => anchor.textContent);
    expect(labels.indexOf('תוכניות מסחר')).toBeLessThan(labels.indexOf('ניהול עסק'));
    await view.cleanup();
  });
});
