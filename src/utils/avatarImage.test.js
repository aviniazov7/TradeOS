import { describe, it, expect } from 'vitest';
import { centerSquare } from './avatarImage';

describe('centerSquare', () => {
  it('crops the centre of a landscape image', () => {
    expect(centerSquare(1200, 800)).toEqual({ sx: 200, sy: 0, side: 800 });
  });
  it('crops the centre of a portrait image', () => {
    expect(centerSquare(600, 1000)).toEqual({ sx: 0, sy: 200, side: 600 });
  });
  it('keeps a square image whole', () => {
    expect(centerSquare(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });
});
