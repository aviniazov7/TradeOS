import { describe, it, expect } from 'vitest';
import { EXCHANGES, exchangeSyncBlurb, connectMode, connectionGuideNotes } from './exchangeConfig';

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

  it('puts Binance on CSV import and keeps API keys for syncing venues', () => {
    const byId = (id) => EXCHANGES.find((e) => e.id === id);
    expect(connectMode(byId('binance'))).toBe('csv');
    expect(connectMode(byId('bybit'))).toBe('keys');
    expect(connectMode(byId('hyperliquid'))).toBe('address');
  });

  it('tells every API exchange to use a read-only key with no IP limit, and MEXC about 90 days', () => {
    const byId = (id) => EXCHANGES.find((e) => e.id === id);
    const bybit = connectionGuideNotes(byId('bybit')).join(' ');
    expect(bybit).toContain('Read-Only');
    expect(bybit).toContain('בלי הגבלת IP');
    const mexc = connectionGuideNotes(byId('mexc')).join(' ');
    expect(mexc).toContain('90');
    expect(connectionGuideNotes(byId('binance')).join(' ')).toContain('CSV');
    expect(connectionGuideNotes(byId('binance')).join(' ')).not.toContain('Read-Only');
  });
});