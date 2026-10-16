// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { useLinkedExchangeBalance } from './useLinkedExchangeBalance';

const user = { uid: 'u1' };
const pending = {};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user }),
}));

vi.mock('../services/firestoreService', () => ({
  getUserSetting: vi.fn(async () => ({
    mexc: { connected: true },
    bybit: { connected: true },
  })),
}));

vi.mock('../services/exchangeService', () => ({
  fetchExchangeBalance: (id) => pending[id],
}));

function Probe({ exchange }) {
  const balance = useLinkedExchangeBalance(exchange);
  return <output>{balance == null ? 'empty' : String(balance)}</output>;
}

describe('useLinkedExchangeBalance', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not keep the previous journal wallet after the exchange changes', async () => {
    let resolveMexc;
    let resolveBybit;
    pending.mexc = new Promise((resolve) => { resolveMexc = resolve; });
    pending.bybit = new Promise((resolve) => { resolveBybit = resolve; });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<Probe exchange="mexc" />); });
    expect(el.textContent).toBe('empty');

    await act(async () => { resolveMexc({ balance: 394.14223635 }); });
    expect(el.textContent).toBe('394.14223635');

    await act(async () => { root.render(<Probe exchange="bybit" />); });
    expect(el.textContent).toBe('empty');

    await act(async () => { resolveBybit({ balance: 1000.2 }); });
    expect(el.textContent).toBe('1000.2');

    await act(async () => { root.unmount(); });
    el.remove();
  });
});
