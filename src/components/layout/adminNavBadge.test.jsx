// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({ activeJournal: null, journals: [] }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'admin' },
    profile: { role: 'admin' },
    isAdmin: true,
  }),
}));

vi.mock('../../services/adminInboxService', () => ({
  subscribeAdminMailboxUnread: (onCount) => {
    onCount(4);
    return () => {};
  },
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

describe('admin nav unread badge', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
  });

  it('shows the mailbox count on ניהול', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(shell(<Sidebar mobileOpen onClose={() => {}} />));
    });
    // The badge arrives through a dynamic import of the mailbox service.
    await act(async () => { await Promise.resolve(); });
    const link = el.querySelector('a[href="/admin"]');
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('ניהול');
    const badge = link.querySelector('[data-testid="admin-nav-unread"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('4');
    expect(badge.getAttribute('aria-label')).toContain('4');
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
