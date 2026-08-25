import { describe, it, expect } from 'vitest';
import { tradeExternalIds } from './tradeIds';

// The primitive the exchange-sync upsert matches on. Two rows describe the same
// position when these sets overlap; miss an id and a close imports as a
// duplicate trade instead of updating the one it belongs to.

describe('tradeExternalIds', () => {
  it('reads the scalar id older documents carry', () => {
    expect(tradeExternalIds({ externalId: 'a' })).toEqual(['a']);
  });

  it('reads the array a merged multi-TP row carries', () => {
    expect(tradeExternalIds({ externalIds: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('returns BOTH when a document has each — the scalar first', () => {
    // A position that closed across two syncs holds the first sync's id
    // alongside the new closes'.
    expect(tradeExternalIds({ externalId: 'first', externalIds: ['second', 'third'] }))
      .toEqual(['first', 'second', 'third']);
  });

  it('does not repeat an id present in both places', () => {
    expect(tradeExternalIds({ externalId: 'a', externalIds: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('drops empty entries rather than matching on a falsy id', () => {
    // An empty id would overlap with every other empty id and merge unrelated trades.
    expect(tradeExternalIds({ externalId: '', externalIds: ['', null, undefined, 'real'] }))
      .toEqual(['real']);
  });

  it('is empty for a manually entered trade or no trade at all', () => {
    expect(tradeExternalIds({})).toEqual([]);
    expect(tradeExternalIds(null)).toEqual([]);
    expect(tradeExternalIds({ externalIds: 'not-an-array' })).toEqual([]);
  });
});
