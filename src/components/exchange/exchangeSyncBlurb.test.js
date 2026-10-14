import { describe, it, expect } from 'vitest';
import { EXCHANGES, exchangeSyncBlurb } from './exchangeConfig';

describe('exchangeSyncBlurb', () => {
  it('lists auto-sync exchanges and keeps Binance on the manual side', () => {
    const text = exchangeSyncBlurb(EXCHANGES);
    const [auto, manual] = text.split(' — ');
    expect(auto).toContain('Bybit');
    expect(auto).toContain('MEXC');
    expect(auto).not.toContain('Binance');
    expect(manual).toContain('Binance');
    expect(manual).toContain('בלי סנכרון אוטומטי');
    expect(EXCHANGES.find((e) => e.id === 'binance').canSync).toBe(false);
  });
});