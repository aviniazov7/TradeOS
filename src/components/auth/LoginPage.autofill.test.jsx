// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null,
    loginWithGoogle: vi.fn(() => new Promise(() => {})),
    registerWithEmail: vi.fn(),
    loginWithEmail: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../services/authService', () => ({
  preloadPopupResolver: vi.fn(),
}));

function tree(initialEntry = '/login') {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="home" />} />
        <Route path="/journal" element={<div data-testid="journal" />} />
      </Routes>
    </MemoryRouter>
  );
}

async function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  return {
    root,
    async rerender(next) {
      await act(async () => { root.render(next); });
    },
    async cleanup() {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

async function leaveLogin() {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  });
}

describe('login credential fields and Safari autofill release', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    authState.user = null;
    authState.loginWithGoogle.mockReset();
    authState.loginWithGoogle.mockImplementation(() => new Promise(() => {}));
    document.body.innerHTML = '';
  });

  it('keeps password-manager autocomplete on the live login and signup fields', async () => {
    const view = await mount(tree());
    const email = document.getElementById('lp-email');
    const pass = document.getElementById('lp-pass');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(pass.getAttribute('autocomplete')).toBe('current-password');
    expect(pass.readOnly).toBe(false);
    expect(pass.disabled).toBe(false);
    expect(pass.tabIndex).not.toBe(-1);
    const sink = document.querySelector('[data-login-focus-sink]');
    expect(sink.tabIndex).toBe(-1);
    expect(sink.tagName).not.toBe('INPUT');

    const register = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה');
    await act(async () => { register.click(); });
    expect(document.getElementById('lp-pass').getAttribute('autocomplete')).toBe('new-password');
    expect(document.getElementById('lp-pass').readOnly).toBe(false);
    await view.cleanup();
  });

  it('blurs a focused password field and calls Google sign-in in the click turn', async () => {
    const view = await mount(tree());
    const pass = document.getElementById('lp-pass');
    await act(async () => { pass.focus(); });
    let yielded = false;
    authState.loginWithGoogle.mockImplementation(() => {
      expect(yielded).toBe(false);
      expect(document.getElementById('lp-pass').isConnected).toBe(true);
      expect(document.activeElement).not.toBe(document.getElementById('lp-pass'));
      expect(document.getElementById('lp-pass').getAttribute('autocomplete')).toBe('current-password');
      expect(document.getElementById('lp-pass').readOnly).toBe(false);
      return new Promise(() => {});
    });
    const google = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Google'));
    await act(async () => {
      queueMicrotask(() => { yielded = true; });
      google.click();
    });
    expect(authState.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lp-pass')).toBeTruthy();
    await view.cleanup();
  });

  it('restores the Google button after a closed popup and leaves the password field editable', async () => {
    const view = await mount(tree());
    authState.loginWithGoogle.mockRejectedValue(Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }));
    const pass = document.getElementById('lp-pass');
    await act(async () => { pass.focus(); });
    const google = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Google'));
    await act(async () => { google.click(); });
    expect(document.getElementById('lp-pass').isConnected).toBe(true);
    expect(document.getElementById('lp-pass').readOnly).toBe(false);
    expect(document.getElementById('lp-pass').getAttribute('autocomplete')).toBe('current-password');
    expect(document.activeElement).toBe(google);
    expect(document.body.textContent).not.toContain('שגיאה בהתחברות עם Google');
    await view.cleanup();
  });

  it('keeps the credential fields connected for a frame after sign-in, then leaves', async () => {
    const view = await mount(<StrictMode>{tree()}</StrictMode>);
    const pass = document.getElementById('lp-pass');
    await act(async () => { pass.focus(); });
    authState.user = { uid: 'signed-in' };
    await view.rerender(<StrictMode>{tree()}</StrictMode>);

    const held = document.getElementById('lp-pass');
    expect(held).toBeTruthy();
    expect(held.isConnected).toBe(true);
    expect(held.getAttribute('autocomplete')).toBe('current-password');
    expect(held.getAttribute('type')).toBe('password');
    expect(held.readOnly).toBe(true);
    expect(held.value).toBe('');
    expect(document.activeElement).not.toBe(held);
    expect(document.querySelector('[data-testid="home"]')).toBeNull();

    await leaveLogin();
    expect(document.getElementById('lp-pass')).toBeNull();
    expect(document.querySelector('[data-testid="home"]')).toBeTruthy();
    await view.cleanup();
  });

  it('does not mark a typed password read-only while releasing focus', async () => {
    const view = await mount(tree());
    const pass = document.getElementById('lp-pass');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(pass, 'Secret12');
      pass.dispatchEvent(new Event('input', { bubbles: true }));
      pass.focus();
    });
    authState.user = { uid: 'signed-in' };
    await view.rerender(tree());
    const held = document.getElementById('lp-pass');
    expect(held.value).toBe('Secret12');
    expect(held.readOnly).toBe(false);
    expect(held.getAttribute('autocomplete')).toBe('current-password');
    expect(document.activeElement).not.toBe(held);
    await leaveLogin();
    expect(document.querySelector('[data-testid="home"]')).toBeTruthy();
    await view.cleanup();
  });

  it('leaves immediately when a session exists before the form is shown', async () => {
    authState.user = { uid: 'already' };
    const view = await mount(tree());
    expect(document.getElementById('lp-pass')).toBeNull();
    expect(document.querySelector('[data-testid="home"]')).toBeTruthy();
    await view.cleanup();
  });

  it('honours a same-app redirect and rejects an open redirect', async () => {
    const view = await mount(tree('/login?redirect=/journal'));
    authState.user = { uid: 'signed-in' };
    await view.rerender(tree('/login?redirect=/journal'));
    await leaveLogin();
    expect(document.querySelector('[data-testid="journal"]')).toBeTruthy();
    await view.cleanup();

    authState.user = null;
    const blocked = await mount(tree('/login?redirect=//evil.example'));
    authState.user = { uid: 'signed-in' };
    await blocked.rerender(tree('/login?redirect=//evil.example'));
    await leaveLogin();
    expect(document.querySelector('[data-testid="home"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="journal"]')).toBeNull();
    await blocked.cleanup();
  });
});
