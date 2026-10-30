import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { safeNotificationPath } from './pushNavigate';

describe('safeNotificationPath', () => {
  it('keeps in-app paths', () => {
    expect(safeNotificationPath('/journal')).toBe('/journal');
    expect(safeNotificationPath('/news?tab=calendar')).toBe('/news?tab=calendar');
    expect(safeNotificationPath('  /profile  ')).toBe('/profile');
  });

  it('rejects other origins, schemes, and backslashes', () => {
    expect(safeNotificationPath('https://evil.example/login')).toBe('/');
    expect(safeNotificationPath('//evil.example')).toBe('/');
    expect(safeNotificationPath('/\\evil')).toBe('/');
    expect(safeNotificationPath('javascript:alert(1)')).toBe('/');
    expect(safeNotificationPath('https://tradeoslive.web.app/journal')).toBe('/');
  });
});

describe('service worker click handler', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

  it('refuses a navigation whose origin is not the app', () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
    expect(sw).toMatch(/path\.startsWith\('\/\/'\)/);
    expect(sw).toMatch(/path\.includes\('\\\\'\)/);
  });
});
