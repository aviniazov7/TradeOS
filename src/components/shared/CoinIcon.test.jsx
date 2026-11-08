// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import CoinIcon from './CoinIcon';
import { inlineFlagSrc } from '../../utils/inlineFlags';

describe('CoinIcon CFD marks', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });

  async function render(pair) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<CoinIcon pair={pair} />); });
    return {
      el,
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  it('draws a bundled coin, flag pair, or US flag instead of a letter badge', async () => {
    const files = [
      ['XAUUSD', '/logos/marks/gold.svg'],
      ['XAU/USD', '/logos/marks/gold.svg'],
      ['XAUUSD.R', '/logos/marks/gold.svg'],
    ];
    const flags = ['EUR/USD', 'GBPUSD', 'USDJPY', 'US30', 'NAS100', 'US500'];
    for (const [pair, src] of files) {
      const view = await render(pair);
      const img = view.el.querySelector('img');
      expect(img?.getAttribute('src')).toBe(src);
      expect(img.className).toContain('rounded-full');
      expect(view.el.textContent).toBe('');
      await view.unmount();
    }
    for (const pair of flags) {
      const view = await render(pair);
      const img = view.el.querySelector('img');
      const src = img?.getAttribute('src') || '';
      expect(src).toBe(inlineFlagSrc(pair));
      expect(src.startsWith('data:image/svg+xml,')).toBe(true);
      expect(img.className).toContain('rounded-full');
      expect(view.el.textContent).toBe('');
      await view.unmount();
    }
  });

  it('keeps a letter badge for a free-text symbol', async () => {
    const view = await render('EURUSD.R');
    expect(view.el.querySelector('img')).toBeNull();
    expect(view.el.textContent).toBe('EU');
    const unknown = await render('ZZTOP');
    expect(unknown.el.querySelector('img')).toBeNull();
    expect(unknown.el.textContent).toBe('ZZ');
    await view.unmount();
    await unknown.unmount();
  });
});
