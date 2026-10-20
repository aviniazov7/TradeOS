// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PortfolioPage from './PortfolioPage';
import Sidebar from '../layout/Sidebar';
import GlobalSearch from '../layout/GlobalSearch';

vi.mock('../dca/DCATracker', () => ({ default: () => null }));
vi.mock('../wallets/WalletsPage', () => ({ default: () => null }));

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ activeJournal: null, journals: [] }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Avi' },
    profile: { displayName: 'Avi' },
    isAdmin: false,
  }),
}));

vi.mock('../../services/firestoreService', () => ({
  getUserCollectionDocs: vi.fn(async () => []),
}));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="loc">{`${pathname}${search}`}</output>;
}

function shell(node) {
  return (
    <LazyMotion features={domAnimation} strict>
      {node}
    </LazyMotion>
  );
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(node)); });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function tabLabels() {
  return [...document.querySelectorAll('[role="tablist"]')].map((list) => (
    [...list.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim())
  ));
}

function actionButton(label) {
  const slot = document.querySelector('[data-testid="portfolio-header-actions"]');
  return [...slot.querySelectorAll('button')].find((btn) => btn.textContent.includes(label));
}

describe('holdings screen', () => {
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
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  it('renames the page, keeps the tab order, and adds a wallet from the header', async () => {
    const previousTitle = document.title;
    const view = await mount(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(document.querySelector('h1').textContent).toBe('החזקות');
    expect(document.body.textContent).toContain('ההחזקות שלך לטווח ארוך — ארנקים ותוכניות DCA');
    expect(document.body.textContent).not.toContain('>תיק<');
    expect(document.title).toBe('החזקות · TradeOS');

    const before = tabLabels();
    expect(before[0]).toEqual(['תוכניות DCA', 'ביצועי DCA', 'ארנקים']);
    expect(before[1]).toEqual(['DCA', 'ביצועים', 'ארנקים']);

    const slot = document.querySelector('[data-testid="portfolio-header-actions"]');
    expect(slot.className).toContain('grid');
    expect(slot.querySelectorAll('.col-start-1.row-start-1')).toHaveLength(2);
    expect(actionButton('תוכנית DCA חדשה').closest('[inert]')).toBeNull();
    expect(actionButton('הוסף ארנק').closest('[inert]')).toBeTruthy();

    const walletsTab = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.trim() === 'ארנקים');
    await act(async () => { walletsTab.click(); });

    expect(tabLabels()).toEqual(before);
    expect(document.querySelector('[data-testid="loc"]').textContent).toBe('/portfolio?tab=wallets');
    expect(actionButton('הוסף ארנק').closest('[inert]')).toBeNull();
    expect(actionButton('תוכנית DCA חדשה').closest('[inert]')).toBeTruthy();
    expect(slot.querySelectorAll('.col-start-1.row-start-1')).toHaveLength(2);

    await act(async () => { actionButton('הוסף ארנק').click(); });
    expect(document.querySelector('[data-testid="loc"]').textContent).toBe('/portfolio?tab=wallets&add=1');
    expect([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.getAttribute('aria-selected') === 'true').textContent).toContain('ארנקים');

    await view.cleanup();
    expect(document.title).toBe(previousTitle);
  });

  it('keeps /portfolio and redirects the old DCA and wallet paths', async () => {
    const routes = (
      <Routes>
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/dca" element={<Navigate to="/portfolio?tab=dca" replace />} />
        <Route path="/wallets" element={<Navigate to="/portfolio?tab=wallets" replace />} />
      </Routes>
    );

    const wallets = await mount(
      <MemoryRouter initialEntries={['/wallets']}>
        {routes}
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="loc"]').textContent).toBe('/portfolio?tab=wallets');
    expect(document.querySelector('h1').textContent).toBe('החזקות');
    await wallets.cleanup();

    const dca = await mount(
      <MemoryRouter initialEntries={['/dca']}>
        {routes}
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="loc"]').textContent).toBe('/portfolio?tab=dca');
    expect(document.querySelector('h1').textContent).toBe('החזקות');
    await dca.cleanup();
  });

  it('shows החזקות in the menu and in search, including the old name', async () => {
    const menu = await mount(
      <MemoryRouter initialEntries={['/portfolio']}>
        <Sidebar mobileOpen onClose={() => {}} />
      </MemoryRouter>,
    );
    const link = document.querySelector('nav[aria-label="תפריט ראשי"] a[href="/portfolio"]');
    expect(link.textContent).toContain('החזקות');
    expect(link.getAttribute('href')).toBe('/portfolio');
    await menu.cleanup();

    const search = await mount(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>,
    );
    await act(async () => {
      document.querySelector('button[title="חיפוש (⌘K)"]').click();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('החזקות');
    const input = dialog.querySelector('input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'תיק');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const hit = [...dialog.querySelectorAll('button')].find((btn) => btn.textContent.includes('החזקות'));
    expect(hit).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/(^|\s)תיק(\s|$)/);
    await search.cleanup();
  });
});
