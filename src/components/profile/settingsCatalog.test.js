import { describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_SECTION_SCROLL_GAP,
  SETTINGS_SECTIONS,
  scrollSettingsSectionIntoView,
  settingsSectionFromParam,
} from './settingsCatalog';

describe('settings catalog', () => {
  it('keeps every settings section in page order', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'trading', 'plan', 'reports', 'notifications', 'api', 'general', 'account',
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual([
      'מסחר', 'מנוי', 'דוחות', 'התראות', 'API', 'כללי', 'חשבון',
    ]);
    const text = SETTINGS_SECTIONS.map((section) => `${section.label} ${section.keywords || ''}`).join(' ');
    expect(text).not.toContain('שדות');
    expect(settingsSectionFromParam('fields')).toBeNull();
  });

  it('reads a section deep link and ignores unknown values', () => {
    expect(settingsSectionFromParam('account')).toBe('account');
    expect(settingsSectionFromParam(' Account ')).toBe('account');
    expect(settingsSectionFromParam('#settings-api')).toBe('api');
    expect(settingsSectionFromParam('settings-trading')).toBe('trading');
    expect(settingsSectionFromParam('all')).toBeNull();
    expect(settingsSectionFromParam('סיסמה')).toBeNull();
    expect(settingsSectionFromParam('')).toBeNull();
    expect(settingsSectionFromParam(null)).toBeNull();
  });

  it('scrolls the app scroller to the requested section', () => {
    const el = { getBoundingClientRect: () => ({ top: 400 }) };
    const scroller = {
      scrollTop: 20,
      getBoundingClientRect: () => ({ top: 80 }),
      scrollTo: vi.fn(),
    };
    const doc = {
      getElementById(id) {
        if (id === 'settings-reports') return el;
        if (id === 'app-scroll') return scroller;
        return null;
      },
    };
    expect(scrollSettingsSectionIntoView('reports', doc)).toBe(true);
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 400 - 80 + 20 - SETTINGS_SECTION_SCROLL_GAP,
      behavior: 'smooth',
    });
    expect(scrollSettingsSectionIntoView('missing', doc)).toBe(false);
    expect(scrollSettingsSectionIntoView('all', doc)).toBe(false);
  });

  it('falls back to the element when the page scroller is absent', () => {
    const el = { scrollIntoView: vi.fn() };
    const doc = {
      getElementById: (id) => (id === 'settings-general' ? el : null),
    };
    expect(scrollSettingsSectionIntoView('#general', doc)).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
