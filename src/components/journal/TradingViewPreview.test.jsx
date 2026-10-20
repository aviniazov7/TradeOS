// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import TradingViewPreview from './TradingViewPreview';

describe('TradingViewPreview', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function render(url) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<TradingViewPreview url={url} pair="BTCUSDT" />);
    });
    return {
      host,
      async unmount() {
        await act(async () => { root.unmount(); });
        host.remove();
      },
    };
  }

  it('links a snapshot to TradingView and previews the image from their CDN', async () => {
    const { host, unmount } = await render('https://www.tradingview.com/x/AbC123');
    const links = [...host.querySelectorAll('a')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('https://www.tradingview.com/x/AbC123');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
    const img = host.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://s3.tradingview.com/snapshots/a/AbC123.png');
    await unmount();
  });

  it('falls back to a plain link when the snapshot image fails', async () => {
    const { host, unmount } = await render('https://www.tradingview.com/x/AbC123');
    const img = host.querySelector('img');
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('אין תצוגה מקדימה');
    const link = host.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://www.tradingview.com/x/AbC123');
    expect(link.getAttribute('target')).toBe('_blank');
    await unmount();
  });

  it('keeps a chart link clickable', async () => {
    const chart = 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT';
    const { host, unmount } = await render(chart);
    expect(host.querySelector('iframe').getAttribute('src')).toBe(chart);
    expect(host.querySelector('a').getAttribute('href')).toBe(chart);
    await unmount();
  });
});
