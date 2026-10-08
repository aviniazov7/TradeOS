import { describe, it, expect } from 'vitest';
import {
  CHART_LAYOUTS, DEFAULT_LAYOUT_ID, getLayout, resolveLayoutId, paneCount, gridTemplateAreas, areaRects,
  layoutDividers, defaultSizes, minFraction, normalizeSizes, resizeTracks, trackOffset, gridTemplate,
  sizesForLayout, panesForLayout, symbolFromInput, symbolLabel,
} from './terminalLayout';
import { TIMEFRAMES } from './terminal';

const sum = (a) => a.reduce((x, y) => x + y, 0);

describe('layout definitions', () => {
  it('every layout is well-formed', () => {
    const tfIds = TIMEFRAMES.map((t) => t.id);
    for (const l of CHART_LAYOUTS) {
      const n = paneCount(l);
      expect(l.tfs).toHaveLength(n);
      l.tfs.forEach((tf) => expect(tfIds).toContain(tf));
      const rects = areaRects(l); // throws on a non-rectangular area
      expect(rects.map((r) => r.index)).toEqual([...Array(n).keys()]);
      l.areas.forEach((row) => expect(row).toHaveLength(l.areas[0].length));
      const d = defaultSizes(l);
      expect(sum(d.cols)).toBeCloseTo(1);
      expect(sum(d.rows)).toBeCloseTo(1);
    }
  });

  it('covers the requested layouts', () => {
    expect(CHART_LAYOUTS.map((l) => [l.id, paneCount(l)])).toEqual([
      ['1', 1], ['2v', 2], ['2h', 2], ['3l', 3], ['3r', 3], ['3c', 3], ['4', 4], ['1+3', 4],
    ]);
  });

  it('getLayout / resolveLayoutId fall back and migrate the old 1/2/4 toggle', () => {
    expect(getLayout('nope').id).toBe(DEFAULT_LAYOUT_ID);
    expect(resolveLayoutId('3r', '4')).toBe('3r');
    expect(resolveLayoutId(null, '2')).toBe('2v');
    expect(resolveLayoutId(null, '4')).toBe('4');
    expect(resolveLayoutId(null, '1')).toBe('1');
    expect(resolveLayoutId('x', null)).toBe(DEFAULT_LAYOUT_ID);
  });

  it('builds grid-template-areas', () => {
    expect(gridTemplateAreas(getLayout('3l'))).toBe('"a b" "a c"');
    expect(gridTemplateAreas(getLayout('1+3'))).toBe('"a a a" "b c d"');
  });

  it('areaRects finds spans and rejects L-shapes', () => {
    expect(areaRects(getLayout('3r'))).toEqual([
      { index: 0, area: 'a', col: 1, row: 0, colSpan: 1, rowSpan: 2 },
      { index: 1, area: 'b', col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { index: 2, area: 'c', col: 0, row: 1, colSpan: 1, rowSpan: 1 },
    ]);
    expect(() => areaRects({ areas: [['a', 'a'], ['a', 'b']] })).toThrow();
  });
});

describe('layoutDividers', () => {
  it('2×2 has one shared full-length divider per boundary', () => {
    expect(layoutDividers(getLayout('4'))).toEqual([
      { axis: 'x', index: 0, start: 0, end: 2 },
      { axis: 'y', index: 0, start: 0, end: 2 },
    ]);
  });
  it('next to a spanning pane the divider covers only the split side', () => {
    expect(layoutDividers(getLayout('3l'))).toEqual([
      { axis: 'x', index: 0, start: 0, end: 2 },
      { axis: 'y', index: 0, start: 1, end: 2 },
    ]);
    expect(layoutDividers(getLayout('1+3'))).toEqual([
      { axis: 'x', index: 0, start: 1, end: 2 },
      { axis: 'x', index: 1, start: 1, end: 2 },
      { axis: 'y', index: 0, start: 0, end: 3 },
    ]);
  });
  it('one pane has none; columns have n-1', () => {
    expect(layoutDividers(getLayout('1'))).toEqual([]);
    expect(layoutDividers(getLayout('3c')).map((d) => d.index)).toEqual([0, 1]);
  });
});

describe('sizes', () => {
  it('minFraction is px-based but bounded', () => {
    expect(minFraction(200, 1000, 2)).toBeCloseTo(0.2);
    expect(minFraction(10, 1000, 2)).toBe(0.05);
    expect(minFraction(900, 1000, 3)).toBeCloseTo(1 / 3);
    expect(minFraction(200, 1000, 1)).toBe(0);
  });

  it('resizeTracks moves one boundary and clamps both neighbours', () => {
    const r = resizeTracks([0.5, 0.5], 0, 0.1);
    expect(r[0]).toBeCloseTo(0.6);
    expect(r[1]).toBeCloseTo(0.4);
    const clamped = resizeTracks([0.5, 0.5], 0, 0.9, 0.1);
    expect(clamped[0]).toBeCloseTo(0.9);
    expect(clamped[1]).toBeCloseTo(0.1);
    const c = resizeTracks([0.3, 0.3, 0.4], 1, -0.5, 0.1);
    expect(c[0]).toBe(0.3);
    expect(c[1]).toBeCloseTo(0.1);
    expect(c[2]).toBeCloseTo(0.6);
    expect(sum(c)).toBeCloseTo(1);
  });

  it('resizeTracks ignores bad input', () => {
    const s = [0.5, 0.5];
    expect(resizeTracks(s, 1, 0.1)).toBe(s);
    expect(resizeTracks(s, 0, NaN)).toBe(s);
  });

  it('normalizeSizes validates, rescales and lifts tiny tracks', () => {
    const fb = [0.5, 0.5];
    expect(normalizeSizes(null, fb)).toEqual(fb);
    expect(normalizeSizes([1], fb)).toEqual(fb);
    expect(normalizeSizes([0.5, -1], fb)).toEqual(fb);
    expect(normalizeSizes([0.5, NaN], fb)).toEqual(fb);
    const n = normalizeSizes([2, 6], fb);
    expect(n[0]).toBeCloseTo(0.25);
    expect(n[1]).toBeCloseTo(0.75);
    const lifted = normalizeSizes([0.01, 0.99], fb, 0.1);
    expect(lifted[0]).toBeCloseTo(0.1);
    expect(sum(lifted)).toBeCloseTo(1);
  });

  it('trackOffset and gridTemplate', () => {
    expect(trackOffset([0.2, 0.3, 0.5], 1)).toBeCloseTo(0.5);
    expect(gridTemplate([0.25, 0.75])).toBe('0.25fr 0.75fr');
  });

  it('sizesForLayout uses the saved sizes for that layout only', () => {
    const l = getLayout('3l');
    expect(sizesForLayout(l, null)).toEqual(defaultSizes(l));
    expect(sizesForLayout(l, { '3l': { cols: [0.7, 0.3] } }).cols).toEqual([0.7, 0.3]);
    expect(sizesForLayout(l, { '3l': { cols: [0.7, 0.3] } }).rows).toEqual([0.5, 0.5]);
    expect(sizesForLayout(l, { '4': { cols: [0.7, 0.3] } }).cols).toEqual([0.56, 0.44]);
  });
});

describe('panes', () => {
  it('panesForLayout fills defaults and drops bad timeframes', () => {
    const l = getLayout('3l');
    expect(panesForLayout(l, null)).toEqual([
      { tf: '30m', symbol: null }, { tf: 'D', symbol: null }, { tf: '4H', symbol: null },
    ]);
    expect(panesForLayout(l, { '3l': [{ tf: '1m', symbol: ' okx:btcusdt.p ' }, { tf: '7m' }] })).toEqual([
      { tf: '1m', symbol: 'OKX:BTCUSDT.P' }, { tf: 'D', symbol: null }, { tf: '4H', symbol: null },
    ]);
  });

  it('symbolFromInput', () => {
    expect(symbolFromInput('eth', 'bybit')).toBe('BYBIT:ETHUSDT.P');
    expect(symbolFromInput('sol-usdt', 'okx')).toBe('OKX:SOLUSDT.P');
    expect(symbolFromInput('1000pepe', 'bitget')).toBe('BITGET:1000PEPEUSDT.P');
    expect(symbolFromInput('binance:ethusdt', 'bybit')).toBe('BINANCE:ETHUSDT');
    expect(symbolFromInput('tvc:gold', 'bybit')).toBe('TVC:GOLD');
    expect(symbolFromInput('  ', 'bybit')).toBeNull();
    expect(symbolFromInput(':', 'bybit')).toBeNull();
  });

  it('symbolLabel', () => {
    expect(symbolLabel('BYBIT:SOLUSDT.P')).toBe('SOLUSDT');
    expect(symbolLabel('GOLD')).toBe('GOLD');
  });
});
