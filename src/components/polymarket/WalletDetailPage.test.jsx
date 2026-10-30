// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const usage = vi.hoisted(() => ({
  current: { used: 0, limit: 200, premium: true, loading: false, unlimited: false, imageUsed: 0, imageLimit: 10, refresh: vi.fn() },
}));

vi.mock('../../hooks/useAiUsage', () => ({
  useAiUsage: () => usage.current,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: true, user: { uid: 'u1' } }),
}));
vi.mock('../../hooks/useWalletPositions', () => ({
  useWalletPositions: () => ({ positions: [], loading: false, error: '' }),
}));
vi.mock('../../hooks/useWalletActivity', () => ({
  useWalletActivity: () => ({ activity: [], loading: false, error: '' }),
}));
vi.mock('../../services/aiCoachService', () => ({
  generateCoachReport: vi.fn(),
}));

import WalletDetailPage from './WalletDetailPage';
import { generateCoachReport } from '../../services/aiCoachService';

function render() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return act(async () => {
    root.render(
      <LazyMotion features={domAnimation} strict>
        <MemoryRouter initialEntries={[{ pathname: '/polymarket/wallet/0xabc', state: { row: { wallet: '0xabc', name: 'Whale', pnl: 1, roi: 0.1, volume: 5, smartScore: 70 } } }]}>
          <Routes>
            <Route path="/polymarket/wallet/:address" element={<WalletDetailPage />} />
          </Routes>
        </MemoryRouter>
      </LazyMotion>,
    );
  });
}

describe('נתח ארנק (AI) button', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    document.body.innerHTML = '';
    generateCoachReport.mockClear();
  });

  it('shows a Hebrew message and does not open the analyst when the quota is spent', async () => {
    usage.current = { ...usage.current, used: 200, limit: 200, premium: true, loading: false };
    await render();
    expect(document.body.textContent).toContain('הגעת לתקרה היומית של Premium (200). נסה מחר.');
    const button = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('נתח ארנק (AI)'));
    expect(button.disabled).toBe(true);
    await act(async () => { button.click(); });
    expect(document.body.textContent).not.toContain('נתח את הארנק');
    expect(generateCoachReport).not.toHaveBeenCalled();
  });

  it('opens the analyst when questions remain', async () => {
    usage.current = { ...usage.current, used: 3, limit: 200, premium: true, loading: false };
    await render();
    const button = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('נתח ארנק (AI)'));
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
    expect(document.body.textContent).toContain('נתח את הארנק');
    expect(generateCoachReport).not.toHaveBeenCalled();
  });
});
