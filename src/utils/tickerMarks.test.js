import { describe, expect, it } from 'vitest';
import { tickerCoinUrls, tickerMarkUrls } from './tickerMarks';

describe('ticker marks', () => {
  it('points commodities and indices at local files', () => {
    expect(tickerMarkUrls('GC')).toEqual(['/logos/marks/gold.svg']);
    expect(tickerMarkUrls('XAU')).toEqual(['/logos/marks/gold.svg']);
    expect(tickerMarkUrls('SI')).toEqual(['/logos/marks/silver.svg']);
    expect(tickerMarkUrls('CL')).toEqual(['/logos/marks/oil.svg']);
    expect(tickerMarkUrls('NG')).toEqual(['/logos/marks/gas.svg']);
    expect(tickerMarkUrls('ES')).toEqual(['/logos/marks/sp500.svg']);
    expect(tickerMarkUrls('NQ')).toEqual(['/logos/marks/nasdaq.svg']);
    expect(tickerMarkUrls('YM')).toEqual(['/logos/marks/dow.svg']);
    expect(tickerMarkUrls('RTY')).toEqual(['/logos/marks/russell.svg']);
    expect(tickerMarkUrls('NVDA')).toEqual([]);
  });

  it('points the headline coins at local brand marks', () => {
    expect(tickerCoinUrls('btc')).toEqual(['/logos/coins/btc.png']);
    expect(tickerCoinUrls('ETH')).toEqual(['/logos/coins/eth.png']);
    expect(tickerCoinUrls('SOL')).toEqual(['/logos/coins/sol.png']);
    expect(tickerCoinUrls('DOGE')).toEqual(['/logos/coins/doge.svg']);
    expect(tickerCoinUrls('LTC')).toEqual(['/logos/coins/ltc.svg']);
    expect(tickerCoinUrls('PEPE')).toEqual([]);
  });
});
