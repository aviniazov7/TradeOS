// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LoginPage, { SIGNUP_VALUE_LINE } from './LoginPage';

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

describe('signup value line', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows a short pitch on the mobile sign-up screen', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>,
      );
    });
    expect(document.body.textContent).toContain('ברוך שובך');
    expect(document.querySelector('[data-testid="signup-value"]')).toBeNull();
    const register = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה');
    await act(async () => { register.click(); });
    const line = document.querySelector('[data-testid="signup-value"]');
    expect(line.textContent).toBe(SIGNUP_VALUE_LINE);
    expect(line.className).toContain('lg:hidden');
    expect(line.textContent).toContain('בורסה');
    await act(async () => { root.unmount(); });
    el.remove();
  });
});