import { describe, it, expect } from 'vitest';
import { trBucketKey, mergeTrBucket, lookupTr } from './newsTranslateCache';

describe('news translation buckets', () => {
  it('keys one bucket per day', () => {
    expect(trBucketKey('2026-10-07')).toBe('news:trb:2026-10-07');
  });
  it('merges additions, newest value wins', () => {
    const b = mergeTrBucket({ a: { title: 'A' }, b: { title: 'B' } }, { b: { title: 'B2' }, c: { title: 'C' } });
    expect(b).toEqual({ a: { title: 'A' }, b: { title: 'B2' }, c: { title: 'C' } });
  });
  it('caps the bucket, dropping the oldest entries', () => {
    const b = mergeTrBucket({ a: 1, b: 2, c: 3 }, { d: 4 }, 3);
    expect(Object.keys(b)).toEqual(['b', 'c', 'd']);
  });
  it('tolerates a missing/corrupt stored bucket', () => {
    expect(mergeTrBucket(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeTrBucket([1, 2], { a: 1 })).toEqual({ a: 1 });
  });
  it('looks up newest bucket first, own properties only', () => {
    const today = { h1: { title: 'today' } };
    const yesterday = { h1: { title: 'old' }, h2: { title: 'y' } };
    expect(lookupTr([today, yesterday], 'h1')).toEqual({ title: 'today' });
    expect(lookupTr([today, yesterday], 'h2')).toEqual({ title: 'y' });
    expect(lookupTr([today, yesterday], 'constructor')).toBeNull();
    expect(lookupTr([{}, null], 'x')).toBeNull();
  });
});
