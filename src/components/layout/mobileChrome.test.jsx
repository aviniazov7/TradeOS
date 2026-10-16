// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import PageHeader from '../shared/PageHeader';

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ activeJournal: null, journals: [] }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Avi' },
    profile: { displayName: 'Avi', settings: { assetClasses: ['crypto'] } },
    isAdmin: false,
  }),
}));

vi.mock('../../hooks/useWorkerQuotes', () => ({
  useWorkerQuotes: () => ({ prices: {}, loading: false, failed: false, retry: () => {} }),
}));

vi.mock('../../services/coingeckoApi', () => ({
  fetchPrices: vi.fn(async () => ({})),
}));

const JOURNAL_TABS = [
  { id: 'trades', label: 'עסקאות' },
  { id: 'analytics', label: 'אנליטיקה' },
  { id: 'calendar', label: 'יומן חודשי' },
  { id: 'exchange', label: 'חיבור בורסאות' },
];

function shell(node) {
  return (
    <MemoryRouter initialEntries={['/journal?tab=analytics']}>
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
  return {
    html: el.innerHTML,
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('mobile chrome', () => {
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

  it('keeps the side menu to one journal row', async () => {
    const view = await mount(<Sidebar mobileOpen onClose={() => {}} />);
    const nav = document.querySelector('nav[aria-label="תפריט ראשי"]');
    const journal = [...nav.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/journal');
    expect(journal).toHaveLength(1);
    expect(journal[0].textContent).toContain('יומן מסחר');
    expect(nav.querySelector('a[href="/journal?tab=analytics"]')).toBeNull();
    expect(nav.querySelector('a[href="/journal?tab=calendar"]')).toBeNull();
    expect(nav.querySelector('a[href="/journal?tab=exchange"]')).toBeNull();
    expect(nav.textContent).not.toContain('חיבור בורסאות');
    await view.cleanup();
  });

  it('centers the TradeOS mark on the phone header and keeps the ticker row', async () => {
    const view = await mount(<Header onToggleSidebar={() => {}} sidebarOpen={false} />);
    const brand = document.querySelector('[data-testid="header-brand"]');
    expect(brand).toBeTruthy();
    expect(brand.className).toContain('md:hidden');
    expect(brand.className).toContain('left-1/2');
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.textContent).toContain('TradeOS');
    expect(brand.querySelector('svg')).toBeTruthy();
    expect(brand.textContent).not.toContain('מערכת ההפעלה למסחר');
    const ticker = document.querySelector('[data-testid="mobile-ticker"]');
    expect(ticker.className).toContain('md:hidden');
    expect(ticker.textContent.length).toBeGreaterThan(0);
    expect(brand.compareDocumentPosition(ticker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const desktopTicker = [...document.querySelectorAll('header div')].find((el) => el.className.includes('hidden') && el.className.includes('md:block'));
    expect(desktopTicker).toBeTruthy();
    expect(desktopTicker.contains(brand)).toBe(false);
    await view.cleanup();
  });

  it('puts journal tabs in an underline row under the title on phones', async () => {
    const view = await mount(
      <PageHeader
        icon={BookOpen}
        title="יומן המסחר"
        compactMobile
        tabs={{ tabs: JOURNAL_TABS, value: 'analytics', onChange: () => {} }}
        actions={<button type="button" aria-label="עסקה חדשה">+</button>}
      />,
    );
    const scroller = document.querySelector('[data-tab-scroller]');
    const title = document.querySelector('h1');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(scroller.getAttribute('dir')).toBe('rtl');
    expect(scroller.className).toContain('overflow-x-auto');
    expect(scroller.className).toContain('md:hidden');
    expect(scroller.className).toContain('border-b');
    expect(scroller.className).not.toContain('bg-bg-tertiary');
    expect(scroller.className).not.toContain('rounded-xl');
    expect(title.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const list = scroller.querySelector('[role="tablist"]');
    expect(list.className).toContain('flex-nowrap');
    expect(list.className).toContain('w-max');
    const tabs = [...scroller.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['עסקאות', 'אנליטיקה', 'יומן חודשי', 'חיבור בורסאות']);
    tabs.forEach((tab) => {
      expect(tab.className).toContain('whitespace-nowrap');
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('border-b-2');
    });
    const active = scroller.querySelector('[aria-selected="true"]');
    expect(active.textContent).toBe('אנליטיקה');
    expect(active.className).toContain('text-accent-primary');
    expect(active.className).toContain('border-accent-primary');
    expect(active.className).not.toContain('bg-accent-primary/15');
    const desktop = document.querySelector('.hidden.md\\:block [role="tablist"]');
    expect(desktop).toBeTruthy();
    expect(scroller.contains(desktop)).toBe(false);
    await view.cleanup();
  });
});
