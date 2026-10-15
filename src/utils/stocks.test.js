import { describe, expect, it } from 'vitest';
import { stockLogoUrls } from './stocks';

describe('stockLogoUrls', () => {
  it('prefers the local official mark for ticker names', () => {
    expect(stockLogoUrls('QQQ')[0]).toBe('/logos/stocks/qqq.png');
    expect(stockLogoUrls('spy')[0]).toBe('/logos/stocks/spy-173c9304.png');
    expect(stockLogoUrls('AAPL')[0]).toBe('/logos/stocks/aapl.svg');
    expect(stockLogoUrls('NVDA')[0]).toBe('/logos/stocks/nvda.png');
    expect(stockLogoUrls('TSLA')[0]).toBe('/logos/stocks/tsla.svg');
    expect(stockLogoUrls('MSFT')[0]).toBe('/logos/stocks/msft.svg');
    expect(stockLogoUrls('AMZN')[0]).toBe('/logos/stocks/amzn.svg');
    expect(stockLogoUrls('META')[0]).toBe('/logos/stocks/meta.svg');
  });

  it('never appends a third-party URL after a local official file', () => {
    for (const sym of ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META']) {
      const urls = stockLogoUrls(sym);
      expect(urls).toHaveLength(1);
      expect(urls[0].startsWith('/logos/stocks/')).toBe(true);
      expect(urls.join(' ')).not.toMatch(/parqet|financialmodelingprep/);
    }
    expect(stockLogoUrls('spy')).toEqual(['/logos/stocks/spy-173c9304.png']);
    expect(stockLogoUrls('SPY.TA')).toEqual(['/logos/stocks/spy-173c9304.png']);
  });

  it('does not invent a local file for an unlisted ticker', () => {
    const urls = stockLogoUrls('GOOGL');
    expect(urls[0]).toContain('financialmodelingprep.com');
    expect(urls.some((u) => u.includes('parqet.com'))).toBe(true);
    expect(stockLogoUrls('')).toEqual([]);
  });
});
