// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import WalletAnalystModal from './WalletAnalystModal';

vi.mock('../../services/aiCoachService', () => ({
  generateCoachReport: vi.fn(async () => '**חוזקות**\n• עקבי'),
}));

import { generateCoachReport } from '../../services/aiCoachService';

const row = { wallet: '0xabc123', name: 'Whale', pnl: 10, roi: 0.2, volume: 100, smartScore: 80 };
const split = { realized: 4, unrealized: 6 };

function render(aiUsage) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return act(async () => {
    root.render(
      <LazyMotion features={domAnimation} strict>
        <WalletAnalystModal isOpen onClose={() => {}} row={row} positions={[]} split={split} aiUsage={aiUsage} />
      </LazyMotion>,
    );
  });
}

describe('WalletAnalystModal quota', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows the Hebrew cap message and does not call the model when the daily quota is spent', async () => {
    await render({ used: 200, limit: 200, premium: true, loading: false, refresh: vi.fn() });
    expect(document.body.textContent).toContain('הגעת לתקרה היומית של Premium (200). נסה מחר.');
    expect(document.body.textContent).not.toContain('נתח את הארנק');
    expect(generateCoachReport).not.toHaveBeenCalled();
  });

  it('calls the wallet analyst and refreshes the counter when quota remains', async () => {
    const refresh = vi.fn();
    await render({ used: 1, limit: 200, premium: true, loading: false, refresh });
    const button = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('נתח את הארנק'));
    expect(button).toBeTruthy();
    await act(async () => { button.click(); });
    expect(generateCoachReport).toHaveBeenCalledTimes(1);
    expect(generateCoachReport.mock.calls[0][2]).toBe('polymarket');
    expect(refresh).toHaveBeenCalled();
  });
});
