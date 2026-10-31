import { describe, expect, it } from 'vitest';
import { inlineFlagSrc } from './inlineFlags';

describe('inline flag svgs', () => {
  it('inlines forex and index flags so the icon does not wait on a file fetch', () => {
    const src = inlineFlagSrc('EURUSD');
    expect(src.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
    const local = svg.replace('http://www.w3.org/2000/svg', '');
    expect(svg).toContain('id="base"');
    expect(svg).toContain('id="quote"');
    expect(local).not.toMatch(/https?:/i);
    expect(svg).not.toMatch(/<image|href=/i);

    expect(inlineFlagSrc('eur/usd')).toBe(src);
    expect(inlineFlagSrc('US30')).toBe(inlineFlagSrc('NAS100'));
    expect(inlineFlagSrc('US500')).toBe(inlineFlagSrc('US100'));
    expect(inlineFlagSrc('US30').startsWith('data:image/svg+xml,')).toBe(true);
    expect(inlineFlagSrc('XAUUSD')).toBe('');
    expect(inlineFlagSrc('BTCUSDT')).toBe('');
    expect(inlineFlagSrc('EURUSD.R')).toBe('');
  });
});
