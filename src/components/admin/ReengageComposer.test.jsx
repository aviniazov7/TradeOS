// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import ReengageComposer from './ReengageComposer';

const generate = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'admin', email: 'a@x.com', displayName: 'אדמין' } }),
}));

vi.mock('../../services/pushService', () => ({
  adminSendBulkNotification: vi.fn(),
  adminSendEmailCampaign: vi.fn(),
  adminGenerateReminder: (...args) => generate(...args),
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  return { default: toast };
});

const recipients = [{ id: 'u1', email: 'a@x.com', name: 'דנה', marketing: true }];

function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return {
    el,
    render: async () => {
      await act(async () => { root.render(<ReengageComposer recipients={recipients} />); });
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('ReengageComposer reminder hook', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    generate.mockReset();
  });

  it('stays up when the generator returns no facts', async () => {
    generate.mockResolvedValue({
      source: 'ai',
      title: 'עדכון קצר מהיומן',
      email: 'אפשר לפתוח את היומן.',
      push: 'עדכון',
      cta: 'ליומן',
      path: '/journal',
    });
    const view = mount();
    await view.render();
    const btn = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('עדכון אישי'));
    await act(async () => { btn.click(); });
    expect(view.el.textContent).toContain('נוסח כללי');
    expect(view.el.textContent).toContain('עדכון קצר מהיומן');
    expect(view.el.textContent).not.toContain('משהו השתבש');
    await view.cleanup();
  });

  it('stays up when facts is present but headlines is missing', async () => {
    generate.mockResolvedValue({
      source: 'template',
      title: 'עדכון קצר מהיומן',
      email: 'אפשר לפתוח את היומן.',
      push: 'עדכון',
      cta: 'ליומן',
      path: '/journal',
      facts: { headlines: undefined, gainers: null, losers: null },
      stats: null,
    });
    const view = mount();
    await view.render();
    const btn = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('עדכון אישי'));
    await act(async () => { btn.click(); });
    expect(view.el.textContent).toContain('נוסח כללי');
    expect(view.el.textContent).not.toContain('משהו השתבש');
    await view.cleanup();
  });
});
