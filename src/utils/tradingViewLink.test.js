import { describe, expect, it } from 'vitest';
import { tradingViewEmbedSrc, tradingViewSnapshotImage } from './tradingViewLink';

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
