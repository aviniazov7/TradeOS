import { describe, expect, it } from 'vitest';
import {
  SITE_CANDIDATES,
  domainsForSite,
  mergeAuthorizedDomains,
  nameTaken,
  preferredOwnedSite,
  siteIdFromName,
  withAppTarget,
} from './ensure-hosting-site.mjs';

describe('hosting site selection', () => {
  it('tries the clean name first', () => {
    expect(SITE_CANDIDATES).toEqual(['tradeos-app', 'tradeosapp', 'tradeos-journal']);
    expect(preferredOwnedSite(['tradeos-91a58'])).toBeNull();
    expect(preferredOwnedSite(['tradeos-91a58', 'tradeos-journal', 'tradeos-app'])).toBe('tradeos-app');
    expect(preferredOwnedSite(['tradeosapp'])).toBe('tradeosapp');
  });

  it('reads a site id from the resource name', () => {
    expect(siteIdFromName('projects/tradeos-91a58/sites/tradeos-app')).toBe('tradeos-app');
  });

  it('treats a global name collision as taken and a permission error as not', () => {
    expect(nameTaken(409, {})).toBe(true);
    expect(nameTaken(400, { error: { message: 'site already exists' } })).toBe(true);
    expect(nameTaken(400, { error: { message: 'Invalid name: `tradeos-app` is reserved by another project' } })).toBe(true);
    expect(nameTaken(403, { error: { status: 'PERMISSION_DENIED', message: 'forbidden' } })).toBe(false);
  });
});

describe('authorized domains', () => {
  it('adds the new web.app and firebaseapp.com hosts without dropping existing ones', () => {
    const { domains, added } = mergeAuthorizedDomains(
      ['localhost', 'tradeos-91a58.web.app', 'tradeos-91a58.firebaseapp.com'],
      'tradeos-app',
    );
    expect(added).toEqual(['tradeos-app.web.app', 'tradeos-app.firebaseapp.com']);
    expect(domains).toEqual([
      'localhost',
      'tradeos-91a58.web.app',
      'tradeos-91a58.firebaseapp.com',
      'tradeos-app.web.app',
      'tradeos-app.firebaseapp.com',
    ]);
    expect(domainsForSite('tradeos-app')).toEqual(added);
  });

  it('is a no-op when the domains are already present', () => {
    const existing = ['localhost', 'tradeos-app.web.app', 'tradeos-app.firebaseapp.com'];
    const { domains, added } = mergeAuthorizedDomains(existing, 'tradeos-app');
    expect(added).toEqual([]);
    expect(domains).toEqual(existing);
  });
});

describe('firebaserc target', () => {
  it('points the app target at the chosen site and keeps the legacy site', () => {
    const next = withAppTarget({
      projects: { default: 'tradeos-91a58' },
      targets: { 'tradeos-91a58': { hosting: { app: ['tradeos-app'], legacy: ['tradeos-91a58'] } } },
    }, 'tradeosapp');
    expect(next.targets['tradeos-91a58'].hosting.app).toEqual(['tradeosapp']);
    expect(next.targets['tradeos-91a58'].hosting.legacy).toEqual(['tradeos-91a58']);
  });
});
