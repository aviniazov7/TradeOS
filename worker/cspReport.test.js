import { describe, it, expect } from 'vitest';
import { parseCspReports, cspReportKey, handleCspReport, MAX_REPORT_ITEMS } from './cspReport';

describe('parseCspReports', () => {
  it('reads the legacy report-uri format and keeps only the origin and the path', () => {
    const [r] = parseCspReports({ 'csp-report': {
      'document-uri': 'https://tradeoslive.web.app/journal?token=secret#x',
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

function postReport(body, contentType) {
  return new Request('https://trade-os.tradeos.workers.dev/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': contentType, Origin: 'https://tradeoslive.web.app' },
    body,
  });
}

const legacyBody = JSON.stringify({ 'csp-report': {
  'document-uri': 'https://tradeoslive.web.app/journal?token=secret',
  'effective-directive': 'img-src',
  'blocked-uri': 'https://cdn.example.com/a.png?user=1',
  disposition: 'report',
} });

describe('handleCspReport', () => {
  it('answers the Reporting API preflight with a wildcard CORS header', async () => {
    const res = await handleCspReport(new Request('https://trade-os.tradeos.workers.dev/csp-report', {
      method: 'OPTIONS',
      headers: {
        Origin: 'null',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers').toLowerCase()).toContain('content-type');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('logs a legacy application/csp-report and a Reporting API batch, without the raw URL', async () => {
    const lines = [];
    const legacy = await handleCspReport(postReport(legacyBody, 'application/csp-report; charset=utf-8'), { log: (m) => lines.push(m) });
    const batch = await handleCspReport(postReport(JSON.stringify([
      { type: 'csp-violation', body: { documentURL: 'https://tradeoslive.web.app/market', effectiveDirective: 'script-src-elem', blockedURL: 'inline', disposition: 'report' } },
    ]), 'application/reports+json'), { log: (m) => lines.push(m) });
    expect(legacy.status).toBe(204);
    expect(batch.status).toBe(204);
    expect(legacy.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(lines[0]).toMatch(/^CSP report /);
    expect(lines[0]).toContain('"directive":"img-src"');
    expect(lines[0]).not.toMatch(/secret|user=1/);
    expect(lines[1]).toContain('"directive":"script-src-elem"');
    expect(lines[1]).toContain('"blocked":"inline"');
  });

  it('still logs when the dedupe cache throws, and skips a violation already cached', async () => {
    const lines = [];
    const broken = {
      match: async () => { throw new Error('cache down'); },
      put: async () => { throw new Error('cache down'); },
    };
    const res = await handleCspReport(postReport(legacyBody, 'application/csp-report'), { cache: broken, log: (m) => lines.push(m) });
    expect(res.status).toBe(204);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('CSP report');

    const lines2 = [];
    const warm = { match: async () => new Response('1'), put: async () => { throw new Error('should not store'); } };
    await handleCspReport(postReport(legacyBody, 'application/csp-report'), { cache: warm, log: (m) => lines2.push(m) });
    expect(lines2).toEqual([]);
  });

  it('logs a recognised body it could not parse, and ignores other content types', async () => {
    const lines = [];
    await handleCspReport(postReport('not-json', 'application/reports+json'), { log: (m) => lines.push(m) });
    await handleCspReport(postReport('{}', 'application/csp-report'), { log: (m) => lines.push(m) });
    await handleCspReport(postReport('not-json', 'text/plain'), { log: (m) => lines.push(m) });
    expect(lines).toEqual([
      'CSP report unparsed {"contentType":"application/reports+json","bytes":8}',
      'CSP report unparsed {"contentType":"application/csp-report","bytes":2}',
    ]);
  });
});
