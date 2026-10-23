// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import ExchangeLogo from './ExchangeLogo';

describe('ExchangeLogo', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function render(props) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<ExchangeLogo {...props} />); });
    return {
      el,
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  it('draws a bundled mark with no white tile', async () => {
    document.documentElement.classList.remove('light');
    const view = await render({ exchange: 'binance', size: 'w-5 h-5' });
    const frame = view.el.querySelector('span');
    const img = view.el.querySelector('img');
    expect(img.getAttribute('src')).toBe('/logos/exchanges/binance.svg');
    expect(frame.className).not.toContain('bg-white');
    expect(img.className).toContain('object-contain');
    await view.unmount();
  });

  it('uses the light OKX mark on dark and the dark mark on light', async () => {
    document.documentElement.classList.remove('light');
    const dark = await render({ exchange: 'okx' });
    expect(dark.el.querySelector('img').getAttribute('src')).toBe('/logos/exchanges/okx.svg');
    expect(dark.el.querySelector('span').className).not.toContain('bg-white');
    await dark.unmount();

    document.documentElement.classList.add('light');
    const light = await render({ exchange: 'okx' });
    expect(light.el.querySelector('img').getAttribute('src')).toBe('/logos/exchanges/okx-on-light.svg');
    expect(light.el.querySelector('span').className).not.toContain('bg-white');
    await light.unmount();
    document.documentElement.classList.remove('light');
  });

  it('puts a favicon on a neutral chip instead of a white tile', async () => {
    document.documentElement.classList.remove('light');
    const view = await render({ exchange: 'vantage' });
    const frame = view.el.querySelector('span');
    const img = view.el.querySelector('img');
    expect(img.getAttribute('src')).toContain('domain=vantagemarkets.com');
    expect(frame.className).toContain('bg-white/10');
    expect(frame.className).not.toMatch(/(?:^|\s)bg-white(?:\s|$)/);
    await view.unmount();
  });
});
