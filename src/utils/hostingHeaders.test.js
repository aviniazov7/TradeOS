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

  it('does not allow the open proxies the browser used to call', () => {
    expect(d['connect-src']).not.toContain('https://api.allorigins.win');
    expect(d['connect-src']).not.toContain('https://api.codetabs.com');
    expect(d['connect-src']).not.toContain('https://nfs.faireconomy.media');
  });

  it('lets the app reach its backends', () => {
    for (const origin of [
      'https://trade-os.tradeos.workers.dev', // the Worker (AI, exchanges, quotes)
      'https://trade-os-staging.tradeos.workers.dev', // dev channel calls this Worker
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
    // The full script/connect policy stays report-only until a week of
    // /csp-report logs is clean. Enforcing it in the same change as dropping
    // the proxies would blank production if any origin is still missing.
    const enforced = directives(header('Content-Security-Policy'));
    expect(enforced['frame-ancestors']).toEqual(["'self'"]);
    expect(enforced['object-src']).toEqual(["'none'"]);
    expect(enforced['script-src']).toBeUndefined();
  });
});

describe('hosting transport', () => {
  it('sends HSTS for a year, including subdomains', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });
});

describe('hosting cache headers', () => {
  const sources = appHosting.headers.map((h) => h.source);
  const cacheOf = (source) => appHosting.headers
    .find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value;

  it('caches images and self-hosted fonts for a week', () => {
    expect(cacheOf('**/*.@(png|jpg|jpeg|gif|svg|ico|webp|woff2)')).toBe('public, max-age=604800');
  });

  it('keeps hashed build assets immutable and the HTML document and service worker uncached', () => {
    const week = sources.indexOf('**/*.@(png|jpg|jpeg|gif|svg|ico|webp|woff2)');
    const assets = sources.indexOf('/assets/**');
    const index = sources.indexOf('/index.html');
    const sw = sources.indexOf('/sw.js');
    expect(week).toBeGreaterThan(-1);
    expect(assets).toBeGreaterThan(week);
    expect(index).toBeGreaterThan(assets);
    expect(sw).toBeGreaterThan(index);
    expect(cacheOf('**')).toBe('no-cache');
    expect(cacheOf('/assets/**')).toBe('public, max-age=31536000, immutable');
    expect(cacheOf('/index.html')).toBe('no-cache');
    expect(cacheOf('/sw.js')).toBe('no-cache');
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
    const heavy = readFileSync(fileURLToPath(new URL('../../node_modules/@fontsource/heebo/hebrew-800.css', import.meta.url)), 'utf8');
    expect(css).toMatch(/font-display:\s*swap/);
    expect(css).toMatch(/\.woff2/);
    expect(heavy).toMatch(/font-display:\s*swap/);
    expect(heavy).toMatch(/\.woff2/);
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

  it('marks a shared journal private and out of search', () => {
    const share = appHosting.headers.find((h) => h.source === '/share/**');
    const value = (key) => share.headers.find((h) => h.key === key)?.value;
    expect(value('Cache-Control')).toBe('private, no-store');
    expect(value('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(read('robots.txt')).not.toMatch(/^Allow: \/share/m);
    expect(read('sitemap.xml')).not.toMatch(/\/share/);
  });

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
      'docs/legal/DATA_INVENTORY.md',
      'docs/qa/TRADEOS_QA_REPORT.md',
    ]) {
      const text = read(file);
      expect(text, file).not.toMatch(/\]\(https:\/\/tradeos-91a58\.web\.app/);
      expect(text, file).not.toMatch(/href="https:\/\/tradeos-91a58\.web\.app/);
    }
    expect(read('index.html')).toMatch(/property="og:url" content="https:\/\/tradeoslive\.web\.app"/);
    expect(read('README.md')).toMatch(/firebase hosting:disable --project tradeos-91a58 --site tradeos-91a58/);
    expect(read('README.md')).not.toMatch(/tradeos-91a58\.web\.app/);
  });
});

describe('dev channel origin in CSP', () => {
  const d = directives(header('Content-Security-Policy-Report-Only'));

  function httpsHostAllowed(sources, url) {
    const host = new URL(url).hostname;
    return sources.some((source) => {
      if (!source.startsWith('https://')) return false;
      const pattern = source.slice('https://'.length).replace(/\/$/, '');
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return host.endsWith(suffix) && host.length > suffix.length;
      }
      return host === pattern;
    });
  }

  it('allows the fixed dev channel host in connect-src and frame-src', () => {
    for (const directive of ['connect-src', 'frame-src']) {
      expect(d[directive]).toContain('https://*.web.app');
      expect(httpsHostAllowed(d[directive], 'https://tradeoslive--dev-abc123.web.app')).toBe(true);
      expect(httpsHostAllowed(d[directive], 'https://tradeoslive--pr-616-abc123.web.app')).toBe(true);
      expect(httpsHostAllowed(d[directive], 'https://evil.example')).toBe(false);
    }
  });
});
