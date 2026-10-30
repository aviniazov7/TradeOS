// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import AdminInbox from './AdminInbox';

const updateInbox = vi.fn(async () => {});
const updateNotice = vi.fn(async () => {});
const markInbox = vi.fn(async () => 1);
const markNotices = vi.fn(async () => 1);

vi.mock('../../services/adminInboxService', () => ({
  subscribeAdminInboxItems: (onItems) => {
    onItems([
      {
        id: 'm1',
        kind: 'feedback',
        type: 'feedback',
        title: 'משוב מ-דנה',
        body: 'הגרף נתקע אחרי רענון של העמוד',
        preview: 'הגרף נתקע אחרי רענון של העמוד',
        userId: 'dana',
        userName: 'דנה',
        userEmail: 'dana@example.com',
        read: false,
        archived: false,
        createdAt: '2026-10-30T09:00:00Z',
      },
      {
        id: 'm2',
        kind: 'system',
        type: 'digest',
        title: 'הדוח השבועי',
        body: '2 חדשים · 3 פעילים',
        preview: '2 חדשים · 3 פעילים',
        userName: null,
        read: false,
        archived: false,
        createdAt: '2026-10-29T09:00:00Z',
      },
    ]);
    return () => {};
  },
  subscribeOperationalNotices: (onItems) => {
    onItems([
      {
        id: 's1',
        type: 'signup',
        title: 'משתמש חדש',
        body: 'מיכל נרשמה',
        userId: 'michal',
        userName: 'מיכל',
        userEmail: 'michal@example.com',
        read: false,
        createdAt: '2026-10-30T12:00:00Z',
      },
    ]);
    return () => {};
  },
  updateAdminInboxState: (...args) => updateInbox(...args),
  updateAdminNoticeState: (...args) => updateNotice(...args),
  markAllAdminInboxRead: (...args) => markInbox(...args),
  markOperationalNoticesRead: (...args) => markNotices(...args),
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  return { default: toast };
});

function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return {
    el,
    render: async () => {
      await act(async () => { root.render(<AdminInbox onOpenUser={() => {}} />); });
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function rows(el) {
  return [...el.querySelectorAll('[data-testid="admin-inbox-row"]')];
}

describe('AdminInbox', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows unread feedback in bold with a dot, and keeps system notices on the other tab', async () => {
    const view = mount();
    await view.render();
    const feedback = rows(view.el);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].dataset.read).toBe('0');
    expect(feedback[0].dataset.kind).toBe('feedback');
    expect(feedback[0].textContent).toContain('דנה');
    expect(feedback[0].textContent).toContain('הגרף נתקע');
    expect(feedback[0].querySelector('[data-testid="admin-inbox-unread-dot"]')).toBeTruthy();
    expect(feedback[0].querySelector('.font-bold')).toBeTruthy();
    expect(view.el.textContent).not.toContain('מיכל');

    const system = view.el.querySelector('[data-testid="admin-inbox-tab-system"]');
    await act(async () => { system.click(); });
    const systemRows = rows(view.el);
    expect(systemRows.map((row) => row.dataset.type).sort()).toEqual(['digest', 'signup']);
    expect(view.el.textContent).toContain('מיכל');
    expect(view.el.textContent).toContain('הדוח השבועי');
    await view.cleanup();
  });

  it('opens the message, marks it read, toggles unread, and archives it', async () => {
    updateInbox.mockClear();
    const view = mount();
    await view.render();
    const row = rows(view.el)[0];
    await act(async () => { row.click(); });
    const detail = view.el.querySelector('[data-testid="admin-inbox-detail"]');
    expect(detail.textContent).toContain('הגרף נתקע אחרי רענון של העמוד');
    expect(detail.textContent).toContain('dana@example.com');
    expect(updateInbox).toHaveBeenCalledWith('m1', { read: true });

    const toggle = view.el.querySelector('[data-testid="admin-inbox-toggle-read"]');
    expect(toggle.textContent).toContain('סמן כלא נקרא');
    await act(async () => { toggle.click(); });
    expect(updateInbox).toHaveBeenCalledWith('m1', { read: false });

    const archive = view.el.querySelector('[data-testid="admin-inbox-archive"]');
    await act(async () => { archive.click(); });
    expect(updateInbox).toHaveBeenCalledWith('m1', { archived: true });
    expect(rows(view.el)).toHaveLength(0);
    expect(view.el.textContent).toContain('אין משובים');

    const archiveFilter = view.el.querySelector('[data-testid="admin-inbox-archive-filter"]');
    await act(async () => { archiveFilter.click(); });
    expect(rows(view.el)).toHaveLength(1);
    expect(rows(view.el)[0].textContent).toContain('דנה');
    await view.cleanup();
  });

  it('marks every visible system message read', async () => {
    markInbox.mockClear();
    markNotices.mockClear();
    const view = mount();
    await view.render();
    await act(async () => { view.el.querySelector('[data-testid="admin-inbox-tab-system"]').click(); });
    await act(async () => { view.el.querySelector('[data-testid="admin-inbox-mark-all"]').click(); });
    expect(markInbox).toHaveBeenCalledWith('system');
    expect(markNotices).toHaveBeenCalledOnce();
    await view.cleanup();
  });
});
