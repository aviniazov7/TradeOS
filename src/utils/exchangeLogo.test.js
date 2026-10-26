import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { EXCHANGES, exchangeLabel, getExchangeLogo } from './constants';

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
      '/logos/exchanges/mexc.svg',
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
    expect(getExchangeLogo('mexc')).toBe('/logos/exchanges/mexc.svg');
    expect(getExchangeLogo('phemex')).toBe('/logos/exchanges/phemex.svg');
    expect(getExchangeLogo('bitget')).toBe('/logos/exchanges/bitget.png');
    expect(getExchangeLogo('kraken')).toBe('/logos/exchanges/kraken.png');
    expect(getExchangeLogo('bingx')).toBe('/logos/exchanges/bingx.png');
    expect(getExchangeLogo('deribit')).toBe('/logos/exchanges/deribit.svg');
    expect(getExchangeLogo('okx')).toBe('/logos/exchanges/okx.svg');
    expect(getExchangeLogo('Bybit')).toBe('/logos/exchanges/bybit.png');
    for (const value of ['binance', 'mexc', 'bitget', 'kraken', 'bingx', 'deribit', 'okx', 'bybit', 'vantage']) {
      expect(getExchangeLogo(value)).not.toMatch(/\.jpe?g$/);
    }
  });

  it('swaps marks that have a light-theme file', () => {
    expect(getExchangeLogo('okx', { theme: 'light' })).toBe('/logos/exchanges/okx-on-light.svg');
    expect(getExchangeLogo('bybit', { theme: 'light' })).toBe('/logos/exchanges/bybit-on-light.png');
    expect(getExchangeLogo('mexc', { theme: 'light' })).toBe('/logos/exchanges/mexc-on-light.svg');
    expect(getExchangeLogo('phemex', { theme: 'light' })).toBe('/logos/exchanges/phemex-on-light.svg');
    expect(getExchangeLogo('binance', { theme: 'light' })).toBe('/logos/exchanges/binance.svg');
    expect(getExchangeLogo('deribit', { theme: 'light' })).toBe('/logos/exchanges/deribit.svg');
    expect(getExchangeLogo('okx', { theme: 'dark' })).toBe('/logos/exchanges/okx.svg');
    expect(getExchangeLogo('mexc', { theme: 'dark' })).toBe('/logos/exchanges/mexc.svg');
  });

  it('keeps a favicon for brokers that have no local mark, and guesses a custom name', () => {
    expect(getExchangeLogo('icmarkets')).toContain('domain=icmarkets.com');
    expect(getExchangeLogo('mybroker')).toContain('domain=mybroker.com');
  });

  it('lists Vantage as a broker with the official mark on both themes', () => {
    const vantage = EXCHANGES.find((e) => e.value === 'vantage');
    expect(vantage).toMatchObject({
      label: 'Vantage',
      domain: 'vantagemarkets.com',
      type: 'broker',
    });
    // Shared with every journal asset class: the picker does not drop brokers
    // when the journal is crypto or futures/stocks.
    expect(vantage.assetClasses).toBeUndefined();
    const q = 'vantage';
    const matches = EXCHANGES.filter((ex) => (
      ex.label.toLowerCase().includes(q) || ex.value.toLowerCase().includes(q)
    ));
    expect(matches.map((ex) => ex.value)).toEqual(['vantage']);
    expect(exchangeLabel('vantage')).toBe('Vantage');
    expect(getExchangeLogo('vantage')).toBe('/logos/exchanges/vantage.svg');
    expect(getExchangeLogo('Vantage')).toBe('/logos/exchanges/vantage.svg');
    expect(getExchangeLogo('vantage', { theme: 'light' })).toBe('/logos/exchanges/vantage-on-light.svg');
    expect(getExchangeLogo('vantage', { theme: 'dark' })).toBe('/logos/exchanges/vantage.svg');
    const dark = readFileSync('public/logos/exchanges/vantage.svg', 'utf8');
    const light = readFileSync('public/logos/exchanges/vantage-on-light.svg', 'utf8');
    expect(dark).toContain('#e35728');
    expect(dark).toContain('#FFFFFF');
    expect(light).toContain('#034854');
    expect(light).toContain('#e35728');
  });
});
