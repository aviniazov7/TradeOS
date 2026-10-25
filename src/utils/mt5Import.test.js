import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MT5_IMPORT_ERRORS, VANTAGE_MT5_SOURCE, decodeMt5Bytes, parseMt5Date, parseMt5Text,
  partitionMt5Import, readMt5ArrayBuffer,
} from './mt5Import';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const html = readFileSync(fixture('mt5-report.html'), 'utf8');

// Mirrors the Firestore create rule (isValidTrade) for a crypto-shaped row.
const passesRules = (t) => t.entryPrice > 0 && t.quantity > 0 && t.stopLoss >= 0 && t.fees >= 0
  && ['long', 'short'].includes(t.direction) && ['open', 'closed'].includes(t.status)
  && typeof t.pair === 'string' && t.pair.length > 0 && t.pair.length <= 30
  && t.leverage >= 1 && t.leverage <= 200
  && t.source === VANTAGE_MT5_SOURCE
  && typeof t.externalId === 'string' && t.externalId.startsWith('mt5-');

const byTicket = (trades, ticket) => trades.find((t) => t.externalId === `mt5-${ticket}`);

describe('parseMt5Text — HTML report', () => {
  const parsed = parseMt5Text(html);

  it('reads the Positions table and ignores Orders, Deals and the deposit', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.sourceSection).toBe('positions');
    expect(parsed.trades).toHaveLength(3);
    expect(parsed.trades.map((t) => t.pair)).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);
    expect(parsed.trades.some((t) => t.pair === 'USDJPY')).toBe(false);
  });

  it('maps a closed buy to side, size, prices, times, fees and PnL', () => {
    const t = byTicket(parsed.trades, '123456789');
    expect(t.direction).toBe('long');
    expect(t.lots).toBe(0.1);
    expect(t.quantity).toBe(10000);
    expect(t.entryPrice).toBe(1.09234);
    expect(t.exitPrice).toBe(1.0945);
    expect(t.stopLoss).toBe(1.09);
    expect(t.tps).toEqual([1.098]);
    expect(t.status).toBe('closed');
    expect(t._isOpen).toBe(false);
    expect(t.entryDate).toBe(parseMt5Date('2024.03.12 09:15:22').toISOString());
    expect(t.exitDate).toBe(parseMt5Date('2024.03.12 11:42:08').toISOString());
    // Commission -0.70 is a fee. Swap +0.12 is a credit inside the gross P&L.
    // net = 21.72 - 0.70 = 21.02 = Profit + Commission + Swap.
    expect(t.fees).toBe(0.7);
    expect(t.pnlFromExchange).toBeCloseTo(21.72, 8);
    expect(t.pnlFromExchange - t.fees).toBeCloseTo(21.6 - 0.7 + 0.12, 8);
    expect(t.source).toBe('Vantage (MT5)');
    expect(t.externalId).toBe('mt5-123456789');
    expect(t.notes).toContain('123456789');
    expect(passesRules(t)).toBe(true);
  });

  it('treats a negative swap as a fee and a sell as short', () => {
    const t = byTicket(parsed.trades, '123456800');
    expect(t.direction).toBe('short');
    expect(t.lots).toBe(0.2);
    expect(t.quantity).toBe(20000);
    expect(t.fees).toBeCloseTo(2.2, 8);
    expect(t.pnlFromExchange).toBe(100);
    expect(t.pnlFromExchange - t.fees).toBeCloseTo(100 - 1.4 - 0.8, 8);
    expect(t.riskAmount).toBeCloseTo(100, 4);
    expect(t.status).toBe('closed');
    expect(passesRules(t)).toBe(true);
  });

  it('keeps an open position open and does not book its floating profit', () => {
    const t = byTicket(parsed.trades, '123456810');
    expect(t.pair).toBe('XAUUSD');
    expect(t.direction).toBe('short');
    expect(t.lots).toBe(0.02);
    expect(t.quantity).toBe(2);
    expect(t.status).toBe('open');
    expect(t._isOpen).toBe(true);
    expect(t.exitPrice).toBe(0);
    expect(t.exitDate).toBeNull();
    expect(t.pnlFromExchange).toBeUndefined();
    expect(t.fees).toBe(1.25);
    expect(t.stopLoss).toBe(2330);
    expect(t.tps).toEqual([2300]);
    expect(passesRules(t)).toBe(true);
  });

  it('reads the same report when MT5 saved it as UTF-16 LE', () => {
    const utf16 = new Uint8Array(2 + html.length * 2);
    utf16[0] = 0xFF;
    utf16[1] = 0xFE;
    for (let i = 0; i < html.length; i += 1) {
      const c = html.charCodeAt(i);
      utf16[2 + i * 2] = c & 0xFF;
      utf16[3 + i * 2] = (c >> 8) & 0xFF;
    }
    const again = parseMt5Text(decodeMt5Bytes(utf16));
    expect(again.ok).toBe(true);
    expect(again.trades.map((t) => t.externalId)).toEqual(parsed.trades.map((t) => t.externalId));
  });
});

describe('parseMt5Text — CSV and errors', () => {
  it('accepts a flat CSV with Close Time and Close Price headers', () => {
    const csv = [
      'Time,Position,Symbol,Type,Volume,Price,S/L,T/P,Close Time,Close Price,Commission,Swap,Profit',
      '2024.04.01 10:00:00,555001,USDJPY,buy,0.30,150.000,149.500,151.000,2024.04.01 12:00:00,150.500,-0.90,0,150.00',
    ].join('\n');
    const { ok, trades, sourceSection } = parseMt5Text(csv);
    expect(ok).toBe(true);
    expect(sourceSection).toBe('positions');
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.pair).toBe('USDJPY');
    expect(t.direction).toBe('long');
    expect(t.lots).toBe(0.3);
    expect(t.exitPrice).toBe(150.5);
    expect(t.status).toBe('closed');
    expect(t.fees).toBe(0.9);
    expect(t.pnlFromExchange).toBe(150);
    expect(passesRules(t)).toBe(true);
  });

  it('rebuilds a round-trip from the Deals table when Positions is absent', () => {
    const deals = `<table>
      <tr><td>Deals</td></tr>
      <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td><td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Fee</td><td>Swap</td><td>Profit</td></tr>
      <tr><td>2024.05.02 09:00:00</td><td>1001</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.10</td><td>1.10000</td><td>1</td><td>-0.50</td><td>0</td><td>0</td><td>0</td></tr>
      <tr><td>2024.05.02 10:00:00</td><td>1002</td><td>EURUSD</td><td>sell</td><td>out</td><td>0.04</td><td>1.10100</td><td>2</td><td>0</td><td>0</td><td>0</td><td>4.00</td></tr>
      <tr><td>2024.05.02 11:00:00</td><td>1003</td><td>EURUSD</td><td>sell</td><td>out</td><td>0.06</td><td>1.10200</td><td>3</td><td>0</td><td>0</td><td>-0.10</td><td>12.00</td></tr>
      <tr><td>2024.05.01 00:00:00</td><td>900</td><td></td><td>balance</td><td></td><td></td><td></td><td></td><td>0</td><td>0</td><td>0</td><td>1000</td></tr>
    </table>`;
    const { ok, trades, sourceSection } = parseMt5Text(deals);
    expect(ok).toBe(true);
    expect(sourceSection).toBe('deals');
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.externalId).toBe('mt5-1001');
    expect(t.direction).toBe('long');
    expect(t.lots).toBeCloseTo(0.1, 8);
    expect(t.exitPrice).toBeCloseTo(1.1016, 6);
    expect(t.status).toBe('closed');
    expect(t.fees).toBeCloseTo(0.6, 8);
    expect(t.pnlFromExchange).toBeCloseTo(16, 6);
    expect(passesRules(t)).toBe(true);
  });

  it('does not import deposit, withdraw, or credit rows even when credit has a volume', () => {
    const deals = `<table>
      <tr><td>Deals</td></tr>
      <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td><td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Fee</td><td>Swap</td><td>Profit</td><td>Comment</td></tr>
      <tr><td>2024.05.01 00:00:00</td><td>900</td><td></td><td>balance</td><td></td><td></td><td></td><td></td><td>0</td><td>0</td><td>0</td><td>1000</td><td>Deposit</td></tr>
      <tr><td>2024.05.01 00:01:00</td><td>901</td><td></td><td>balance</td><td></td><td></td><td></td><td></td><td>0</td><td>0</td><td>0</td><td>-200</td><td>Withdraw</td></tr>
      <tr><td>2024.05.01 00:02:00</td><td>902</td><td></td><td>credit</td><td>in</td><td>1.00</td><td>1.00</td><td></td><td>0</td><td>0</td><td>0</td><td>50</td><td>Credit</td></tr>
      <tr><td>2024.05.02 09:00:00</td><td>1001</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.10</td><td>1.10000</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td></td></tr>
      <tr><td>2024.05.02 10:00:00</td><td>1002</td><td>EURUSD</td><td>sell</td><td>out</td><td>0.10</td><td>1.10100</td><td>2</td><td>0</td><td>0</td><td>0</td><td>10</td><td></td></tr>
    </table>`;
    const { ok, trades } = parseMt5Text(deals);
    expect(ok).toBe(true);
    expect(trades.map((t) => t.externalId)).toEqual(['mt5-1001']);
  });

  it('returns a Hebrew error for an empty file, an unrecognized file, and a report with no trades', () => {
    expect(parseMt5Text('')).toMatchObject({ ok: false, error: MT5_IMPORT_ERRORS.empty });
    expect(parseMt5Text('<html><body><p>not a report</p></body></html>')).toMatchObject({
      ok: false, error: MT5_IMPORT_ERRORS.unrecognized,
    });
    expect(parseMt5Text('name,age\nAda,30')).toMatchObject({ ok: false, code: 'unrecognized' });
    const headerOnly = `<table><tr><td>Positions</td></tr>
      <tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td><td>Commission</td><td>Swap</td><td>Profit</td></tr>
      <tr><td colspan="12">Total</td><td>0</td></tr></table>`;
    expect(parseMt5Text(headerOnly)).toMatchObject({ ok: false, error: MT5_IMPORT_ERRORS.noTrades });
    for (const msg of Object.values(MT5_IMPORT_ERRORS)) {
      expect(msg).toMatch(/[\u0590-\u05FF]/);
    }
  });
});

describe('parseMt5Text — Vantage desktop report', () => {
  // Sanitized from a real History → Report → HTML export. The account
  // number and name are replaced. Positions rows keep the terminal's hidden
  // colspan spacer, and Deals still contain Deposit / Withdraw / credit.
  const report = readFileSync(fixture('mt5-vantage-report.html'), 'utf8');
  const parsed = parseMt5Text(report);

  it('reads every position and skips balance, credit, and canceled orders', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.sourceSection).toBe('positions');
    expect(parsed.trades.map((t) => t.externalId)).toEqual([
      'mt5-58780545', 'mt5-59139952', 'mt5-59149648', 'mt5-61749331',
      'mt5-82487915', 'mt5-86793364', 'mt5-89811596', 'mt5-89815098',
      'mt5-102552716',
    ]);
    expect(parsed.trades.every(passesRules)).toBe(true);
  });

  it('maps XAUUSD buy and sell with open/close time, stop, and target', () => {
    const sell = byTicket(parsed.trades, '59149648');
    expect(sell).toMatchObject({
      pair: 'XAUUSD', direction: 'short', lots: 0.01, quantity: 1,
      entryPrice: 4684.6, exitPrice: 4692.71, stopLoss: 4692.44,
      status: 'closed', fees: 0,
    });
    expect(sell.tps).toEqual([4666.2]);
    expect(sell.pnlFromExchange).toBeCloseTo(-8.11, 8);
    expect(sell.entryDate).toBe(parseMt5Date('2026.04.06 11:09:50').toISOString());
    expect(sell.exitDate).toBe(parseMt5Date('2026.04.06 11:15:30').toISOString());
    const open = byTicket(parsed.trades, '58780545');
    expect(open.stopLoss).toBe(0);
    expect(open.tps).toEqual([]);
    expect(open.pnlFromExchange).toBeCloseTo(-0.92, 8);
    expect(byTicket(parsed.trades, '61749331')).toMatchObject({
      pair: 'XAUUSD', direction: 'long', lots: 0.01, pnlFromExchange: 0.89,
    });
  });

  it('folds a positive swap into gross P&L and strips the broker suffix', () => {
    const btc = byTicket(parsed.trades, '82487915');
    expect(btc).toMatchObject({
      pair: 'BTCUSD', direction: 'short', lots: 0.1, fees: 0,
      entryPrice: 65858.92, exitPrice: 65298.36, stopLoss: 65291.2,
    });
    expect(btc.tps).toEqual([60653]);
    // Profit 56.05 plus swap +0.91. Commission is 0, so nothing is a fee.
    expect(btc.pnlFromExchange).toBeCloseTo(56.96, 8);
    expect(byTicket(parsed.trades, '89811596')).toMatchObject({
      pair: 'NAS100', direction: 'long', lots: 0.1, stopLoss: 28804.28,
    });
    expect(byTicket(parsed.trades, '89811596').tps).toEqual([28992.2]);
    expect(byTicket(parsed.trades, '102552716')).toMatchObject({
      pair: 'USOUSD', direction: 'long', lots: 0.1, quantity: 100, entryPrice: 75.676,
    });
    expect(byTicket(parsed.trades, '86793364')).toMatchObject({
      pair: 'ETHUSD', direction: 'short', lots: 3.01,
    });
  });

  it('reads the same report when MT5 saved it as UTF-16 LE', async () => {
    const utf16 = new Uint8Array(2 + report.length * 2);
    utf16[0] = 0xFF;
    utf16[1] = 0xFE;
    for (let i = 0; i < report.length; i += 1) {
      const c = report.charCodeAt(i);
      utf16[2 + i * 2] = c & 0xFF;
      utf16[3 + i * 2] = (c >> 8) & 0xFF;
    }
    const again = await readMt5ArrayBuffer(utf16, 'Report.html');
    expect(again.ok).toBe(true);
    expect(again.trades.map((t) => t.externalId)).toEqual(parsed.trades.map((t) => t.externalId));
  });
});

describe('readMt5ArrayBuffer — xlsx fixture', () => {
  it('parses the Excel report the same way as the HTML Positions table', async () => {
    const buf = readFileSync(fixture('mt5-report.xlsx'));
    const parsed = await readMt5ArrayBuffer(buf, 'Statement.xlsx');
    expect(parsed.ok).toBe(true);
    expect(parsed.trades.map((t) => t.externalId)).toEqual([
      'mt5-123456789', 'mt5-123456800', 'mt5-123456810',
    ]);
    const eur = byTicket(parsed.trades, '123456789');
    expect(eur.direction).toBe('long');
    expect(eur.lots).toBe(0.1);
    expect(eur.entryPrice).toBe(1.09234);
    expect(eur.exitPrice).toBe(1.0945);
    expect(eur.fees).toBe(0.7);
    expect(eur.pnlFromExchange).toBeCloseTo(21.72, 8);
    expect(eur.status).toBe('closed');
    expect(byTicket(parsed.trades, '123456810').status).toBe('open');
    expect(parsed.trades.every(passesRules)).toBe(true);
  });
});

describe('partitionMt5Import', () => {
  const file = parseMt5Text(html).trades;

  it('skips a ticket that is already in the journal', () => {
    const existing = [{ externalId: 'mt5-123456789', status: 'closed', pair: 'EURUSD' }];
    const { fresh, duplicates, updates } = partitionMt5Import(file, existing);
    expect(duplicates.map((t) => t.externalId)).toEqual(['mt5-123456789']);
    expect(fresh.map((t) => t.externalId)).toEqual(['mt5-123456800', 'mt5-123456810']);
    expect(updates).toHaveLength(0);
  });

  it('updates an open ticket when the new file has it closed', () => {
    const open = file.find((t) => t.externalId === 'mt5-123456810');
    const closed = { ...open, status: 'closed', _isOpen: false, exitPrice: 2310, pnlFromExchange: 20 };
    const { updates, duplicates } = partitionMt5Import(
      [closed],
      [{ id: 'doc1', externalId: 'mt5-123456810', status: 'open' }],
    );
    expect(updates).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it('does not import the same ticket twice from one file', () => {
    const twice = parseMt5Text(`${html}\n`);
    const ids = twice.trades.map((t) => t.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
