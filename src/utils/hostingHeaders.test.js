import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guards the Content-Security-Policy that Firebase Hosting sends (firebase.json).
// public/_headers is NOT read by Firebase Hosting — only these headers ship.
const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../firebase.json', import.meta.url)), 'utf8'));
const globalHeaders = config.hosting.headers.find((h) => h.source === '**').headers;
const header = (key) => globalHeaders.find((h) => h.key === key)?.value;

function directives(policy) {
  const out = {};
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

describe('hosting CSP (report-only)', () => {
  const policy = header('Content-Security-Policy-Report-Only');
  const d = policy ? directives(policy) : {};

  it('is present', () => {
    expect(policy).toBeTruthy();
  });

  it('allows no inline or eval script', () => {
    expect(d['script-src']).toBeDefined();
    expect(d['script-src']).not.toContain("'unsafe-inline'");
    expect(d['script-src']).not.toContain("'unsafe-eval'");
  });

  it('keeps the framing / plugin / base lockdown', () => {
    expect(d['frame-ancestors']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
  });

  it('lets the app reach its backends', () => {
    for (const origin of [
      'https://trade-os.tradeos.workers.dev', // the Worker (AI, exchanges, quotes)
      'https://*.googleapis.com', // Firestore / Auth / Storage
      'https://api.bybit.com', // market data + ticker fallback
      'wss://stream.bybit.com', // liquidations stream
      'wss://ws-live-data.polymarket.com',
    ]) {
      expect(d['connect-src']).toContain(origin);
    }
  });

  it('allows blob: workers (share-card image export runs in one) but no other worker source', () => {
    expect(d['worker-src']).toEqual(["'self'", 'blob:']);
  });

  it('reports violations to the Worker, in both the legacy and the Reporting API way', () => {
    expect(d['report-uri']).toEqual(['https://trade-os.tradeos.workers.dev/csp-report']);
    expect(d['report-to']).toEqual(['csp-endpoint']);
    expect(header('Reporting-Endpoints')).toBe('csp-endpoint="https://trade-os.tradeos.workers.dev/csp-report"');
  });

  it('lets the TradingView charts and Google sign-in frames load', () => {
    for (const origin of ['https://www.tradingview.com', 'https://s.tradingview.com', 'https://accounts.google.com']) {
      expect(d['frame-src']).toContain(origin);
    }
  });
});

describe('hosting CSP (enforced)', () => {
  it('still enforces the framing lockdown while the full policy is report-only', () => {
    const enforced = directives(header('Content-Security-Policy'));
    expect(enforced['frame-ancestors']).toEqual(["'self'"]);
    expect(enforced['object-src']).toEqual(["'none'"]);
  });
});

describe('hosting cache headers', () => {
  const sources = config.hosting.headers.map((h) => h.source);
  const cacheOf = (source) => config.hosting.headers
    .find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value;

  it('caches images and self-hosted fonts for a week', () => {
    expect(cacheOf('**/*.@(png|jpg|jpeg|gif|svg|ico|webp|woff2)')).toBe('public, max-age=604800');
  });

  it('keeps hashed build assets immutable and the HTML document uncached', () => {
    const week = sources.indexOf('**/*.@(png|jpg|jpeg|gif|svg|ico|webp|woff2)');
    const assets = sources.indexOf('/assets/**');
    const index = sources.indexOf('/index.html');
    expect(week).toBeGreaterThan(-1);
    expect(assets).toBeGreaterThan(week);
    expect(index).toBeGreaterThan(assets);
    expect(cacheOf('**')).toBe('no-cache');
    expect(cacheOf('/assets/**')).toBe('public, max-age=31536000, immutable');
    expect(cacheOf('/index.html')).toBe('no-cache');
  });
});

describe('login document', () => {
  const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

  it('does not load a render-blocking Google Fonts stylesheet', () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });

  it('self-hosts Heebo with font-display: swap', () => {
    const css = readFileSync(fileURLToPath(new URL('../../node_modules/@fontsource/heebo/hebrew-400.css', import.meta.url)), 'utf8');
    expect(css).toMatch(/font-display:\s*swap/);
    expect(css).toMatch(/\.woff2/);
  });
});

describe('robots.txt / sitemap.xml', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(`../../public/${p}`, import.meta.url)), 'utf8');
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');

  it('keeps the signed-in app out of search and points at the sitemap', () => {
    expect(robots).toMatch(/^Disallow: \/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/tradeos-91a58\.web\.app\/sitemap\.xml$/m);
  });

  it('lists only pages robots.txt allows', () => {
    const allowed = [...robots.matchAll(/^Allow: (\S+)$/gm)].map((m) => m[1].replace(/\$$/, ''));
    const locs = [...sitemap.matchAll(/<loc>https:\/\/tradeos-91a58\.web\.app(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(allowed).toContain(loc);
  });
});
