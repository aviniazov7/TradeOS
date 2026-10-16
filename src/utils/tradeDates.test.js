import { describe, expect, it } from 'vitest';
import { coerceTradeDate, tradeEntryDate, tradeExitDate } from './tradeDates';

const MARCH = new Date('2026-03-17T10:00:00Z');
const APRIL = new Date('2026-04-02T15:30:00Z');

describe('coerceTradeDate', () => {
  it('reads a Firestore Timestamp via toDate', () => {
    expect(coerceTradeDate({ toDate: () => MARCH }).toISOString()).toBe(MARCH.toISOString());
  });

  it('treats a seconds number and a {seconds} object as an instant, not 1970', () => {
    const seconds = Math.floor(MARCH.getTime() / 1000);
    expect(coerceTradeDate(seconds).toISOString()).toBe(new Date(seconds * 1000).toISOString());
    expect(coerceTradeDate({ seconds, nanoseconds: 0 }).toISOString()).toBe(new Date(seconds * 1000).toISOString());
    expect(coerceTradeDate({ _seconds: seconds }).toISOString()).toBe(new Date(seconds * 1000).toISOString());
  });

  it('rejects empty, zero, and epoch values', () => {
    expect(coerceTradeDate(null)).toBeNull();
    expect(coerceTradeDate(undefined)).toBeNull();
    expect(coerceTradeDate(0)).toBeNull();
    expect(coerceTradeDate('')).toBeNull();
    expect(coerceTradeDate(new Date(0))).toBeNull();
  });
});

describe('trade share dates', () => {
  it('uses the real entry when entryDate is 0 and the first fill has the date', () => {
    const trade = {
      entryDate: 0,
      exitDate: APRIL,
      entries: [{ price: 100, date: MARCH }],
    };
    expect(tradeEntryDate(trade).toISOString()).toBe(MARCH.toISOString());
    expect(tradeExitDate(trade).toISOString()).toBe(APRIL.toISOString());
  });

  it('falls back to createdAt when the entry field is empty', () => {
    const trade = { entryDate: null, exitDate: { seconds: Math.floor(APRIL.getTime() / 1000) }, createdAt: MARCH };
    expect(tradeEntryDate(trade).toISOString()).toBe(MARCH.toISOString());
    expect(tradeExitDate(trade).getTime()).toBe(Math.floor(APRIL.getTime() / 1000) * 1000);
  });
});
