import { describe, it, expect } from 'vitest';
import { getExchangeLogo } from './constants';

describe('getExchangeLogo', () => {
  it('does not request a favicon for the default broker id', () => {
    expect(getExchangeLogo('other')).toBeNull();
    expect(getExchangeLogo('Other')).toBeNull();
    expect(getExchangeLogo('')).toBeNull();
    expect(getExchangeLogo(null)).toBeNull();
    expect(getExchangeLogo(undefined)).toBeNull();
    expect(getExchangeLogo('   ')).toBeNull();
  });

  it('never maps a missing or unknown exchange onto a real exchange logo', () => {
    const bundled = [
      '/logos/exchanges/bybit.png',
      '/logos/exchanges/binance.svg',
      '/logos/exchanges/mexc.png',
      '/logos/exchanges/okx.svg',
    ];
    for (const value of ['other', 'OTHER', 'none', 'unknown', 'unset', 'אחר', 'אחרת', 'ללא', '', null, undefined, 'by', 'bin', 'mex']) {
      const url = getExchangeLogo(value);
      expect(url == null || !String(url).includes('/logos/exchanges/')).toBe(true);
      expect(bundled).not.toContain(url);
    }
  });

  it('uses a real local mark for the supported exchanges', () => {
    expect(getExchangeLogo('bybit')).toBe('/logos/exchanges/bybit.png');
    expect(getExchangeLogo('binance')).toBe('/logos/exchanges/binance.svg');
    expect(getExchangeLogo('mexc')).toBe('/logos/exchanges/mexc.png');
    expect(getExchangeLogo('bitget')).toBe('/logos/exchanges/bitget.png');
    expect(getExchangeLogo('kraken')).toBe('/logos/exchanges/kraken.png');
    expect(getExchangeLogo('bingx')).toBe('/logos/exchanges/bingx.png');
    expect(getExchangeLogo('deribit')).toBe('/logos/exchanges/deribit.svg');
    expect(getExchangeLogo('okx')).toBe('/logos/exchanges/okx.svg');
    expect(getExchangeLogo('Bybit')).toBe('/logos/exchanges/bybit.png');
    for (const value of ['binance', 'mexc', 'bitget', 'kraken', 'bingx', 'deribit', 'okx', 'bybit']) {
      expect(getExchangeLogo(value)).not.toMatch(/\.jpe?g$/);
    }
  });

  it('swaps only the light-on-dark marks when the theme is light', () => {
    expect(getExchangeLogo('okx', { theme: 'light' })).toBe('/logos/exchanges/okx-on-light.svg');
    expect(getExchangeLogo('bybit', { theme: 'light' })).toBe('/logos/exchanges/bybit-on-light.png');
    expect(getExchangeLogo('binance', { theme: 'light' })).toBe('/logos/exchanges/binance.svg');
    expect(getExchangeLogo('okx', { theme: 'dark' })).toBe('/logos/exchanges/okx.svg');
  });

  it('keeps a favicon for brokers that have no local mark, and guesses a custom name', () => {
    expect(getExchangeLogo('vantage')).toContain('domain=vantagemarkets.com');
    expect(getExchangeLogo('mybroker')).toContain('domain=mybroker.com');
  });
});
