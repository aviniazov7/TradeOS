import { describe, expect, it } from 'vitest';
import {
  MAX_TRADE_CHART_LINKS,
  TRADINGVIEW_URL_RE,
  chartLinkFields,
  chartLinksForEditor,
  chartLinksToSave,
  normalizeTradingViewUrl,
  parseChartLinkInputs,
  tradeChartLinks,
  tradingViewEmbedSrc,
  tradingViewSnapshotImage,
  validTradingViewUrls,
} from './tradingViewLink';

describe('tradingView link preview', () => {
  it('maps a snapshot share to the public PNG', () => {
    expect(tradingViewSnapshotImage('https://www.tradingview.com/x/AbC123/'))
      .toBe('https://s3.tradingview.com/snapshots/a/AbC123.png');
  });

  it('passes a direct image through and ignores other hosts', () => {
    expect(tradingViewSnapshotImage('https://cdn.example.com/chart.png'))
      .toBe('https://cdn.example.com/chart.png');
    expect(tradingViewSnapshotImage('https://evil.example/x/AbC123')).toBeNull();
    expect(tradingViewSnapshotImage('javascript:alert(1)')).toBeNull();
  });

  it('embeds a TradingView chart URL and not a snapshot page', () => {
    const chart = 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT';
    expect(tradingViewEmbedSrc(chart)).toBe(chart);
    expect(tradingViewEmbedSrc('https://www.tradingview.com/x/AbC123')).toBeNull();
    expect(tradingViewEmbedSrc('https://example.com/chart')).toBeNull();
  });
});

describe('tradingView link field', () => {
  it('accepts snapshot and chart links, and adds https when it is missing', () => {
    expect(normalizeTradingViewUrl('https://www.tradingview.com/x/AbC123'))
      .toBe('https://www.tradingview.com/x/AbC123');
    expect(normalizeTradingViewUrl('tradingview.com/x/AbC123'))
      .toBe('https://tradingview.com/x/AbC123');
    expect(normalizeTradingViewUrl('http://s.tradingview.com/chart/?symbol=BINANCE:BTCUSDT'))
      .toBe('https://s.tradingview.com/chart/?symbol=BINANCE:BTCUSDT');
    expect(normalizeTradingViewUrl('  ')).toBe('');
  });

  it('rejects anything that is not a tradingview.com URL', () => {
    expect(normalizeTradingViewUrl('https://evil.example/x/AbC123')).toBeNull();
    expect(normalizeTradingViewUrl('https://tradingview.com.evil.com/x/AbC123')).toBeNull();
    expect(normalizeTradingViewUrl('https://nottradingview.com/x/AbC123')).toBeNull();
    expect(normalizeTradingViewUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeTradingViewUrl('https://user:pass@www.tradingview.com/x/AbC123')).toBeNull();
    expect(normalizeTradingViewUrl('data:image/png;base64,aaaa')).toBeNull();
  });

  it('keeps at most four unique links and fails a bad paste instead of dropping it', () => {
    const four = ['https://tradingview.com/x/a', 'https://tradingview.com/x/b', 'https://tradingview.com/x/c', 'https://tradingview.com/x/d'];
    expect(parseChartLinkInputs([...four, 'https://tradingview.com/x/e']).ok).toBe(false);
    const duped = parseChartLinkInputs(['https://www.tradingview.com/x/AbC123', 'https://www.tradingview.com/x/AbC123/', '']);
    expect(duped).toEqual({ ok: true, links: ['https://www.tradingview.com/x/AbC123'], error: null });
    expect(parseChartLinkInputs(['https://example.com']).error).toMatch(/tradingview\.com/);
    expect(validTradingViewUrls([...four, 'https://tradingview.com/x/e'])).toHaveLength(MAX_TRADE_CHART_LINKS);
  });

  it('writes the list and the first link, and still reads a legacy single URL', () => {
    const fields = chartLinkFields(['https://www.tradingview.com/chart/BTCUSDT/', 'https://tradingview.com/x/ZZ']);
    expect(fields.tradingViewUrls).toHaveLength(2);
    expect(fields.tradingViewUrl).toBe(fields.tradingViewUrls[0]);
    expect(fields.tradingViewUrls.every((url) => TRADINGVIEW_URL_RE.test(url))).toBe(true);
    expect(tradeChartLinks({ tradingViewUrl: 'https://www.tradingview.com/x/AbC123' }))
      .toEqual(['https://www.tradingview.com/x/AbC123']);
    expect(tradeChartLinks({
      tradingViewUrl: 'https://evil.example/a',
      tradingViewUrls: ['https://www.tradingview.com/x/AbC123'],
    })).toEqual(['https://www.tradingview.com/x/AbC123']);
    expect(tradeChartLinks({ tradingViewUrl: 'javascript:alert(1)' })).toEqual([]);
    expect(tradeChartLinks({ tradingViewUrl: 'https://example.com/my-chart' }))
      .toEqual(['https://example.com/my-chart']);
    expect(chartLinksForEditor({ tradingViewUrl: 'https://www.tradingview.com/x/AbC123' }))
      .toEqual(['https://www.tradingview.com/x/AbC123']);
    expect(chartLinksForEditor({})).toEqual(['']);
  });

  it('keeps an unchanged legacy link and rejects a new non-TradingView link', () => {
    const trade = { tradingViewUrl: 'https://example.com/my-chart' };
    expect(chartLinksToSave(trade, ['https://example.com/my-chart']).fields)
      .toEqual({ tradingViewUrl: 'https://example.com/my-chart' });
    expect(chartLinksToSave(trade, ['https://www.tradingview.com/x/AbC123']).fields.tradingViewUrls)
      .toEqual(['https://www.tradingview.com/x/AbC123']);
    expect(chartLinksToSave(null, ['https://example.com/my-chart']).ok).toBe(false);
    expect(chartLinksToSave(trade, ['javascript:alert(1)']).ok).toBe(false);
  });
});
