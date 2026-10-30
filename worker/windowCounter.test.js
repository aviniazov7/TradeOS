import { describe, expect, it } from 'vitest';
import { advanceWindow } from './windowCounter';

describe('advanceWindow', () => {
  it('starts at 1 and increments inside the window', () => {
    const first = advanceWindow(null, 1_000, 60_000);
    expect(first).toEqual({ start: 1_000, count: 1 });
    const second = advanceWindow(first, 2_000, 60_000);
    expect(second).toEqual({ start: 1_000, count: 2 });
  });

  it('resets after the window', () => {
    const first = advanceWindow(null, 1_000, 60_000);
    expect(advanceWindow(first, 61_000, 60_000)).toEqual({ start: 61_000, count: 1 });
  });
});
