import { describe, it, expect } from 'vitest';
import {
  fitWithin, dataUrlBytes, buildCompressionPlan, isImageDataUrl,
  DEFAULT_MAX_DIM, MIN_DIM,
} from './imageCompress';

describe('fitWithin', () => {
  it('scales a landscape image so the width hits maxDim', () => {
    expect(fitWithin(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 });
  });
  it('scales a portrait image so the height hits maxDim', () => {
    expect(fitWithin(1170, 2532, 1600)).toEqual({ width: 739, height: 1600 });
  });
  it('never upscales a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('keeps extreme aspect ratios at least 1px', () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
  it('returns 0×0 for invalid sizes', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 100)).toEqual({ width: 0, height: 0 });
  });
  it('defaults to DEFAULT_MAX_DIM', () => {
    expect(fitWithin(4000, 1000).width).toBe(DEFAULT_MAX_DIM);
  });
});

describe('dataUrlBytes', () => {
  it('decodes base64 length with padding', () => {
    // "abc" → YWJj (no padding), "ab" → YWI= , "a" → YQ==
    expect(dataUrlBytes('data:image/png;base64,YWJj')).toBe(3);
    expect(dataUrlBytes('data:image/png;base64,YWI=')).toBe(2);
    expect(dataUrlBytes('data:image/png;base64,YQ==')).toBe(1);
  });
  it('is 0 for non-data-URLs', () => {
    expect(dataUrlBytes('nope')).toBe(0);
    expect(dataUrlBytes(null)).toBe(0);
  });
});

describe('buildCompressionPlan', () => {
  it('starts at the fitted size and the requested quality', () => {
    const plan = buildCompressionPlan(3200, 1800);
    expect(plan[0]).toEqual({ width: 1600, height: 900, quality: 0.8 });
  });
  it('steps quality down before shrinking dimensions', () => {
    const plan = buildCompressionPlan(3200, 1800);
    expect(plan.slice(0, 4).map((p) => p.quality)).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(plan.slice(0, 4).every((p) => p.width === 1600)).toBe(true);
    expect(plan[4]).toEqual({ width: 1280, height: 720, quality: 0.8 });
  });
  it('never goes below MIN_DIM on the longest side', () => {
    const plan = buildCompressionPlan(3200, 1800);
    const smallest = Math.min(...plan.map((p) => Math.max(p.width, p.height)));
    expect(smallest).toBeGreaterThanOrEqual(MIN_DIM);
  });
  it('dimensions are monotonically non-increasing', () => {
    const plan = buildCompressionPlan(2532, 1170);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].width).toBeLessThanOrEqual(plan[i - 1].width);
    }
  });
  it('tries a tiny image at its own size only', () => {
    const plan = buildCompressionPlan(300, 200);
    expect(plan.every((p) => p.width === 300 && p.height === 200)).toBe(true);
    expect(plan).toHaveLength(4);
  });
  it('does not duplicate a quality lower than the ladder', () => {
    const plan = buildCompressionPlan(800, 600, { quality: 0.55 });
    expect(plan.slice(0, 2).map((p) => p.quality)).toEqual([0.55, 0.5]);
  });
  it('returns an empty plan for invalid input', () => {
    expect(buildCompressionPlan(0, 0)).toEqual([]);
  });
});

describe('isImageDataUrl', () => {
  it('accepts webp/jpeg/png base64 data URLs', () => {
    expect(isImageDataUrl('data:image/webp;base64,AAAA')).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isImageDataUrl('data:image/png;base64,AAAA')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isImageDataUrl('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isImageDataUrl('https://x/y.png')).toBe(false);
    expect(isImageDataUrl(undefined)).toBe(false);
  });
});
