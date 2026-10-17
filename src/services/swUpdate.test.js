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
    expect(sw).toContain("const CACHE_NAME = 'tradeos-v322'");
    expect(sw).toContain("const cacheMode = isImmutableAsset(url) ? 'default' : 'no-store'");
    expect(sw).toContain('responseIsHtmlForImage');
    expect(sw).toContain("statusText: 'Not an image'");
  });
});
