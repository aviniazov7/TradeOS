// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));
vi.mock('../../services/coinImageCache', () => ({
  cacheImage: vi.fn(),
  clearCachedImage: vi.fn(),
}));
vi.mock('./CoinIcon', () => ({ default: () => null }));

import PairSearchMulti from './PairSearchMulti';

function render(ui) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => { root.render(ui); });
  return {
    el,
    unmount() {
      act(() => { root.unmount(); });
      el.remove();
    },
  };
}

function typeInto(input, value) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  act(() => {
    proto.set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('PairSearchMulti markets', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('opens on the CFD list and adds a validated custom symbol', () => {
    const onAdd = vi.fn();
    const view = render(<PairSearchMulti selectedPairs={['XAUUSDT']} onAdd={onAdd} includeMarkets />);
    const input = view.el.querySelector('input');
    act(() => { input.focus(); });

    const pairs = [...view.el.querySelectorAll('[data-pair]')].map((el) => el.getAttribute('data-pair'));
    expect(pairs[0]).toBe('XAUUSD');
    expect(pairs).toContain('USDJPY');
    expect(pairs).toContain('US30');
    expect(pairs).not.toContain('BTCUSDT');
    expect(view.el.textContent).toContain('Gold');
    expect(view.el.textContent).toContain('Silver');

    typeInto(input, '  gbpusd.pro ');
    const custom = view.el.querySelector('[data-testid="pair-custom"]');
    expect(custom.textContent).toContain('GBPUSD.PRO');
    act(() => { custom.click(); });
    expect(onAdd).toHaveBeenCalledWith('GBPUSD.PRO');

    typeInto(input, 'bad symbol');
    expect(view.el.querySelector('[data-testid="pair-custom"]')).toBeNull();
    view.unmount();
  });

  it('does not list forex symbols in the crypto picker', () => {
    const view = render(<PairSearchMulti selectedPairs={[]} onAdd={() => {}} />);
    const input = view.el.querySelector('input');
    act(() => { input.focus(); });
    expect(view.el.querySelector('[data-pair]')).toBeNull();
    typeInto(input, 'XAU');
    const pairs = [...view.el.querySelectorAll('[data-pair]')].map((el) => el.getAttribute('data-pair'));
    expect(pairs).toContain('XAUUSDT');
    expect(pairs).not.toContain('XAUUSD');
    view.unmount();
  });
});
