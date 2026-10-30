import { describe, expect, it } from 'vitest';
import { settingsPatchFields } from './firestoreService';

describe('settingsPatchFields', () => {
  it('patches one key and leaves the rest of the map for Firestore to keep', () => {
    const existing = { favoriteCoins: ['BTC'], defaultLeverage: 10, assetClasses: ['crypto'] };
    const fields = settingsPatchFields({ journalMigrated: true });
    expect(fields).toEqual({ 'settings.journalMigrated': true });
    const next = { ...existing };
    for (const [path, value] of Object.entries(fields)) next[path.split('.')[1]] = value;
    expect(next.favoriteCoins).toEqual(['BTC']);
    expect(next.defaultLeverage).toBe(10);
    expect(next.journalMigrated).toBe(true);
  });

  it('drops secret names instead of writing them into settings', () => {
    expect(settingsPatchFields({ apiKey: 'x', apiSecret: 'y', journalMigrated: true }))
      .toEqual({ 'settings.journalMigrated': true });
  });
});
