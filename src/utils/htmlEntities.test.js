import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './htmlEntities';

describe('decodeHtmlEntities', () => {
  it('decodes the numeric apostrophe that shows up in news titles', () => {
    expect(decodeHtmlEntities('Bitcoin&#8217;s rally')).toBe('Bitcoin\u2019s rally');
    expect(decodeHtmlEntities('Bitcoin&#x2019;s rally')).toBe('Bitcoin\u2019s rally');
    expect(decodeHtmlEntities('Bitcoin&#x2019;s rally')).not.toContain('&#');
  });

  it('decodes named entities, including ones the old amp/quot pass missed', () => {
    expect(decodeHtmlEntities('S&amp;P 500')).toBe('S&P 500');
    expect(decodeHtmlEntities('Bitcoin&rsquo;s week')).toBe('Bitcoin\u2019s week');
    expect(decodeHtmlEntities('&quot;deal&quot;')).toBe('"deal"');
    expect(decodeHtmlEntities('Tom&apos;s note')).toBe("Tom's note");
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b');
    expect(decodeHtmlEntities('up&hellip;')).toBe('up\u2026');
  });

  it('decodes a double-encoded entity', () => {
    expect(decodeHtmlEntities('Bitcoin&amp;#8217;s')).toBe('Bitcoin\u2019s');
  });

  it('leaves an unknown named entity alone and survives junk', () => {
    expect(decodeHtmlEntities('&notanentity;')).toBe('&notanentity;');
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities('plain bitcoin')).toBe('plain bitcoin');
  });
});
