// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, useLocation } from 'react-router-dom';
import WalletsPage from './WalletsPage';

vi.mock('../../contexts/AuthContext', () => {
  const user = { uid: 'u1' };
  return { useAuth: () => ({ user, isPremium: true }) };
});

vi.mock('../../services/firestoreService', () => ({
  getUserSetting: vi.fn(async () => ({ list: [] })),
  setUserSetting: vi.fn(async () => {}),
}));

vi.mock('../../services/walletService', () => ({
  fetchWalletData: vi.fn(async () => ({ totalUsd: 0, chains: [], tokens: [] })),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../shared/BlockchainAnimation', () => ({ default: () => null }));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="loc">{`${pathname}${search}`}</output>;
}

async function mount(entry) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <LazyMotion features={domAnimation} strict>
          <WalletsPage embedded />
          <LocationProbe />
        </LazyMotion>
      </MemoryRouter>,
    );
  });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('wallet add form', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
      finished,
      ready: finished,
      currentTime: 0,
      playState: 'finished',
    });
  });

  it('opens from the holdings header flag and closes without leaving the tab', async () => {
    const view = await mount('/portfolio?tab=wallets&add=1');
    expect(document.body.textContent).toContain('הוספת ארנק');
    expect(document.querySelector('h1')).toBeNull();
    expect(document.querySelector('h2').textContent).toBe('ארנקים');

    const close = document.querySelector('button[aria-label="סגור"]');
    await act(async () => { close.click(); });
    expect(document.body.textContent).not.toContain('הוספת ארנק');
    expect(document.querySelector('[data-testid="loc"]').textContent).toBe('/portfolio?tab=wallets');
    expect(document.body.textContent).toContain('הוסף ארנק');
    await view.cleanup();
  });
});
