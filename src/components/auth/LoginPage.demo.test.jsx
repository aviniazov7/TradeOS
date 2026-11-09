// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { PUBLIC_DEMO_PATH } from '../../utils/publicDemo';

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

describe('login demo entry', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('links to the logged-out demo', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<MemoryRouter><LoginPage /></MemoryRouter>);
    });
    const link = document.querySelector(`a[href="${PUBLIC_DEMO_PATH}"]`);
    expect(link?.textContent).toBe('נסה את TradeOS');
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
