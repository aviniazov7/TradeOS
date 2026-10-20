import { describe, expect, it } from 'vitest';
import {
  AUTH_DOMAIN,
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
  it('tries the requested ids, then the next clean ids', () => {
    expect(SITE_CANDIDATES).toEqual(['tradeos', 'tradeosapp', 'tradeos-app', 'tradeoslive', 'tradeos-live']);
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
    expect(firstUsableSite(SITE_CANDIDATES, {
      tradeos: 'taken', tradeosapp: 'taken', 'tradeos-app': 'taken', tradeoslive: 'created',
    })).toBe('tradeoslive');
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

  it('tells the owner to authorize the hosting site and keep the default auth handler', () => {
    const text = manualAuthSteps('tradeoslive', '403 permission denied');
    expect(AUTH_DOMAIN).toBe('tradeos-91a58.firebaseapp.com');
    expect(text).toContain('tradeoslive.web.app');
    expect(text).toContain('tradeoslive.firebaseapp.com');
    expect(text).toContain('https://tradeos-91a58.firebaseapp.com/__/auth/handler');
    expect(text).not.toContain('https://tradeoslive.web.app/__/auth/handler');
    expect(text).toContain('403 permission denied');
    expect(text).toContain('/__/auth/action');
  });
});
