import { describe, expect, it } from 'vitest';
import {
  SITE_CANDIDATES,
  classifySiteAttempt,
  domainsForSite,
  expectedAppSite,
  firstUsableSite,
  isSiteIdTaken,
  manualAuthSteps,
  mergeAuthorizedDomains,
} from './ensure-hosting-site.mjs';

describe('hosting site selection', () => {
  it('tries tradeos, then tradeosapp, then tradeos-app', () => {
    expect(SITE_CANDIDATES).toEqual(['tradeos', 'tradeosapp', 'tradeos-app']);
  });

  it('treats a site already in this project as ours, and a 409 elsewhere as taken', () => {
    expect(classifySiteAttempt({ getStatus: 200 })).toBe('ours');
    expect(classifySiteAttempt({ getStatus: 404, createStatus: 200 })).toBe('created');
    expect(classifySiteAttempt({ getStatus: 404, createStatus: 409, getAfterStatus: 200 })).toBe('ours');
    expect(classifySiteAttempt({ getStatus: 404, createStatus: 409, getAfterStatus: 404 })).toBe('taken');
    expect(classifySiteAttempt({ getStatus: 404, createStatus: 403 })).toBe('error');
  });

  it('treats a reserved site id as taken and keeps searching', () => {
    expect(isSiteIdTaken(400, 'Invalid name: `tradeos` is reserved by another project; try something like `tradeos-1290b` instead')).toBe(true);
    expect(isSiteIdTaken(409, 'already exists')).toBe(true);
    expect(isSiteIdTaken(403, 'Caller does not have required permission')).toBe(false);
  });

  it('stops at the first site this project can use', () => {
    expect(firstUsableSite(SITE_CANDIDATES, { tradeos: 'ours' })).toBe('tradeos');
    expect(firstUsableSite(SITE_CANDIDATES, { tradeos: 'taken', tradeosapp: 'created' })).toBe('tradeosapp');
    expect(firstUsableSite(SITE_CANDIDATES, { tradeos: 'taken', tradeosapp: 'taken', 'tradeos-app': 'ours' })).toBe('tradeos-app');
    expect(firstUsableSite(SITE_CANDIDATES, { tradeos: 'taken', tradeosapp: 'error' })).toBe(null);
    expect(firstUsableSite(SITE_CANDIDATES, { tradeos: 'taken', tradeosapp: 'taken', 'tradeos-app': 'taken' })).toBe(null);
  });

  it('reads the app target from .firebaserc', () => {
    const rc = { targets: { 'tradeos-91a58': { hosting: { app: ['tradeos'] } } } };
    expect(expectedAppSite(rc)).toBe('tradeos');
    expect(() => expectedAppSite({})).toThrow(/app/);
  });
});

describe('authorized domains', () => {
  it('appends the new site domains and keeps every domain already there', () => {
    const merged = mergeAuthorizedDomains(
      ['localhost', 'tradeos-91a58.web.app', 'tradeos-91a58.firebaseapp.com'],
      domainsForSite('tradeos'),
    );
    expect(merged).toEqual([
      'localhost',
      'tradeos-91a58.web.app',
      'tradeos-91a58.firebaseapp.com',
      'tradeos.web.app',
      'tradeos.firebaseapp.com',
    ]);
  });

  it('does not duplicate a domain that is already authorized', () => {
    const merged = mergeAuthorizedDomains(
      ['tradeos.web.app', 'TRADEOS.firebaseapp.com'],
      domainsForSite('tradeos'),
    );
    expect(merged).toEqual(['tradeos.web.app', 'TRADEOS.firebaseapp.com']);
  });

  it('tells the owner which domains and redirect URI to add by hand', () => {
    const text = manualAuthSteps('tradeos', '403 permission denied');
    expect(text).toContain('tradeos.web.app');
    expect(text).toContain('tradeos.firebaseapp.com');
    expect(text).toContain('https://tradeos.web.app/__/auth/handler');
    expect(text).toContain('403 permission denied');
    expect(text).toContain('/__/auth/action');
  });
});
