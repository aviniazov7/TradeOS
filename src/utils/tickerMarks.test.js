import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tickerCoinUrls, tickerMarkUrls } from './tickerMarks';

const CFD_ICONS = {
  XAUUSD: '/logos/symbols/gold-coin.svg',
  XAGUSD: '/logos/symbols/silver-coin.svg',
  EURUSD: '/logos/symbols/eurusd.svg',
  GBPUSD: '/logos/symbols/gbpusd.svg',
  USDJPY: '/logos/symbols/usdjpy.svg',
  AUDUSD: '/logos/symbols/audusd.svg',
  USDCAD: '/logos/symbols/usdcad.svg',
  USDCHF: '/logos/symbols/usdchf.svg',
  NZDUSD: '/logos/symbols/nzdusd.svg',
  US30: '/logos/symbols/us-flag.svg',
  NAS100: '/logos/symbols/us-flag.svg',
  US500: '/logos/symbols/us-flag.svg',
};

describe('ticker marks', () => {
  it('points commodities and indices at local files', () => {
    expect(tickerMarkUrls('GC')).toEqual(['/logos/marks/gold.svg']);
    expect(tickerMarkUrls('XAU')).toEqual(['/logos/marks/gold.svg']);
    expect(tickerMarkUrls('XAUUSD')).toEqual(['/logos/symbols/gold-coin.svg']);
    expect(tickerMarkUrls('SI')).toEqual(['/logos/marks/silver.svg']);
    expect(tickerMarkUrls('XAGUSD')).toEqual(['/logos/symbols/silver-coin.svg']);
    expect(tickerMarkUrls('CL')).toEqual(['/logos/marks/oil.svg']);
    expect(tickerMarkUrls('NG')).toEqual(['/logos/marks/gas.svg']);
    expect(tickerMarkUrls('ES')).toEqual(['/logos/marks/sp500.svg']);
    expect(tickerMarkUrls('NQ')).toEqual(['/logos/marks/nasdaq.svg']);
    expect(tickerMarkUrls('NAS100')).toEqual(['/logos/symbols/us-flag.svg']);
    expect(tickerMarkUrls('US100')).toEqual(['/logos/symbols/us-flag.svg']);
    expect(tickerMarkUrls('US500')).toEqual(['/logos/symbols/us-flag.svg']);
    expect(tickerMarkUrls('US30')).toEqual(['/logos/symbols/us-flag.svg']);
    expect(tickerMarkUrls('YM')).toEqual(['/logos/marks/dow.svg']);
    expect(tickerMarkUrls('RTY')).toEqual(['/logos/marks/russell.svg']);
    expect(tickerMarkUrls('NVDA')).toEqual([]);
  });

  it('points the headline coins at local brand marks', () => {
    expect(tickerCoinUrls('btc')).toEqual(['/logos/coins/btc.png']);
    expect(tickerCoinUrls('ETH')).toEqual(['/logos/coins/eth.png']);
    expect(tickerCoinUrls('SOL')).toEqual(['/logos/coins/sol-15954313.png']);
    expect(tickerCoinUrls('SOL/USDT')).toEqual(['/logos/coins/sol-15954313.png']);
    expect(tickerCoinUrls('solusdt')).toEqual(['/logos/coins/sol-15954313.png']);
    expect(tickerCoinUrls('DOGE')).toEqual(['/logos/coins/doge.svg']);
    expect(tickerCoinUrls('LTC')).toEqual(['/logos/coins/ltc.svg']);
    expect(tickerCoinUrls('PEPE')).toEqual([]);
  });

  it('points the backtest CFD catalog at local coins, flags, and a US flag', () => {
    for (const [symbol, url] of Object.entries(CFD_ICONS)) {
      expect(tickerMarkUrls(symbol)).toEqual([url]);
      expect(tickerMarkUrls(symbol.toLowerCase())).toEqual([url]);
    }
    expect(tickerMarkUrls('EURUSD.R')).toEqual([]);
    expect(tickerMarkUrls('NOTREAL')).toEqual([]);

    const seen = new Set();
    for (const url of Object.values(CFD_ICONS)) {
      if (seen.has(url)) continue;
      seen.add(url);
      const svg = readFileSync(`public${url}`, 'utf8');
      expect(svg).toContain('viewBox="0 0 32 32"');
      const local = svg.replace('http://www.w3.org/2000/svg', '');
      expect(local).not.toMatch(/https?:/i);
      expect(svg).not.toMatch(/<image|href=/i);
    }
    const eur = readFileSync('public/logos/symbols/eurusd.svg', 'utf8');
    expect(eur).toContain('id="base"');
    expect(eur).toContain('id="quote"');
    expect(readFileSync('public/logos/symbols/gold-coin.svg', 'utf8')).toContain('goldFace');
    expect(readFileSync('public/logos/symbols/silver-coin.svg', 'utf8')).toContain('silverFace');
  });
});
