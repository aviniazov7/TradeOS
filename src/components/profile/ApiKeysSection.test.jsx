// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import ApiKeysSection from './ApiKeysSection';

const createApiKey = vi.fn();
const revokeApiKey = vi.fn();
let onData = () => {};

vi.mock('../../contexts/AuthContext', () => {
  const user = { uid: 'u1' };
  return { useAuth: () => ({ user }) };
});

vi.mock('../../services/firestoreService', () => ({
  subscribeToUserCollection: (_uid, _name, _opts, cb) => {
    onData = cb;
    cb([]);
    return () => {};
  },
}));

vi.mock('../../services/apiKeyService', () => ({
  createApiKey: (...args) => createApiKey(...args),
  revokeApiKey: (...args) => revokeApiKey(...args),
}));

vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children, title }) => (isOpen ? <div><h2>{title}</h2>{children}</div> : null),
}));

vi.mock('../shared/ConfirmDialog', () => ({ default: () => null }));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  return { default: toast };
});

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<ApiKeysSection />); });
  return {
    el,
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('ApiKeysSection', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('creates a key, reveals the secret, and lists only the prefix', async () => {
    createApiKey.mockResolvedValue({ id: 'k1', key: 'tos_secretvalue1234567890', prefix: 'tos_secretv', name: 'Agent' });
    const view = await mount();
    expect(view.el.textContent).toContain('אין מפתחות פעילים');
    const button = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('מפתח חדש'));
    await act(async () => { button.click(); });
    expect(createApiKey).toHaveBeenCalledWith('');
    expect(view.el.querySelector('[data-testid="api-key-secret"]').textContent).toBe('tos_secretvalue1234567890');
    await act(async () => {
      onData([{ id: 'k1', name: 'Agent', prefix: 'tos_secretv', createdAt: '2026-06-15T12:00:00.000Z', revokedAt: null }]);
    });
    const shown = view.el.querySelector('[data-testid="api-key-prefix"]').textContent;
    expect(shown).toContain('tos_secretv');
    expect(shown).not.toContain('tos_secretvalue1234567890');
    await view.cleanup();
  });
});
