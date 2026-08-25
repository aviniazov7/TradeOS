import { describe, it, expect } from 'vitest';
import { timeAgoEn, sideLabelEn, fmtSharesEn } from './polymarketLabels';

const nowSec = () => Math.floor(Date.now() / 1000);

describe('timeAgoEn', () => {
  it('scales the unit with the gap', () => {
    expect(timeAgoEn(nowSec())).toBe('now');
    expect(timeAgoEn(nowSec() - 300)).toBe('5m ago');
    expect(timeAgoEn(nowSec() - 3 * 3600)).toBe('3h ago');
    expect(timeAgoEn(nowSec() - 2 * 86400)).toBe('2d ago');
  });
  it('clamps a future timestamp to "now" instead of a negative age', () => {
    expect(timeAgoEn(nowSec() + 3600)).toBe('now');
  });
  it('is empty when there is no timestamp', () => {
    expect(timeAgoEn(0)).toBe('');
    expect(timeAgoEn(null)).toBe('');
  });
});

describe('sideLabelEn', () => {
  it('passes BUY and SELL through', () => {
    expect(sideLabelEn('BUY')).toBe('BUY');
    expect(sideLabelEn('SELL')).toBe('SELL');
  });
  it('falls back to the raw activity type for anything else', () => {
    expect(sideLabelEn(null, 'REDEEM')).toBe('REDEEM');
    expect(sideLabelEn('OTHER', 'SPLIT')).toBe('SPLIT');
  });
  it('shows an em-dash when neither is known', () => {
    expect(sideLabelEn(null, null)).toBe('—');
  });
});

describe('fmtSharesEn', () => {
  it('abbreviates by magnitude', () => {
    expect(fmtSharesEn(1_600_000)).toBe('1.6M');
    expect(fmtSharesEn(2_500)).toBe('2.5K');
    expect(fmtSharesEn(42)).toBe('42');
  });
  it('reports magnitude, so a negative count is not shown as negative shares', () => {
    expect(fmtSharesEn(-1_600_000)).toBe('1.6M');
  });
  it('treats junk as zero', () => {
    expect(fmtSharesEn(null)).toBe('0');
    expect(fmtSharesEn('abc')).toBe('0');
  });
});
