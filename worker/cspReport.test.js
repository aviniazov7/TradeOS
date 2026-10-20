import { describe, it, expect } from 'vitest';
import { parseCspReports, cspReportKey, MAX_REPORT_ITEMS } from './cspReport';

describe('parseCspReports', () => {
  it('reads the legacy report-uri format and keeps only the origin and the path', () => {
    const [r] = parseCspReports({ 'csp-report': {
      'document-uri': 'https://tradeos-app.web.app/journal?token=secret#x',
      'effective-directive': 'img-src',
      'blocked-uri': 'https://cdn.example.com/a/b/logo.png?user=123',
      disposition: 'report',
    } });
    expect(r).toEqual({ directive: 'img-src', blocked: 'https://cdn.example.com', page: '/journal', disposition: 'report' });
    expect(JSON.stringify(r)).not.toMatch(/secret|user=123|logo\.png/);
  });

  it('reads the Reporting API format', () => {
    const out = parseCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://x.web.app/market', effectiveDirective: 'script-src-elem', blockedURL: 'inline', disposition: 'enforce' } },
      { type: 'deprecation', body: {} },
    ]);
    expect(out).toEqual([{ directive: 'script-src-elem', blocked: 'inline', page: '/market', disposition: 'enforce' }]);
  });

  it('falls back to violated-directive and takes the first token', () => {
    const [r] = parseCspReports({ 'csp-report': { 'violated-directive': "worker-src 'self'", 'blocked-uri': 'blob', 'document-uri': 'https://x/y' } });
    expect(r.directive).toBe('worker-src');
    expect(r.blocked).toBe('blob');
  });

  it('drops junk: unknown shapes, bad directives, missing fields', () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports('x')).toEqual([]);
    expect(parseCspReports({})).toEqual([]);
    expect(parseCspReports({ 'csp-report': { 'effective-directive': '<script>alert(1)</script>' } })).toEqual([]);
    expect(parseCspReports({ 'csp-report': { 'effective-directive': 'img-src' } })[0]).toMatchObject({ blocked: 'unknown', page: 'unknown' });
  });

  it('caps one request at MAX_REPORT_ITEMS', () => {
    const many = Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://a.example', documentURL: 'https://x/p' } }));
    expect(parseCspReports(many)).toHaveLength(MAX_REPORT_ITEMS);
  });
});

describe('cspReportKey', () => {
  it('is the same for the same violation and differs otherwise', () => {
    const a = { directive: 'img-src', blocked: 'https://a.example', page: '/p' };
    expect(cspReportKey(a)).toBe(cspReportKey({ ...a }));
    expect(cspReportKey(a)).not.toBe(cspReportKey({ ...a, page: '/q' }));
  });
});
