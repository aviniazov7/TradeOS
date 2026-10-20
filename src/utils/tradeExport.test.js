import { describe, it, expect } from 'vitest';
import { JOURNAL_CSV_HEADERS, journalCsvRow, exitsSummary, grossPnl, signedR, tradeUnits } from './tradeExport';
import { toCsv } from './csv';
import { parseCSV, autoMapColumns, buildImportTrades } from './csvImport';

const col = (row, header) => row[JOURNAL_CSV_HEADERS.indexOf(header)];

describe('journal CSV export', () => {
  const crypto = {
    pair: 'BTCUSDT', direction: 'long', entryPrice: 50000, exitPrice: 51000, quantity: 0.1,
    leverage: 10, fees: 2, pnl: 100, netPnl: 98, rrRatio: 2, stopLoss: 49500, originalStopLoss: 49000,
    status: 'closed', entryDate: new Date(2024, 0, 2, 10, 30), exitDate: new Date(2024, 0, 2, 14, 0),
    exits: [{ price: 50800, percent: 50 }, { price: 51200, percent: 50 }], source: 'bybit',
  };

  it('has one value per header', () => {
    expect(journalCsvRow(crypto)).toHaveLength(JOURNAL_CSV_HEADERS.length);
  });

  it('exports units, asset class, exits, gross/net P&L, fees, R and the original stop', () => {
    const row = journalCsvRow(crypto);
    expect(col(row, 'כמות')).toBe(0.1);
    expect(col(row, 'יחידת כמות')).toBe('מטבעות');
    expect(col(row, 'סוג נכס')).toBe('קריפטו');
    expect(col(row, 'יציאות')).toBe('50800 (50%) | 51200 (50%)');
    expect(col(row, 'רווח ברוטו')).toBe(100);
    expect(col(row, 'עמלות')).toBe(2);
    expect(col(row, 'רווח/הפסד נטו')).toBe(98);
    expect(col(row, 'R')).toBe(2);
    expect(col(row, 'סטופ מקורי')).toBe(49000);
    expect(col(row, 'תאריך')).toBe('02/01/2024 10:30');
    expect(col(row, 'סטאפ')).toBe('');
    expect(col(journalCsvRow({ ...crypto, setups: ['LPS', 'breakout'] }), 'סטאפ')).toBe('LPS | breakout');
  });

  it('uses contracts for futures and shares for stocks', () => {
    expect(tradeUnits({ assetClass: 'futures_cme', quantity: 3, contract: { contracts: 3 } })).toEqual({ qty: 3, unit: 'חוזים' });
    expect(tradeUnits({ assetClass: 'stocks', quantity: 100 })).toEqual({ qty: 100, unit: 'מניות' });
    expect(exitsSummary({ exits: [{ price: 5010, contracts: 1 }] })).toBe('5010 (1 חוזים)');
  });

  it('signs R from the net P&L and derives gross from net + fees', () => {
    expect(signedR({ rrRatio: 1.5, netPnl: -30 })).toBe(-1.5);
    expect(grossPnl({ netPnl: 98, fees: 2 })).toBe(100);
  });

  it('writes a UTF-8 BOM and keeps negative numbers numeric', () => {
    const csv = toCsv(JOURNAL_CSV_HEADERS, [journalCsvRow({ ...crypto, pnl: -50, netPnl: -52 })]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain(',-52,');
    expect(csv).not.toContain("'-52");
    // Text starting with a formula character is still neutralised.
    expect(toCsv(['a'], [['=HYPERLINK("x")']])).toContain("'=HYPERLINK");
  });

  it('round-trips through the CSV import with units and gross P&L', () => {
    const csv = toCsv(JOURNAL_CSV_HEADERS, [journalCsvRow(crypto)]);
    const { headers, rows } = parseCSV(csv);
    const { trades } = buildImportTrades(rows, autoMapColumns(headers), { assetClass: 'crypto' });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ pair: 'BTCUSDT', quantity: 0.1, entryPrice: 50000, exitPrice: 51000, fees: 2, pnlFromExchange: 100, stopLoss: 49500 });
    expect(trades[0].entryDate.getHours()).toBe(10);
  });
});
