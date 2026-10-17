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
      '/logos/exchanges/binance.jpg',
      '/logos/exchanges/mexc.jpeg',
      '/logos/exchanges/okx.png',
    ];
    for (const value of ['other', 'OTHER', 'none', 'unknown', 'unset', 'אחר', 'אחרת', 'ללא', '', null, undefined, 'by', 'bin', 'mex']) {
      const url = getExchangeLogo(value);
      expect(url == null || !String(url).includes('/logos/exchanges/')).toBe(true);
      expect(bundled).not.toContain(url);
    }
  });

  it('uses a real local mark for the supported exchanges', () => {
    expect(getExchangeLogo('bybit')).toBe('/logos/exchanges/bybit.png');
    expect(getExchangeLogo('binance')).toBe('/logos/exchanges/binance.jpg');
    expect(getExchangeLogo('mexc')).toBe('/logos/exchanges/mexc.jpeg');
    expect(getExchangeLogo('okx')).toBe('/logos/exchanges/okx.png');
    expect(getExchangeLogo('Bybit')).toBe('/logos/exchanges/bybit.png');
  });

  it('keeps a favicon for brokers that have no local mark, and guesses a custom name', () => {
    expect(getExchangeLogo('vantage')).toContain('domain=vantagemarkets.com');
    expect(getExchangeLogo('mybroker')).toContain('domain=mybroker.com');
  });
});
