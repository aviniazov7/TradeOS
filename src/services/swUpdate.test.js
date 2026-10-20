import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldReloadOnControllerChange } from './swUpdate';

describe('service worker takeover', () => {
  it('reloads only a page that was already controlled, and only once', () => {
    expect(shouldReloadOnControllerChange({ hadController: true, refreshing: false })).toBe(true);
    expect(shouldReloadOnControllerChange({ hadController: false, refreshing: false })).toBe(false);
    expect(shouldReloadOnControllerChange({ hadController: true, refreshing: true })).toBe(false);
  });

  it('bumps the cache and does not let the HTTP cache satisfy logos or the shell', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const cache = sw.match(/const CACHE_NAME = 'tradeos-v(\d+)'/);
    // Live production is already tradeos-v322. Keep that generation or newer.
    // Pushing to main auto-bumps the number, so the test cannot pin one value.
    expect(cache).not.toBeNull();
    expect(Number(cache[1])).toBeGreaterThanOrEqual(322);
    expect(sw).toContain("const cacheMode = isImmutableAsset(url) ? 'default' : 'no-store'");
    expect(sw).toContain('responseIsHtmlForImage');
    expect(sw).toContain("statusText: 'Not an image'");
  });

  it('leaves Firebase /__/auth responses to Hosting instead of the app shell', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const start = sw.indexOf('const BYPASS_HOST_PATTERNS');
    const end = sw.indexOf('function isPrivateWorkerRequest');
    const shouldBypass = new Function(`${sw.slice(start, end)}\nreturn shouldBypass;`)();
    expect(shouldBypass('https://tradeoslive.web.app/__/auth/handler')).toBe(true);
    expect(shouldBypass('https://tradeoslive.web.app/__/auth/iframe')).toBe(true);
    expect(shouldBypass('https://tradeoslive.web.app/__/auth/action?mode=resetPassword')).toBe(true);
    expect(shouldBypass('https://tradeoslive.web.app/dashboard')).toBe(false);
    expect(shouldBypass('https://tradeoslive.web.app/login')).toBe(false);
  });
});
