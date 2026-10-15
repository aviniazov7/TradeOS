import { describe, expect, it } from 'vitest';
import { stockLogoUrls } from './stocks';

describe('stockLogoUrls', () => {
  it('prefers the local official mark for ticker names', () => {
    expect(stockLogoUrls('QQQ')[0]).toBe('/logos/stocks/qqq.png');
    expect(stockLogoUrls('spy')[0]).toBe('/logos/stocks/spy.png');
    expect(stockLogoUrls('AAPL')[0]).toBe('/logos/stocks/aapl.svg');
    expect(stockLogoUrls('NVDA')[0]).toBe('/logos/stocks/nvda.png');
    expect(stockLogoUrls('TSLA')[0]).toBe('/logos/stocks/tsla.svg');
    expect(stockLogoUrls('MSFT')[0]).toBe('/logos/stocks/msft.svg');
    expect(stockLogoUrls('AMZN')[0]).toBe('/logos/stocks/amzn.svg');
    expect(stockLogoUrls('META')[0]).toBe('/logos/stocks/meta.svg');
  });

  it('keeps a remote fallback after the local file', () => {
    const urls = stockLogoUrls('QQQ');
    expect(urls[1]).toContain('financialmodelingprep.com');
    expect(urls.some((u) => u.includes('parqet.com'))).toBe(true);
  });

  it('does not invent a local file for an unlisted ticker', () => {
    expect(stockLogoUrls('GOOGL')[0]).toContain('financialmodelingprep.com');
    expect(stockLogoUrls('')).toEqual([]);
  });
});
