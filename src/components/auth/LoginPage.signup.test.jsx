// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LoginPage, { SIGNUP_VALUE_LINE } from './LoginPage';

const { registerWithEmail, loginWithGoogle } = vi.hoisted(() => ({
  registerWithEmail: vi.fn(async () => {}),
  loginWithGoogle: vi.fn(async () => {}),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loginWithGoogle,
    registerWithEmail,
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
    const box = document.querySelector('[data-testid="signup-email-consent"] input');
    expect(box).toBeTruthy();
    expect(box.checked).toBe(false);
    expect(document.body.textContent).toContain('אני מעוניין/ת לקבל עדכונים ותזכורות במייל');
    await act(async () => { root.unmount(); });
    el.remove();
  });

  async function mount() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<MemoryRouter><LoginPage /></MemoryRouter>);
    });
    return {
      async cleanup() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  async function typeInto(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('saves an explicit unchecked choice, and a checked one when the box is ticked', async () => {
    sessionStorage.clear();
    registerWithEmail.mockClear();
    const view = await mount();
    const register = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה');
    await act(async () => { register.click(); });
    await typeInto(document.getElementById('lp-name'), 'דנה');
    await typeInto(document.getElementById('lp-email'), 'dana@example.com');
    await typeInto(document.getElementById('lp-pass'), 'Secret12');
    const submit = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('יצירת חשבון'));
    await act(async () => { submit.click(); });
    expect(registerWithEmail).toHaveBeenCalledWith('dana@example.com', 'Secret12', 'דנה', { marketingEmails: false });
    expect(sessionStorage.getItem('tradeos.signupMarketingEmails')).toBe('0');

    const box = document.querySelector('[data-testid="signup-email-consent"] input');
    await act(async () => { box.click(); });
    expect(box.checked).toBe(true);
    await act(async () => { submit.click(); });
    expect(registerWithEmail).toHaveBeenLastCalledWith('dana@example.com', 'Secret12', 'דנה', { marketingEmails: true });
    expect(sessionStorage.getItem('tradeos.signupMarketingEmails')).toBe('1');
    await view.cleanup();
  });

  it('remembers an unchecked choice for Google sign-up', async () => {
    sessionStorage.clear();
    loginWithGoogle.mockClear();
    const view = await mount();
    const register = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה');
    await act(async () => { register.click(); });
    const google = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Google'));
    await act(async () => { google.click(); });
    expect(sessionStorage.getItem('tradeos.signupMarketingEmails')).toBe('0');
    expect(loginWithGoogle).toHaveBeenCalled();
    await view.cleanup();
  });

  it('clears a stashed choice when Google is used from the login tab', async () => {
    sessionStorage.setItem('tradeos.signupMarketingEmails', '1');
    const view = await mount();
    const google = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Google'));
    await act(async () => { google.click(); });
    expect(sessionStorage.getItem('tradeos.signupMarketingEmails')).toBeNull();
    await view.cleanup();
  });
});