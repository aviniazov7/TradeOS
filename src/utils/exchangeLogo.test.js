import { describe, it, expect } from 'vitest';
import { getExchangeLogo } from './constants';

describe('getExchangeLogo', () => {
  it('does not request a favicon for the default broker id', () => {
    expect(getExchangeLogo('other')).toBeNull();
    expect(getExchangeLogo('Other')).toBeNull();
    expect(getExchangeLogo('')).toBeNull();
    expect(getExchangeLogo(null)).toBeNull();
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
