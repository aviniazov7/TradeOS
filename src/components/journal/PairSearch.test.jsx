// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('../../services/coingeckoApi', () => ({ searchCoins: vi.fn(async () => []) }));
vi.mock('../../services/coinImageCache', () => ({
  cacheImage: vi.fn(),
  clearCachedImage: vi.fn(),
}));
vi.mock('../shared/CoinIcon', () => ({
  default: ({ pair }) => <span data-symbol-icon={pair} />,
}));

import PairSearch from './PairSearch';

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

describe('PairSearch markets', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('lists XAUUSD next to XAUUSDT and saves a free symbol without a USDT suffix', () => {
    const onChange = vi.fn();
    const view = render(<PairSearch value="" onChange={onChange} includeMarkets savedPairs={['EURUSD.R']} />);
    const input = view.el.querySelector('input');
    act(() => { input.focus(); });

    const pairs = [...view.el.querySelectorAll('[data-pair]')].map((el) => el.getAttribute('data-pair'));
    expect(pairs).toContain('XAUUSD');
    expect(pairs).toContain('XAUUSDT');
    expect(pairs).toContain('EURUSD');
    expect(pairs).toContain('USDJPY');
    expect(pairs).toContain('NAS100');
    expect(pairs).toContain('US500');
    expect(pairs).toContain('EURUSD.R');
    expect(view.el.textContent).toContain('Gold');
    expect(view.el.textContent).toContain('Yen');
    expect(view.el.textContent).toContain('Metals');
    expect(view.el.textContent).toContain('Forex');
    expect(view.el.textContent).toContain('Indices');
    expect(view.el.textContent).toContain('Crypto');

    typeInto(input, 'xauusd.r');
    const custom = view.el.querySelector('[data-testid="pair-custom"]');
    expect(custom.textContent).toContain('XAUUSD.R');
    expect(custom.textContent).not.toContain('XAUUSD.RUSDT');
    act(() => { custom.click(); });
    expect(onChange).toHaveBeenCalledWith('XAUUSD.R');
    view.unmount();
  });

  it('shows the symbol icon on the closed field, same as the menu', () => {
    const view = render(<PairSearch value="EURUSD" onChange={() => {}} includeMarkets />);
    const closed = view.el.querySelector('[data-symbol-icon="EURUSD"]');
    expect(closed).toBeTruthy();
    expect(view.el.textContent).toContain('EURUSD');
    expect(view.el.querySelector('[data-pair]')).toBeNull();
    act(() => { closed.parentElement.parentElement.click(); });
    const option = view.el.querySelector('[data-pair="EURUSD"] [data-symbol-icon="EURUSD"]');
    expect(option).toBeTruthy();
    view.unmount();
  });

  it('still turns an unknown crypto ticker into a USDT pair', () => {
    const onChange = vi.fn();
    const view = render(<PairSearch value="" onChange={onChange} />);
    const input = view.el.querySelector('input');
    act(() => { input.focus(); });
    const pairs = [...view.el.querySelectorAll('[data-pair]')].map((el) => el.getAttribute('data-pair'));
    expect(pairs).not.toContain('XAUUSD');
    expect(pairs).toContain('XAUUSDT');

    typeInto(input, 'solx');
    const custom = view.el.querySelector('[data-testid="pair-custom"]');
    expect(custom.textContent).toContain('SOLXUSDT');
    act(() => { custom.click(); });
    expect(onChange).toHaveBeenCalledWith('SOLXUSDT');
    view.unmount();
  });
});
