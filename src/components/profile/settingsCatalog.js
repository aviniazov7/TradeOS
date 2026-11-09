// Categories on the profile settings screen. Labels and keywords are the
// search index; the controls themselves stay in ProfilePage.

export const SETTINGS_ALL_ID = 'all';

export const SETTINGS_SECTIONS = [
  {
    id: 'trading',
    label: 'מסחר',
    keywords: 'סוג מסחר קריפטו חוזים עתידיים מניות futures stocks crypto asset class',
  },
  {
    id: 'plan',
    label: 'מנוי',
    keywords: 'מנוי פרימיום premium שדרוג חידוש תוכנית plan',
  },
  {
    id: 'reports',
    label: 'דוחות',
    keywords: 'דוח מס שנתי רואה חשבון tax report',
  },
  {
    id: 'notifications',
    label: 'התראות',
    keywords: 'התראות פוש push מייל עדכונים תזכורות יומן לוח שנה notifications email',
  },
  {
    id: 'api',
    label: 'API',
    keywords: 'api מפתח מפתחות rest סוכן agent key',
  },
  {
    id: 'general',
    label: 'כללי',
    keywords: 'כללי ערכת נושא מצב בהיר מצב כהה theme dark light שיתוף האפליקציה ייצוא נתונים תמיכה ומשוב יצירת קשר',
  },
  {
    id: 'account',
    label: 'חשבון',
    keywords: 'חשבון סיסמה שינוי סיסמה איפוס שכחת התנתקות מחיקה מחיקת חשבון נגישות גרסה password logout version',
  },
];

export function settingsSectionMatches(section, query) {
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length || !section) return true;
  const hay = `${section.label} ${section.keywords}`.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

export function listedSettingsSections(query) {
  return SETTINGS_SECTIONS.filter((section) => settingsSectionMatches(section, query));
}

// A typed query searches every category. An empty query shows the chosen
// category, or the full page when the choice is "הכל".
export function visibleSettingsSection(id, { active = SETTINGS_ALL_ID, query = '' } = {}) {
  const section = SETTINGS_SECTIONS.find((item) => item.id === id);
  if (!section) return false;
  if (String(query || '').trim()) return settingsSectionMatches(section, query);
  if (!active || active === SETTINGS_ALL_ID) return true;
  return active === id;
}
