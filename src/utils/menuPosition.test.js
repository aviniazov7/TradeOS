import { describe, expect, it } from 'vitest';
import { anchoredMenuBox } from './menuPosition';

describe('anchoredMenuBox', () => {
  it('aligns to the trigger right edge and stays inside a phone viewport', () => {
    const box = anchoredMenuBox({ right: 200, bottom: 100 }, 390, 288, 8);
    expect(box.left).toBe(8);
    expect(box.top).toBe(106);
    expect(box.width).toBeLessThanOrEqual(390 - 16);
    expect(box.left + box.width).toBeLessThanOrEqual(390 - 8);
    expect(box.left).toBeGreaterThanOrEqual(8);
  });

  it('keeps the right edges together when the viewport is wide', () => {
    const box = anchoredMenuBox({ right: 800, bottom: 40 }, 1200, 288, 8);
    expect(box.left).toBe(800 - 288);
    expect(box.width).toBe(288);
  });
});
