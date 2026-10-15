// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import TickerLogo from './TickerLogo';
import { tickerLogoFrame } from '../../utils/tickerLogo';

describe('tickerLogoFrame', () => {
  it('uses official files and a contrasting tile, never a cropped cover', () => {
    expect(tickerLogoFrame('stock', 'QQQ')).toMatchObject({
      background: '#000AD2', inset: '100%',
    });
    expect(tickerLogoFrame('stock', 'QQQ').urls).toEqual(['/logos/stocks/qqq.png']);
    expect(tickerLogoFrame('stock', 'SPY').urls).toEqual(['/logos/stocks/spy-173c9304.png']);
    expect(tickerLogoFrame('stock', 'SPY').urls.join(' ')).not.toMatch(/parqet|financialmodelingprep|https?:/);
    expect(tickerLogoFrame('stock', 'SPY').background).toBe('#ffffff');
    expect(tickerLogoFrame('stock', 'AAPL').background).toBe('#ffffff');
    expect(tickerLogoFrame('stock', 'NVDA').background).toBe('#000000');
    expect(tickerLogoFrame('stock', 'NVDA').urls[0]).toBe('/logos/stocks/nvda.png');
    expect(tickerLogoFrame('crypto', 'SOL')).toMatchObject({ background: '#000000', inset: '100%' });
    expect(tickerLogoFrame('crypto', 'SOL').urls).toEqual(['/logos/coins/sol-15954313.png']);
    expect(tickerLogoFrame('crypto', 'SOL/USDT').urls).toEqual(['/logos/coins/sol-15954313.png']);
    expect(tickerLogoFrame('crypto', 'DOGE').urls[0]).toBe('/logos/coins/doge.svg');
    expect(tickerLogoFrame('crypto', 'LTC').urls[0]).toBe('/logos/coins/ltc.svg');
    expect(tickerLogoFrame('crypto', 'other').urls).toEqual([]);
  });
});

describe('TickerLogo', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('draws the mark with object-fit contain inside a circle', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<TickerLogo kind="stock" symbol="AAPL" />); });
    const tile = el.querySelector('[data-testid="ticker-logo"]');
    const img = tile.querySelector('img');
    expect(tile.className).toContain('rounded-full');
    expect(tile.className).toContain('w-6');
    expect(tile.className).not.toContain('object-cover');
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('64');
    expect(img.getAttribute('src')).toBe('/logos/stocks/aapl.svg');
    expect(tile.style.background).toBe('#ffffff');
    await act(async () => { root.unmount(); });
    el.remove();
  });

  it('does not walk to a third-party image when the SPY file fails', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<TickerLogo kind="stock" symbol="SPY" />); });
    const img = el.querySelector('img');
    expect(img.getAttribute('src')).toBe('/logos/stocks/spy-173c9304.png');
    await act(async () => { img.dispatchEvent(new Event('error')); });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('SP');
    expect(el.innerHTML).not.toMatch(/parqet|financialmodelingprep|http/);
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
