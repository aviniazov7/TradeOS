import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from './urls';

// Every href and img src that came from user input or a third-party feed passes
// through here. React renders a javascript: href as-is — it only logs a warning
// — and <input type="url"> accepts one happily.

describe('safeHttpUrl', () => {
  it('accepts plain http and https, trimming surrounding whitespace', () => {
    expect(safeHttpUrl('https://tradingview.com/x')).toBe('https://tradingview.com/x');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com');
    expect(safeHttpUrl('  https://example.com  ')).toBe('https://example.com');
    expect(safeHttpUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('rejects every scheme that can execute or smuggle content', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/abc',
    ]) {
      expect(safeHttpUrl(bad)).toBe(null);
    }
  });

  it('rejects a scheme hidden behind leading whitespace', () => {
    expect(safeHttpUrl('  javascript:alert(1)')).toBe(null);
    expect(safeHttpUrl('\n\tjavascript:alert(1)')).toBe(null);
  });

  it('rejects protocol-relative and bare paths — it must be an absolute http(s) URL', () => {
    expect(safeHttpUrl('//evil.com')).toBe(null);
    expect(safeHttpUrl('/journal')).toBe(null);
    expect(safeHttpUrl('example.com')).toBe(null);
  });

  it('rejects anything that is not a string', () => {
    for (const v of [null, undefined, 42, {}, ['https://x.com']]) {
      expect(safeHttpUrl(v)).toBe(null);
    }
  });
});
