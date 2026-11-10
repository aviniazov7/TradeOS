// Profile settings, in page order. The screen shows every section; a deep
// link (?section=account or #settings-account) only scrolls to one of them.

export const SETTINGS_SECTION_SCROLL_GAP = 16;

export const SETTINGS_SECTIONS = [
  { id: 'trading', label: 'מסחר' },
  {
    id: 'fields',
    label: 'שדות לעסקה',
    // The visible name changed. The old name stays here so a search for it
    // still means this section.
    keywords: 'שדות מותאמים שדות נוספים לעסקה custom fields סטאפ ציון ביצוע הערת כניסה עסקה טקסט מספר בחירה',
  },
  { id: 'plan', label: 'מנוי' },
  { id: 'reports', label: 'דוחות' },
  { id: 'notifications', label: 'התראות' },
  { id: 'api', label: 'API' },
  { id: 'general', label: 'כללי' },
  { id: 'account', label: 'חשבון' },
];

const SECTION_IDS = new Set(SETTINGS_SECTIONS.map((section) => section.id));

// Accepts "account", "#account", "settings-account", and "#settings-account".
// "all" and anything unknown stay on the top of the page.
export function settingsSectionFromParam(value) {
  let id = String(value || '').trim().toLowerCase().replace(/^#/, '');
  if (id.startsWith('settings-')) id = id.slice('settings-'.length);
  if (!id || id === 'all' || !SECTION_IDS.has(id)) return null;
  return id;
}

export function settingsSectionElementId(id) {
  const resolved = settingsSectionFromParam(id);
  return resolved ? `settings-${resolved}` : null;
}

// The window does not scroll. #app-scroll is the page scroller (see Layout).
export function scrollSettingsSectionIntoView(id, doc = globalThis.document) {
  const elementId = settingsSectionElementId(id);
  if (!elementId || !doc?.getElementById) return false;
  const el = doc.getElementById(elementId);
  if (!el) return false;
  const scroller = doc.getElementById('app-scroll');
  if (scroller && typeof scroller.scrollTo === 'function') {
    const top = el.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top
      + (scroller.scrollTop || 0)
      - SETTINGS_SECTION_SCROLL_GAP;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return true;
  }
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return true;
}
