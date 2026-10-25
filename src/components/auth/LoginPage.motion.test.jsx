// @vitest-environment happy-dom
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loginWithGoogle: vi.fn(),
    registerWithEmail: vi.fn(),
    loginWithEmail: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));

vi.mock('../../services/authService', () => ({
  preloadPopupResolver: vi.fn(),
}));

const originalRect = Element.prototype.getBoundingClientRect;

function rect(left, top, width, height) {
  return {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() { return {}; },
  };
}

describe('logged-out login motion', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not pull framer-motion into the login screen', () => {
    const src = readFileSync('src/components/auth/LoginPage.jsx', 'utf8');
    expect(src).not.toMatch(/from ['"]framer-motion['"]/);
    expect(src).not.toMatch(/from ['"][^'"]*RollingNumber['"]/);
  });

  it('draws the sample chart, rolls sample numbers, and slides the blue pill', async () => {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.getAttribute?.('role') === 'tablist') return rect(10, 40, 320, 44);
      const id = this.getAttribute?.('data-tab-id');
      // RTL: התחברות sits on the right, הרשמה further left.
      if (id === 'login') return rect(170, 44, 150, 36);
      if (id === 'register') return rect(14, 44, 150, 36);
      return rect(0, 0, 0, 0);
    };

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      await act(async () => {
        root.render(<MemoryRouter><LoginPage /></MemoryRouter>);
      });

      const line = el.querySelector('.chart-draw');
      expect(line).toBeTruthy();
      expect(line.getAttribute('pathLength')).toBe('1');
      expect(el.querySelector('[data-testid="login-demo"]')).toBeTruthy();
      expect(el.querySelector('.css-ticker-strip')).toBeTruthy();
      expect(el.textContent).toContain('תצוגה — המספרים מתגלגלים והגרף נמתח');

      const pill = () => el.querySelector('[data-login-pill]');
      expect(pill()).toBeTruthy();
      expect(pill().className).toContain('bg-accent-primary');
      expect(pill().style.transform).toBe('translate3d(160px, 4px, 0)');

      const register = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה');
      await act(async () => { register.click(); });
      expect(pill().style.transform).toBe('translate3d(4px, 4px, 0)');
      expect(el.querySelector('[aria-selected="true"]').textContent).toBe('הרשמה');
    } finally {
      await act(async () => { root.unmount(); });
      el.remove();
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });
});
