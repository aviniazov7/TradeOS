import { describe, it, expect } from 'vitest';
import { getExchangeLogo } from './constants';

describe('getExchangeLogo', () => {
  it('does not request a favicon for the default broker id', () => {
    expect(getExchangeLogo('other')).toBeNull();
    expect(getExchangeLogo('Other')).toBeNull();
    expect(getExchangeLogo('')).toBeNull();
    expect(getExchangeLogo(null)).toBeNull();
  });

  it('uses a known domain and still guesses a custom name', () => {
    expect(getExchangeLogo('bybit')).toContain('domain=bybit.com');
    expect(getExchangeLogo('mybroker')).toContain('domain=mybroker.com');
  });
});
