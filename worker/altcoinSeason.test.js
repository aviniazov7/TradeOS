import { describe, expect, it } from 'vitest';
import { parseAltcoinSeasonIndex } from './altcoinSeason';

describe('parseAltcoinSeasonIndex', () => {
  it('reads the latest value from the escaped page payload', () => {
    const html = 'prefix \\"90\\":{\\"2026-10-01\\":\\"40\\",\\"2026-10-29\\":\\"62\\"},\\"other\\":1';
    expect(parseAltcoinSeasonIndex(html)).toBe(62);
  });

  it('reads a raw JSON object and rejects a value outside 0-100', () => {
    expect(parseAltcoinSeasonIndex('"90":{"2026-01-01":"15"},"x"')).toBe(15);
    expect(parseAltcoinSeasonIndex('"90":{"2026-01-01":"140"},"x"')).toBeNull();
    expect(parseAltcoinSeasonIndex('<html></html>')).toBeNull();
  });
});
