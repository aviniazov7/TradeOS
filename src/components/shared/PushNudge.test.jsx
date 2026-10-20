// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import PushNudge from './PushNudge';

const auth = { user: { uid: 'u1' } };

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../services/pushService', () => ({
  pushSupported: () => true,
  subscribeToPush: vi.fn(),
}));

vi.mock('../../services/firestoreService', () => ({
  setUserSetting: vi.fn(),
}));

function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return {
    render: async () => {
      await act(async () => { root.render(<PushNudge />); });
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('PushNudge', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.Notification = {
      permission: 'default',
      requestPermission: vi.fn(async () => 'default'),
    };
  });

  beforeEach(() => {
    auth.user = { uid: 'u1' };
    Notification.permission = 'default';
    localStorage.clear();
    delete document.documentElement.dataset.pushNudge;
    document.documentElement.style.removeProperty('--push-nudge-clearance');
  });

  it('keeps Hebrew RTL and a 44px dismiss target, and publishes chrome clearance', async () => {
    const view = mount();
    const banner = document.createElement('div');
    banner.getBoundingClientRect = () => ({ height: 68, width: 320, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} });
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.dataset && this.dataset.testid === 'push-nudge') return banner.getBoundingClientRect();
      return orig.call(this);
    };
    await view.render();
    const nudge = document.querySelector('[data-testid="push-nudge"]');
    expect(nudge).toBeTruthy();
    expect(nudge.getAttribute('dir')).toBe('rtl');
    expect(nudge.textContent).toContain('הפעל התראות');
    const dismiss = document.querySelector('[data-testid="push-nudge-dismiss"]');
    expect(dismiss.getAttribute('aria-label')).toBe('סגור');
    expect(dismiss.className).toContain('h-11');
    expect(dismiss.className).toContain('w-11');
    expect(dismiss.className).toContain('z-10');
    expect(document.documentElement.dataset.pushNudge).toBe('open');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('80px');
    HTMLElement.prototype.getBoundingClientRect = orig;
    await view.cleanup();
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
  });

  it('dismisses and stops reserving space for the banner', async () => {
    const view = mount();
    await view.render();
    const dismiss = document.querySelector('[data-testid="push-nudge-dismiss"]');
    await act(async () => { dismiss.click(); });
    expect(document.querySelector('[data-testid="push-nudge"]')).toBeNull();
    expect(localStorage.getItem('tradeos_pushNudgeDismissed')).toBe('1');
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
    await view.cleanup();
  });

  it('stays hidden once dismissed or when signed out', async () => {
    localStorage.setItem('tradeos_pushNudgeDismissed', '1');
    const view = mount();
    await view.render();
    expect(document.querySelector('[data-testid="push-nudge"]')).toBeNull();
    auth.user = null;
    localStorage.clear();
    await view.render();
    expect(document.querySelector('[data-testid="push-nudge"]')).toBeNull();
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
    await view.cleanup();
  });
});
