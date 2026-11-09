import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SECTIONS,
  listedSettingsSections,
  visibleSettingsSection,
} from './settingsCatalog';

describe('settings catalog', () => {
  it('keeps every settings category', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'trading', 'fields', 'plan', 'reports', 'notifications', 'api', 'general', 'account',
    ]);
  });

  it('shows the whole page until a category or a query is chosen', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(visibleSettingsSection(section.id, {})).toBe(true);
    }
    expect(visibleSettingsSection('trading', { active: 'account' })).toBe(false);
    expect(visibleSettingsSection('account', { active: 'account' })).toBe(true);
  });

  it('searches across categories and ignores the selected one', () => {
    expect(listedSettingsSections('סיסמה').map((section) => section.id)).toEqual(['account']);
    expect(visibleSettingsSection('account', { active: 'trading', query: 'סיסמה' })).toBe(true);
    expect(visibleSettingsSection('trading', { active: 'trading', query: 'סיסמה' })).toBe(false);
    expect(listedSettingsSections('מס').map((section) => section.id)).toEqual(['trading', 'reports']);
    expect(listedSettingsSections('אין דבר כזה')).toEqual([]);
    expect(listedSettingsSections('סיור').map((section) => section.id)).toEqual(['general']);
  });
});
