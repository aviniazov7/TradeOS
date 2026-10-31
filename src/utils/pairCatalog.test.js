import { describe, expect, it } from 'vitest';
import { COINS, SECTORS } from './constants';
import { formatPrice } from './formatters';
import {
  CFD_FOREX_PAIRS,
  buildPairResults,
  categoryForSymbol,
  cryptoQuantityPnl,
  formatQuoteAmount,
  formatSymbolPrice,
  normalizeCustomSymbol,
  priceDecimalsForSymbol,
  resolveTypedSymbol,
  uniqueSymbols,
} from './pairCatalog';

const FOREX = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'US30', 'NAS100', 'US500'];

describe('backtest CFD/forex catalog', () => {
  it('keeps the four sector shortcuts and the crypto gold pair', () => {
    expect(SECTORS.map((s) => s.key)).toEqual(['bitcoin', 'alts', 'meme', 'defi']);
    expect(COINS.some((c) => c.symbol === 'XAU')).toBe(true);
  });

  it('lists the CFD symbols with short English names, and still finds XAUUSDT', () => {
    expect(CFD_FOREX_PAIRS.map((p) => p.symbol)).toEqual(FOREX);
    for (const p of CFD_FOREX_PAIRS) {
      expect(p.name).toMatch(/^[A-Za-z0-9 &]+$/);
      expect(p.name.length).toBeLessThanOrEqual(8);
    }
    const xau = buildPairResults({ query: 'xau', includeMarkets: true }).rows.map((r) => r.pair);
    expect(xau).toContain('XAUUSD');
    expect(xau).toContain('XAUUSDT');
    expect(buildPairResults({ query: 'gold', includeMarkets: true }).rows.map((r) => r.pair)).toEqual(
      expect.arrayContaining(['XAUUSD', 'XAUUSDT']),
    );
    const xauRows = buildPairResults({ query: 'xau', includeMarkets: true }).rows;
    expect(xauRows.find((r) => r.pair === 'XAUUSD').category).toBe('Metals');
    expect(xauRows.find((r) => r.pair === 'XAUUSDT').category).toBe('Crypto');
    expect(categoryForSymbol('EURUSD')).toBe('Forex');
    expect(categoryForSymbol('NAS100')).toBe('Indices');
    expect(categoryForSymbol('BTCUSDT')).toBe('');
    expect(formatQuoteAmount(1000, 'JPY', { signed: true })).toBe('+1,000.00 JPY');
    expect(formatQuoteAmount(1000, 'USD', { signed: true })).toBeNull();
  });

  it('shows the CFD list on an empty multi-picker query and hides a symbol already chosen', () => {
    const open = buildPairResults({ includeMarkets: true, emptyIsMarketsOnly: true });
    expect(open.rows.map((r) => r.pair)).toEqual(FOREX);
    const rest = buildPairResults({
      includeMarkets: true,
      emptyIsMarketsOnly: true,
      selected: ['XAUUSD'],
    });
    expect(rest.rows.map((r) => r.pair)).not.toContain('XAUUSD');
    expect(rest.rows[0].pair).toBe('XAGUSD');
  });

  it('keeps a saved custom symbol usable like a listed one', () => {
    const rows = buildPairResults({
      includeMarkets: true,
      emptyIsMarketsOnly: true,
      saved: ['eurusd.r', 'XAUUSD'],
    }).rows.map((r) => r.pair);
    expect(rows).toContain('EURUSD.R');
    expect(rows.filter((p) => p === 'XAUUSD')).toHaveLength(1);
  });
});

describe('custom symbols', () => {
  it('uppercases, trims, and allows A–Z, digits, and . / - up to 15 characters', () => {
    expect(normalizeCustomSymbol('  eurusd.r ')).toBe('EURUSD.R');
    expect(normalizeCustomSymbol('eur/usd')).toBe('EUR/USD');
    expect(normalizeCustomSymbol('nas-100')).toBe('NAS-100');
    expect(normalizeCustomSymbol('A'.repeat(15))).toBe('A'.repeat(15));
    expect(normalizeCustomSymbol('A'.repeat(16))).toBeNull();
    expect(normalizeCustomSymbol('bad symbol')).toBeNull();
    expect(normalizeCustomSymbol('זהב')).toBeNull();
    expect(normalizeCustomSymbol('')).toBeNull();
  });

  it('saves a listed alias as the catalog symbol and a free symbol as typed', () => {
    expect(resolveTypedSymbol('xau/usd')).toBe('XAUUSD');
    expect(resolveTypedSymbol(' btcusdt ')).toBe('BTCUSDT');
    expect(resolveTypedSymbol('xauusd.r')).toBe('XAUUSD.R');
    expect(resolveTypedSymbol('not a pair')).toBeNull();
    expect(uniqueSymbols(['xau/usd', 'XAUUSD', 'eurusd.r', 'bad symbol'])).toEqual(['XAUUSD', 'EURUSD.R']);
  });

  it('does not append USDT to a CFD symbol, and the crypto picker still does', () => {
    const markets = buildPairResults({ query: 'XAUUSD', includeMarkets: true });
    expect(markets.custom).toBeNull();
    expect(markets.rows.map((r) => r.pair)).toContain('XAUUSD');
    expect(markets.rows.map((r) => r.pair)).not.toContain('XAUUSDUSDT');

    const custom = buildPairResults({ query: 'xauusd.r', includeMarkets: true });
    expect(custom.custom.pair).toBe('XAUUSD.R');

    const crypto = buildPairResults({ query: 'solx' });
    expect(crypto.custom.pair).toBe('SOLXUSDT');
    expect(crypto.rows.map((r) => r.pair)).not.toContain('XAUUSD');
  });
});

describe('price precision is not USDT-crypto for CFD and forex', () => {
  it('uses pip decimals for yen, majors, and gold — not the crypto magnitude rule', () => {
    expect(priceDecimalsForSymbol('USDJPY')).toBe(3);
    expect(priceDecimalsForSymbol('GBPJPY')).toBe(3);
    expect(priceDecimalsForSymbol('EURUSD')).toBe(5);
    expect(priceDecimalsForSymbol('XAUUSD')).toBe(2);
    expect(priceDecimalsForSymbol('XAGUSD')).toBe(3);
    expect(priceDecimalsForSymbol('US30')).toBe(1);
    expect(priceDecimalsForSymbol('NAS100')).toBe(1);
    // A USDT gold token still uses crypto magnitude. A spot CFD does not.
    expect(priceDecimalsForSymbol('XAUUSDT')).toBeNull();
    expect(priceDecimalsForSymbol('BTCUSDT')).toBeNull();

    // Crypto rule would print 150.12 and 1.0843 and drop a pipette / a yen pip.
    expect(formatPrice(150.123)).toBe('150.12');
    expect(formatPrice(1.08432)).toBe('1.0843');
    expect(formatSymbolPrice(150.123, 'USDJPY')).toBe('150.123');
    expect(formatSymbolPrice(1.08432, 'EURUSD')).toBe('1.08432');
    expect(formatSymbolPrice(2650.5, 'XAUUSD')).toBe('2,650.50');
    expect(formatSymbolPrice(31.234, 'XAGUSD')).toBe('31.234');
    expect(formatSymbolPrice(0.00001234, 'BTCUSDT')).toBe(formatPrice(0.00001234));
  });

  it('does not treat a forex or gold price difference as a USDT coin quantity', () => {
    expect(cryptoQuantityPnl('BTCUSDT')).toBe(true);
    expect(cryptoQuantityPnl('XAUUSDT')).toBe(true);
    expect(cryptoQuantityPnl('XAUUSD')).toBe(false);
    expect(cryptoQuantityPnl('USDJPY')).toBe(false);
    expect(cryptoQuantityPnl('EURUSD')).toBe(false);
    expect(cryptoQuantityPnl('NAS100')).toBe(false);
    expect(cryptoQuantityPnl('EURUSD.R')).toBe(false);
  });
});
