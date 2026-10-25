import { describe, expect, it } from 'vitest';
import { chartDrawProps } from './chartMotion';
import { isTickerValue } from './tickerValue';

describe('chart draw-in', () => {
  it('draws the line unless motion is reduced', () => {
    expect(chartDrawProps(false)).toMatchObject({ isAnimationActive: true, animationDuration: 900 });
    expect(chartDrawProps(true)).toEqual({ isAnimationActive: false });
  });
});

describe('number ticker values', () => {
  it('rolls money and percents, and leaves Hebrew words alone', () => {
    expect(isTickerValue('+$1,234.56')).toBe(true);
    expect(isTickerValue('62.5%')).toBe(true);
    expect(isTickerValue('1.20K')).toBe(true);
    expect(isTickerValue('—')).toBe(true);
    expect(isTickerValue('••••')).toBe(true);
    expect(isTickerValue('אין עדיין')).toBe(false);
    expect(isTickerValue('רווח אחד')).toBe(false);
  });
});
