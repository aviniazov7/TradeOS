import { describe, expect, it } from 'vitest';
import { cfdCandleRequest } from './cfdCandles';

describe('cfd candle proxy', () => {
  it('maps spot CFDs onto the futures series the candle worker already serves', () => {
    expect(cfdCandleRequest('XAUUSD')).toEqual({ asset: 'futures', symbol: 'GC', rebase: true });
    expect(cfdCandleRequest('xau/usd')).toEqual({ asset: 'futures', symbol: 'GC', rebase: true });
    expect(cfdCandleRequest('XAGUSD').symbol).toBe('SI');
    expect(cfdCandleRequest('NAS100').symbol).toBe('NQ');
    expect(cfdCandleRequest('US100').symbol).toBe('NQ');
    expect(cfdCandleRequest('GC')).toBeNull();
    expect(cfdCandleRequest('BTCUSDT')).toBeNull();
  });
});
