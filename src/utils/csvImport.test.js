import { describe, it, expect } from 'vitest';
import {
  parseCSV, autoMapColumns, parseNumber, parseDate, buildImportTrades, importKeyOf,
  existingImportKeys, futuresSpecFor, mappingHasSize, describeSkipped,
} from './csvImport';

// Mirrors the Firestore create rule (isValidTrade) — every trade the import
// produces must pass it, or the whole 499-row batch is rejected.
const passesRules = (t) => t.entryPrice > 0 && t.quantity > 0 && t.stopLoss >= 0 && t.fees >= 0
  && ['long', 'short'].includes(t.direction) && ['open', 'closed', 'partial'].includes(t.status)
  && typeof t.pair === 'string' && t.pair.length > 0 && t.pair.length <= 30
  && (t.assetClass === 'futures_cme'
    ? t.contract?.contracts > 0 && t.contract.pointValue > 0 && t.contract.tickSize > 0
    : t.leverage >= 1 && t.leverage <= 200);

const fromCsv = (csv, opts) => {
  const { headers, rows } = parseCSV(csv);
  return buildImportTrades(rows, autoMapColumns(headers), opts);
};

describe('parseCSV', () => {
  it('strips the UTF-8 BOM our own export writes, so the first header still maps', () => {
    const { headers } = parseCSV('﻿תאריך,זוג,כניסה\n01/02/2024,BTCUSDT,100');
    expect(headers[0]).toBe('תאריך');
    expect(autoMapColumns(headers).entryDate).toBe('תאריך');
  });

  it('handles quoted commas, doubled quotes and newlines inside cells', () => {
    const { rows } = parseCSV('pair,notes,entry\nBTCUSDT,"a, ""b""\nline2",100');
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('a, "b"\nline2');
    expect(rows[0].entry).toBe('100');
  });

  it('sniffs a semicolon delimiter (European Excel)', () => {
    const { headers, rows } = parseCSV('pair;entry;qty\nETHUSDT;1.234,5;2');
    expect(headers).toEqual(['pair', 'entry', 'qty']);
    expect(parseNumber(rows[0].entry)).toBe(1234.5);
  });
});

describe('autoMapColumns', () => {
  it('keeps unit sizes and dollar sizes in separate fields', () => {
    const m = autoMapColumns(['Symbol', 'Shares', 'Entry Price', 'Size (USD)']);
    expect(m.quantity).toBe('Shares');
    expect(m.positionSize).toBe('Size (USD)');
    expect(m.entryPrice).toBe('Entry Price');
  });

  it('maps Bybit closed-P&L headers (symbol column named "Contracts")', () => {
    const m = autoMapColumns(['Contracts', 'Closing Direction', 'Qty', 'Entry Price', 'Exit Price', 'Closed P&L']);
    expect(m.pair).toBe('Contracts');
    expect(m.quantity).toBe('Qty');
    expect(m.profit).toBe('Closed P&L');
  });

  it('prefers a gross P&L column over a net one and never maps a header twice', () => {
    const m = autoMapColumns(['רווח/הפסד נטו', 'רווח ברוטו', 'תאריך', 'תאריך סגירה']);
    expect(m.profit).toBe('רווח ברוטו');
    expect(m.entryDate).toBe('תאריך');
    expect(m.exitDate).toBe('תאריך סגירה');
  });
});

describe('parseNumber / parseDate', () => {
  it('reads thousands separators, decimal commas and accounting negatives', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('(12.50)')).toBe(-12.5);
    expect(parseNumber('$ 100')).toBe(100);
    expect(parseNumber('')).toBeNaN();
  });

  it('parses dd/MM/yyyy as a LOCAL date and rejects rolled-over garbage', () => {
    const d = parseDate('15/01/2024 09:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2024, 0, 15, 9]);
    expect(parseDate('2024-13-40')).toBeNull();
    expect(parseDate('1700000000').getTime()).toBe(1700000000000);
  });
});

describe('buildImportTrades — validation', () => {
  it('treats qty/shares as UNITS (100 shares @ $50 → 100, not 2)', () => {
    const { trades } = fromCsv('symbol,shares,entry,exit,date\nAAPL,100,50,55,2024-01-02 10:00', { assetClass: 'stocks' });
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(100);
    expect(trades[0].assetClass).toBe('stocks');
    expect(trades[0].leverage).toBe(1);
    expect(trades[0].marketType).toBe('spot');
    expect(passesRules(trades[0])).toBe(true);
  });

  it('divides a DOLLAR size by the entry price', () => {
    const { trades } = fromCsv('pair,size,entry,date\nBTCUSDT,1000,50000,2024-01-02', { assetClass: 'crypto' });
    expect(trades[0].quantity).toBeCloseTo(0.02);
    expect(trades[0].assetClass).toBe('crypto');
  });

  it('makes negative fees (rebates) positive and drops a negative stop', () => {
    const { trades } = fromCsv('pair,qty,entry,fee,sl,date\nETHUSDT,1,2000,-0.35,-5,2024-01-02', {});
    expect(trades[0].fees).toBe(0.35);
    expect(trades[0].stopLoss).toBe(0);
    expect(passesRules(trades[0])).toBe(true);
  });

  it('skips rows with no size instead of writing quantity 0', () => {
    const { trades, counts } = fromCsv('pair,qty,entry,date\nETHUSDT,,2000,2024-01-02\nBTCUSDT,1,100,2024-01-03', {});
    expect(trades).toHaveLength(1);
    expect(counts.missing_size).toBe(1);
  });

  it('derives a nominal quantity when only the P&L is known', () => {
    const { trades, estimatedSize } = fromCsv('pair,entry,exit,pnl,date\nETHUSDT,2000,2100,42.5,2024-01-02', {});
    expect(trades[0].quantity).toBe(1);
    expect(trades[0].sizeEstimated).toBe(true);
    expect(trades[0].pnlFromExchange).toBe(42.5);
    expect(trades[0].status).toBe('closed');
    expect(estimatedSize).toBe(1);
    expect(passesRules(trades[0])).toBe(true);
  });

  it('counts every skip reason (missing entry, missing pair, bad date)', () => {
    const csv = [
      'pair,qty,entry,date',
      'BTCUSDT,1,,2024-01-02',
      ',1,100,2024-01-02',
      'BTCUSDT,1,100,not-a-date',
      'BTCUSDT,1,100,2024-01-02',
    ].join('\n');
    const { trades, counts } = fromCsv(csv, {});
    expect(trades).toHaveLength(1);
    expect(counts).toEqual({ missing_entry: 1, missing_pair: 1, invalid_date: 1 });
    expect(describeSkipped(counts)).toContain('חסר מחיר כניסה');
  });

  it('every produced row satisfies the Firestore create rule', () => {
    const csv = [
      'pair,qty,size,entry,exit,fee,sl,leverage,pnl,date',
      'BTCUSDT,0.1,,50000,51000,-1,49000,500,,2024-01-02',
      'ETHUSDT,,2000,2000,0,3,0,0,,2024-01-03',
      'SOLUSDT,,,150,160,0.2,,,12,2024-01-04',
    ].join('\n');
    const { trades } = fromCsv(csv, {});
    expect(trades).toHaveLength(3);
    trades.forEach((t) => expect(passesRules(t)).toBe(true));
    expect(trades[0].leverage).toBe(200);
  });
});

describe('buildImportTrades — futures journal', () => {
  it('resolves the contract spec from broker symbols and stores contracts', () => {
    const { trades } = fromCsv('symbol,contracts,entry,exit,date\nMESZ4,2,5000,5010,2024-12-02 15:00', { assetClass: 'futures_cme' });
    expect(trades[0].pair).toBe('MES');
    expect(trades[0].contract).toEqual({ symbol: 'MES', pointValue: 5, tickSize: 0.25, contracts: 2 });
    expect(trades[0].quantity).toBe(2);
    expect(trades[0].leverage).toBe(1);
    expect(passesRules(trades[0])).toBe(true);
  });

  it('keeps a fractional XAUUSD lot instead of rounding it to a whole contract', () => {
    const { trades } = fromCsv(
      'symbol,contracts,entry,exit,date\nXAUUSD,0.1,4020,3991.8,2024-12-02 15:00',
      { assetClass: 'futures_cme' },
    );
    expect(trades[0].pair).toBe('XAUUSD');
    expect(trades[0].contract).toMatchObject({ symbol: 'XAUUSD', pointValue: 100, contracts: 0.1 });
    expect(trades[0].quantity).toBeCloseTo(0.1, 8);
    expect(passesRules(trades[0])).toBe(true);
  });

  it('skips unknown contracts', () => {
    const { trades, counts } = fromCsv('symbol,contracts,entry,date\nXYZ,1,100,2024-01-02', { assetClass: 'futures_cme' });
    expect(trades).toHaveLength(0);
    expect(counts.unknown_contract).toBe(1);
  });

  it('futuresSpecFor picks the longest root', () => {
    expect(futuresSpecFor('/ES').symbol).toBe('ES');
    expect(futuresSpecFor('ESH25').symbol).toBe('ES');
    expect(futuresSpecFor('MNQ 03-25').symbol).toBe('MNQ');
    expect(futuresSpecFor('MCLZ4').symbol).toBe('MCL');
    expect(futuresSpecFor('ESPRESSO')).toBeNull();
  });
});

describe('buildImportTrades — dedupe', () => {
  const csv = 'pair,qty,entry,exit,date\nBTCUSDT,0.5,50000,51000,2024-01-02 10:00:00\nETHUSDT,2,2000,2100,2024-01-03 11:00:00';

  it('re-importing the same file adds nothing', () => {
    const first = fromCsv(csv, {});
    expect(first.trades).toHaveLength(2);
    expect(first.trades[0].importKey).toBeTruthy();
    // Simulate what Firestore hands back: dates as Timestamps.
    const stored = first.trades.map((t) => ({ ...t, entryDate: { toDate: () => t.entryDate } }));
    const second = fromCsv(csv, { existingTrades: stored });
    expect(second.trades).toHaveLength(0);
    expect(second.counts.duplicate).toBe(2);
  });

  it('recognises legacy imports without a stored key by their fields', () => {
    const first = fromCsv(csv, {});
    const legacy = first.trades.map((t) => { const copy = { ...t }; delete copy.importKey; return copy; });
    expect(existingImportKeys(legacy).has(importKeyOf(first.trades[0]))).toBe(true);
    expect(fromCsv(csv, { existingTrades: legacy }).trades).toHaveLength(0);
  });

  it('drops duplicate rows inside one file but keeps different sizes', () => {
    const dup = 'pair,qty,entry,date\nBTCUSDT,1,100,2024-01-02 10:00\nBTCUSDT,1,100,2024-01-02 10:00\nBTCUSDT,2,100,2024-01-02 10:00';
    const { trades, counts } = fromCsv(dup, {});
    expect(trades).toHaveLength(2);
    expect(counts.duplicate).toBe(1);
  });
});

describe('mappingHasSize', () => {
  it('requires units, $ size or a P&L column', () => {
    expect(mappingHasSize({ pair: 'a', entryPrice: 'b' })).toBe(false);
    expect(mappingHasSize({ quantity: 'q' })).toBe(true);
    expect(mappingHasSize({ profit: 'p' })).toBe(true);
  });
});
