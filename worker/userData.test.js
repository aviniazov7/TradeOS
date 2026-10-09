import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  USER_SUBCOLLECTIONS, userSingleKvKeys, isLifetimePlan, samePushSubscription,
  buildSettingsMap, settingsAnyOn, sanitizeNotifySettings } from './userData';

const here = dirname(fileURLToPath(import.meta.url));

describe('USER_SUBCOLLECTIONS', () => {
  it('matches the client list in src/services/firestoreService.js exactly', () => {
    const src = readFileSync(resolve(here, '../src/services/firestoreService.js'), 'utf8');
    const m = src.match(/export const USER_SUBCOLLECTIONS = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const client = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect([...USER_SUBCOLLECTIONS].sort()).toEqual([...client].sort());
  });
  it('includes the collections the admin delete used to miss', () => {
    expect(USER_SUBCOLLECTIONS).toEqual(expect.arrayContaining(['wyckoffSetups', 'polymarketWatch', 'polymarketStrategies']));
  });
});

describe('userSingleKvKeys', () => {
  it('covers schedule, plan cache and AI quota', () => {
    expect(userSingleKvKeys('U1')).toEqual(expect.arrayContaining(['usettings:U1', 'planflag:U1', 'aiq:U1']));
  });
});

describe('isLifetimePlan', () => {
  it('premium with no expiry is lifetime', () => {
    expect(isLifetimePlan('premium', null)).toBe(true);
    expect(isLifetimePlan('premium', '')).toBe(true);
  });
  it('time-limited / free plans are not', () => {
    expect(isLifetimePlan('premium', '2027-01-01T00:00:00Z')).toBe(false);
    expect(isLifetimePlan('free', null)).toBe(false);
    expect(isLifetimePlan(null, null)).toBe(false);
  });
});

describe('samePushSubscription', () => {
  const a = { endpoint: 'https://push/x', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } };
  it('identical subscriptions match (stored JSON round-trip)', () => {
    expect(samePushSubscription(JSON.parse(JSON.stringify(a)), a)).toBe(true);
  });
  it('any changed key / endpoint does not', () => {
    expect(samePushSubscription({ ...a, keys: { p256dh: 'P', auth: 'B' } }, a)).toBe(false);
    expect(samePushSubscription({ ...a, endpoint: 'https://push/y' }, a)).toBe(false);
    expect(samePushSubscription(null, a)).toBe(false);
  });
  it('missing vs null expirationTime is the same', () => {
    const { expirationTime: _e, ...noExp } = a;
    expect(samePushSubscription(noExp, a)).toBe(true);
  });
});

describe('buildSettingsMap', () => {
  const on = { journal: { enabled: true, time: '21:00' }, summary: { enabled: false }, calendar: { enabled: false } };
  const off = { journal: { enabled: false }, summary: { enabled: false }, calendar: { enabled: false } };

  it('reads schedules from list metadata, skipping disabled ones and the legacy blob key', () => {
    const { map, needFetch } = buildSettingsMap([
      { name: 'usettings:ALL', metadata: null },
      { name: 'usettings:U1', metadata: on },
      { name: 'usettings:U2', metadata: off },
    ]);
    expect(map).toEqual({ U1: on });
    expect(needFetch).toEqual([]);
  });
  it('falls back to the legacy blob for keys without metadata, else asks for a fetch', () => {
    const { map, needFetch } = buildSettingsMap(
      [{ name: 'usettings:U3' }, { name: 'usettings:U4' }],
      { U3: on },
    );
    expect(map).toEqual({ U3: on });
    expect(needFetch).toEqual(['U4']);
  });
  it('metadata wins over a stale legacy entry', () => {
    const { map } = buildSettingsMap([{ name: 'usettings:U5', metadata: off }], { U5: on });
    expect(map).toEqual({});
  });
  it('settingsAnyOn', () => {
    expect(settingsAnyOn(on)).toBe(true);
    expect(settingsAnyOn(off)).toBe(false);
    expect(settingsAnyOn(null)).toBe(false);
  });
});

describe('sanitizeNotifySettings', () => {
  it('keeps every toggle the app offers, including the news-impact one', () => {
    const s = sanitizeNotifySettings({
      journal: { enabled: true, time: '20:30' }, summary: { enabled: false, time: '22:00' },
      calendar: { enabled: true }, newsImpact: { enabled: true },
    });
    expect(s).toEqual({
      journal: { enabled: true, time: '20:30' }, summary: { enabled: false, time: '22:00' },
      calendar: { enabled: true }, newsImpact: { enabled: true },
    });
  });

  it('is strict: only literal true enables, bad times fall back', () => {
    const s = sanitizeNotifySettings({ journal: { enabled: 'yes', time: '25:99' }, calendar: { enabled: 1 }, newsImpact: {} });
    expect(s.journal).toEqual({ enabled: false, time: '21:00' });
    expect(s.calendar.enabled).toBe(false);
    expect(s.newsImpact.enabled).toBe(false);
  });

  it('copes with a missing or junk body', () => {
    expect(sanitizeNotifySettings(undefined).calendar.enabled).toBe(false);
    expect(sanitizeNotifySettings(null).summary.time).toBe('22:00');
    expect(sanitizeNotifySettings('x').newsImpact.enabled).toBe(false);
  });
});
