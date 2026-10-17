import { describe, it, expect } from 'vitest';
import {
  conclusionsReady,
  directionLabelHe,
  hebrewDirections,
  isStrongConclusion,
  softenCoachReport,
  profitFactorLabel,
  MIN_CONCLUSION_TRADES,
  NOT_ENOUGH_DATA_NOTE,
} from './coachCopy';

describe('coach sample gate', () => {
  it('withholds grades until 5 closed trades', () => {
    expect(conclusionsReady(MIN_CONCLUSION_TRADES - 1)).toBe(false);
    expect(conclusionsReady(MIN_CONCLUSION_TRADES)).toBe(true);
    expect(profitFactorLabel(3, 1)).toBe('אין מספיק נתונים');
    expect(profitFactorLabel(3, 5)).toBe('מצוין');
    expect(profitFactorLabel(1.2, 6)).toBe('תקין');
    expect(profitFactorLabel(0.4, 8)).toBe('לשיפור');
  });

  it('translates long/short, including the bar label "short · 1"', () => {
    expect(directionLabelHe('short')).toBe('שורט');
    expect(directionLabelHe('long')).toBe('לונג');
    expect(directionLabelHe('שורט')).toBe('שורט');
    expect(directionLabelHe('BTCUSDT')).toBe('BTCUSDT');
    expect(hebrewDirections('short · 1')).toBe('שורט · 1');
    expect(hebrewDirections('Long bias')).toBe('לונג bias');
  });

  it('drops stop-trading and excellent lines on a thin sample', () => {
    const report = [
      '**חוזקות**',
      '• עסקה אחת ברווח',
      '**המלצות לפעולה**',
      '• הפסק לסחור BTC אחרי ההפסד',
      '• stop trading ETH',
      '• הביצוע מצוין',
      '• excellent week',
      '• תמשיך לתעד',
    ].join('\n');
    const soft = softenCoachReport(report, 1);
    expect(soft).not.toMatch(/הפסק לסחור/);
    expect(soft).not.toMatch(/stop trading/i);
    expect(soft).not.toMatch(/מצוין/);
    expect(soft).not.toMatch(/excellent/i);
    expect(soft).toContain('**המלצות לפעולה**');
    expect(soft).toContain('תמשיך לתעד');
    expect(isStrongConclusion('הפסק לסחור BTC')).toBe(true);
    expect(softenCoachReport(report, 5)).toBe(report);
  });

  it('names the thin-sample note', () => {
    expect(NOT_ENOUGH_DATA_NOTE).toContain('אין מספיק נתונים');
    expect(NOT_ENOUGH_DATA_NOTE).toContain('5');
  });
});
