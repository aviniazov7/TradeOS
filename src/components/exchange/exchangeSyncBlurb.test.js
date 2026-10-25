import { describe, it, expect } from 'vitest';
import { EXCHANGES, exchangeSyncBlurb, connectMode, connectionGuideNotes, exchangeGlowStyle } from './exchangeConfig';

describe('exchangeSyncBlurb', () => {
  it('states auto-sync for MEXC and Bybit, and a file import for Binance', () => {
    const text = exchangeSyncBlurb(EXCHANGES);
    expect(text).toBe('סנכרון אוטומטי מ-MEXC ו-Bybit · ייבוא קובץ מ-Binance');
    expect(text).not.toContain('בלי סנכרון');
    expect(text).not.toContain('ייבוא ידני');
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

  it('offers a MetaTrader 5 file import for Vantage, next to the API exchanges', () => {
    const vantage = EXCHANGES.find((e) => e.id === 'vantage');
    const mexcAt = EXCHANGES.findIndex((e) => e.id === 'mexc');
    const vantageAt = EXCHANGES.findIndex((e) => e.id === 'vantage');
    expect(vantage.canSync).toBe(false);
    expect(vantage.importKind).toBe('mt5');
    expect(Math.abs(vantageAt - mexcAt)).toBe(1);
    expect(connectMode(vantage)).toBe('mt5');
    const notes = connectionGuideNotes(vantage).join(' ');
    expect(notes).toContain('MT5');
    expect(notes).not.toContain('Read-Only');
  });
});

describe('exchangeGlowStyle', () => {
  const byId = (id) => EXCHANGES.find((e) => e.id === id);

  it('keeps one brand color per exchange for the hover glow', () => {
    expect(byId('bybit').accent).toBe('#F7A600');
    expect(byId('binance').accent).toBe('#F0B90B');
    expect(byId('bitget').accent).toBe('#00F0FF');
    expect(byId('okx').accent).toBe('#F5F5F5');
    expect(byId('hyperliquid').accent).toBe('#97FCE4');
    expect(byId('mexc').accent).toBe('#1972F5');
    expect(byId('vantage').accent).toBe('#E10600');
    const accents = EXCHANGES.map((e) => e.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('paints the cursor bubble and the border beam from that accent, not the app cyan', () => {
    const expectSpot = (id, rgb) => {
      const style = exchangeGlowStyle(byId(id));
      expect(style['--beam-from']).toBe(byId(id).accent);
      expect(style['--spot']).toBe(`rgba(${rgb}, 0.10)`);
      expect(style['--beam-to']).toBe(`rgba(${rgb}, 0.6)`);
      expect(JSON.stringify(style)).not.toContain('56, 189, 248');
    };
    expectSpot('bybit', '247, 166, 0');
    expectSpot('binance', '240, 185, 11');
    expectSpot('bitget', '0, 240, 255');
    expectSpot('okx', '245, 245, 245');
    expectSpot('hyperliquid', '151, 252, 228');
    expectSpot('mexc', '25, 114, 245');
    expectSpot('vantage', '225, 6, 0');
  });
});