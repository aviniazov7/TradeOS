import { describe, it, expect } from 'vitest';
import {
  tradeImageId, tradeImageIds, slotOfImageId, freeTradeImageSlot, defaultImageKind, MAX_TRADE_IMAGES,
} from './tradeImageSlots';

describe('trade image slots', () => {
  it('builds deterministic ids for every slot', () => {
    expect(tradeImageId('T1', 2)).toBe('T1_2');
    expect(tradeImageIds('T1')).toEqual(['T1_0', 'T1_1', 'T1_2', 'T1_3']);
    expect(tradeImageIds('T1')).toHaveLength(MAX_TRADE_IMAGES);
  });

  it('parses the slot back out of an id', () => {
    expect(slotOfImageId('T1_0', 'T1')).toBe(0);
    expect(slotOfImageId('T1_3', 'T1')).toBe(3);
    expect(slotOfImageId('T1_4', 'T1')).toBe(-1);
    expect(slotOfImageId('T2_1', 'T1')).toBe(-1);
    expect(slotOfImageId('T1_x', 'T1')).toBe(-1);
    expect(slotOfImageId(undefined, 'T1')).toBe(-1);
  });

  it('finds the lowest free slot, filling gaps left by deletes', () => {
    expect(freeTradeImageSlot([], 'T1')).toBe(0);
    expect(freeTradeImageSlot([{ id: 'T1_0' }, { id: 'T1_2' }], 'T1')).toBe(1);
    expect(freeTradeImageSlot([{ id: 'T1_0' }, { id: 'T1_1' }, { id: 'T1_2' }, { id: 'T1_3' }], 'T1')).toBe(-1);
  });

  it('pre-selects before → after → other', () => {
    expect(defaultImageKind([])).toBe('before');
    expect(defaultImageKind([{ kind: 'before' }])).toBe('after');
    expect(defaultImageKind([{ kind: 'after' }])).toBe('before');
    expect(defaultImageKind([{ kind: 'before' }, { kind: 'after' }])).toBe('other');
  });
});
