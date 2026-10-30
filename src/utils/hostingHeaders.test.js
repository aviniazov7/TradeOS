import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_URL } from '../../worker/emailTheme.js';

// Guards the Content-Security-Policy that Firebase Hosting sends (firebase.json).
// public/_headers is NOT read by Firebase Hosting — only these headers ship.
const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../firebase.json', import.meta.url)), 'utf8'));
const firebaserc = JSON.parse(readFileSync(fileURLToPath(new URL('../../.firebaserc', import.meta.url)), 'utf8'));
const sites = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
const appHosting = sites.find((h) => h.target === 'app');
const globalHeaders = appHosting.headers.find((h) => h.source === '**').headers;
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

  it('allows the auth handler on the live site', () => {
    for (const origin of [
      'https://tradeoslive.web.app',
      'https://tradeoslive.firebaseapp.com',
    ]) {
      expect(d['frame-src']).toContain(origin);
    }
    expect(d['frame-src'].join(' ')).not.toMatch(/tradeos-91a58\.(web|firebaseapp)\.com/);
    // The Auth SDK can still call the project's default firebaseapp.com host.
    expect(d['connect-src']).toContain('https://*.firebaseapp.com');
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
  const sources = appHosting.headers.map((h) => h.source);
  const cacheOf = (source) => appHosting.headers
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

describe('hosting targets', () => {
  it('deploys the app to tradeoslive and has no legacy site', () => {
    expect(firebaserc.projects.default).toBe('tradeos-91a58');
    expect(firebaserc.targets['tradeos-91a58'].hosting.app).toEqual(['tradeoslive']);
    expect(firebaserc.targets['tradeos-91a58'].hosting.legacy).toBeUndefined();
    expect(sites.map((h) => h.target)).toEqual(['app']);
    expect(appHosting.public).toBe('dist/client');
    expect(appHosting.rewrites).toEqual([{ source: '!/__/auth{,/**}', destination: '/index.html' }]);
    expect(appHosting.rewrites.some((rule) => rule.source === '**' || rule.source === '/__/auth/**')).toBe(false);
    expect(APP_URL).toBe('https://tradeoslive.web.app');
  });
});

describe('robots.txt / sitemap.xml', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(`../../public/${p}`, import.meta.url)), 'utf8');
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');

  it('keeps the signed-in app out of search and points at the sitemap', () => {
    expect(robots).toMatch(/^Disallow: \/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/tradeoslive\.web\.app\/sitemap\.xml$/m);
  });

  it('lists only pages robots.txt allows', () => {
    const allowed = [...robots.matchAll(/^Allow: (\S+)$/gm)].map((m) => m[1].replace(/\$$/, ''));
    const locs = [...sitemap.matchAll(/<loc>https:\/\/tradeoslive\.web\.app(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(allowed).toContain(loc);
  });
});

describe('auth domain and public site URL', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');

  it('uses tradeoslive as authDomain so the Google screen matches the site', () => {
    const firebase = read('src/services/firebase.js');
    const envExample = read('.env.example');
    const spec = read('TradeOS-Full-Spec.md');
    const deploy = read('.github/workflows/deploy.yml');
    expect(firebase).toMatch(/authDomain:\s*'tradeoslive\.web\.app'/);
    expect(firebase).not.toMatch(/authDomain:\s*'tradeos-91a58\.firebaseapp\.com'/);
    expect(envExample).toMatch(/^VITE_FIREBASE_AUTH_DOMAIN=tradeoslive\.web\.app$/m);
    expect(spec).toMatch(/^VITE_FIREBASE_AUTH_DOMAIN=tradeoslive\.web\.app$/m);
    expect(deploy).toMatch(/VITE_FIREBASE_AUTH_DOMAIN:\s*tradeoslive\.web\.app/);
    expect(deploy).toMatch(/firebase-tools deploy --only hosting:app --project /);
    expect(deploy).not.toMatch(/hosting:legacy/);
    expect(deploy).toMatch(/hosting:channel:deploy "\$CHANNEL" \\\s*\n\s*--only app /);
  });

  it('points user-facing links at the live site', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.homepage).toBe('https://tradeoslive.web.app');
    for (const file of [
      'README.md',
      'index.html',
      'public/sitemap.xml',
      'public/robots.txt',
      'docs/OWNER_CHECKLIST.md',
      'docs/legal/DATA_INVENTORY.md',
      'docs/qa/TRADEOS_QA_REPORT.md',
    ]) {
      const text = read(file);
      expect(text, file).not.toMatch(/\]\(https:\/\/tradeos-91a58\.web\.app/);
      expect(text, file).not.toMatch(/href="https:\/\/tradeos-91a58\.web\.app/);
    }
    expect(read('index.html')).toMatch(/property="og:url" content="https:\/\/tradeoslive\.web\.app"/);
    expect(read('docs/OWNER_CHECKLIST.md')).toMatch(/firebase hosting:disable --project tradeos-91a58 --site tradeos-91a58/);
    expect(read('docs/OWNER_CHECKLIST.md')).not.toMatch(/tradeos-91a58\.web\.app/);
  });
});
