import { describe, it, expect } from 'vitest';
import { JOURNAL_CSV_HEADERS, journalCsvHeaders, journalCsvRow, exitsSummary, grossPnl, signedR, tradeUnits } from './tradeExport';
import { signedTradeR, tradeNetPercent } from './calculations';
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
    // Net R is net P&L / initial risk: 98 / (|50000 − 49000| × 0.1) = 0.98.
    // The stored rrRatio (2) is the gross price ratio, which the table does not show.
    expect(col(row, 'R')).toBe(0.98);
    expect(col(row, '%')).toBe(19.6);
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
    expect(trades[0].custom).toBeUndefined();
    expect(trades[0].entryDate.getHours()).toBe(10);
  });

  it('appends defined custom fields and round-trips them without changing a file that has none', () => {
    const defs = [
      { id: 'f1', name: 'סשן', type: 'text' },
      { id: 'f2', name: 'ציון', type: 'number' },
    ];
    expect(journalCsvHeaders([])).toBe(JOURNAL_CSV_HEADERS);
    expect(journalCsvRow(crypto)).toHaveLength(JOURNAL_CSV_HEADERS.length);
    const headers = journalCsvHeaders(defs);
    const row = journalCsvRow({ ...crypto, custom: { f1: 'לונדון, בוקר', f2: 2 } }, defs);
    expect(row).toHaveLength(headers.length);
    expect(row[headers.indexOf('שדה: סשן')]).toBe('לונדון, בוקר');
    expect(row[headers.indexOf('שדה: ציון')]).toBe(2);
    const csv = toCsv(headers, [row]);
    expect(csv).toContain('"לונדון, בוקר"');
    const parsed = parseCSV(csv);
    const imported = buildImportTrades(parsed.rows, autoMapColumns(parsed.headers), { assetClass: 'crypto', customFields: defs });
    expect(imported.trades[0].custom).toEqual({ f1: 'לונדון, בוקר', f2: 2 });
    const plain = buildImportTrades(parsed.rows, autoMapColumns(parsed.headers), { assetClass: 'crypto' });
    expect(plain.trades[0].custom).toBeUndefined();
    expect(plain.trades[0].pair).toBe('BTCUSDT');
  });

  // Staging rows whose stored pnlPercent / rrRatio are the old CSV cells.
  // The table shows tradeNetPercent and signedTradeR (net of fees). Position
  // size is chosen so those helpers land on the reported table figures.
  const staged = ({ pair, net, leverage, tablePct, tableR, storedPct, storedR, entryDate }) => {
    const positionSize = (net * 100 * leverage) / tablePct;
    const pnl = (storedPct * positionSize) / (100 * leverage);
    const entryPrice = 100;
    const units = positionSize / entryPrice;
    const risk = net / tableR;
    const stop = entryPrice - (risk / units);
    return {
      pair, direction: 'long', status: 'closed', assetClass: 'crypto',
      entryPrice, exitPrice: entryPrice, quantity: units, positionSize, leverage,
      pnl, netPnl: net, fees: pnl - net, pnlPercent: storedPct, rrRatio: Math.abs(storedR),
      stopLoss: stop, originalStopLoss: stop, entryDate,
    };
  };

  const stagingTrades = [
    staged({ pair: 'BNBUSDT', net: -8.05, leverage: 10, tablePct: -27.78, tableR: -1.16, storedPct: -24.02, storedR: -1, entryDate: new Date(2026, 0, 10, 9, 0) }),
    staged({ pair: 'ADAUSDT', net: -28.98, leverage: 5, tablePct: -16.52, tableR: -1.2, storedPct: -13.78, storedR: -1, entryDate: new Date(2026, 0, 11, 9, 0) }),
    staged({ pair: 'XAUUSDT', net: -0.73, leverage: 1, tablePct: -0.42, tableR: -0.14, storedPct: 0.96, storedR: -0.33, entryDate: new Date(2026, 0, 12, 9, 0) }),
  ];

  it('writes the table net % and net R for the staging mismatches', () => {
    const expected = [
      { pct: -27.78, r: -1.16, net: -8.05 },
      { pct: -16.52, r: -1.2, net: -28.98 },
      { pct: -0.42, r: -0.14, net: -0.73 },
    ];
    stagingTrades.forEach((trade, i) => {
      const row = journalCsvRow(trade);
      expect(trade.fees).toBeGreaterThan(0);
      expect(tradeNetPercent(trade)).toBeCloseTo(expected[i].pct, 2);
      expect(signedTradeR(trade)).toBeCloseTo(expected[i].r, 2);
      expect(col(row, '%')).toBe(Number(tradeNetPercent(trade).toFixed(2)));
      expect(col(row, 'R')).toBe(Number(signedTradeR(trade).toFixed(2)));
      expect(col(row, '%')).toBe(expected[i].pct);
      expect(col(row, 'R')).toBe(expected[i].r);
      expect(col(row, 'רווח/הפסד נטו')).toBe(expected[i].net);
      // Stored gross percent and price R are what the old file wrote.
      expect(col(row, '%')).not.toBe(trade.pnlPercent);
      expect(col(row, 'R')).not.toBe(signedR(trade));
    });
  });

  it('keeps CSV column names and order so an exported file still imports', () => {
    expect(JOURNAL_CSV_HEADERS).toEqual([
      'תאריך', 'תאריך סגירה', 'זוג', 'סוג נכס', 'כיוון', 'כניסה', 'סגירה', 'סטופ לוס', 'סטופ מקורי',
      'כמות', 'יחידת כמות', 'גודל עסקה', 'מינוף', 'יציאות', 'רווח ברוטו', 'עמלות', 'רווח/הפסד נטו',
      '%', 'R', 'אסטרטגיה', 'טווח זמן', 'סטטוס', 'מקור', 'סיבת כניסה', 'הערות', 'תגיות',
      'רגש לפני', 'רגש אחרי', 'טעויות', 'ביטחון', 'סטאפ',
    ]);
    const csv = toCsv(JOURNAL_CSV_HEADERS, stagingTrades.map((t) => journalCsvRow(t)));
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(JOURNAL_CSV_HEADERS);
    const mapping = autoMapColumns(headers);
    expect(mapping.profit).toBe('רווח ברוטו');
    expect(Object.values(mapping)).not.toContain('%');
    expect(Object.values(mapping)).not.toContain('R');
    const { trades, skipped } = buildImportTrades(rows, mapping, { assetClass: 'crypto' });
    expect(skipped).toEqual([]);
    expect(trades.map((t) => t.pair)).toEqual(['BNBUSDT', 'ADAUSDT', 'XAUUSDT']);
    expect(trades.map((t) => t.pnlFromExchange)).toEqual(
      stagingTrades.map((t) => col(journalCsvRow(t), 'רווח ברוטו')),
    );
    expect(trades.every((t) => t.quantity > 0 && t.entryPrice > 0 && t.fees >= 0)).toBe(true);
  });
});
