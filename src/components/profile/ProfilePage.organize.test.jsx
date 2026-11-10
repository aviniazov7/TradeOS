// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from './ProfilePage';

const patchUserSettings = vi.fn(async () => {});

vi.mock('../../services/firestoreService', () => ({
  getUserProfile: vi.fn(async () => ({
    exists: true,
    data: { settings: { assetClasses: ['crypto'] }, isPublicProfile: false },
  })),
  setUserProfile: vi.fn(async () => {}),
  patchUserSettings: (...args) => patchUserSettings(...args),
  deleteLeaderboardEntry: vi.fn(async () => {}),
  timestamp: () => ({ seconds: 1 }),
  subscribeToUserSetting: () => () => {},
  setUserSetting: vi.fn(async () => {}),
}));

vi.mock('../../services/authService', () => ({
  updateDisplayName: vi.fn(async () => {}),
}));

vi.mock('../../contexts/AuthContext', () => {
  const user = {
    uid: 'synthetic-user',
    email: 'synthetic@example.com',
    displayName: 'דמו',
    metadata: { creationTime: '2024-01-02T00:00:00.000Z' },
  };
  const profile = { displayName: 'דמו' };
  return {
    useAuth: () => ({
      user,
      profile,
      isAdmin: false,
      isPremium: false,
      logout: vi.fn(async () => {}),
      changePassword: vi.fn(async () => {}),
      resetPassword: vi.fn(async () => {}),
      deleteAccount: vi.fn(async () => {}),
      isEmailUser: true,
    }),
  };
});

vi.mock('../shared/UserAvatar', () => ({ default: () => <span data-testid="avatar" /> }));
vi.mock('../../utils/avatarImage', () => ({ makeAvatarDataUrl: vi.fn() }));
vi.mock('./NotificationSettings', () => ({ default: () => <div>התראות Push</div> }));
vi.mock('./ApiKeysSection', () => ({ default: () => <section><h2>API</h2><div>מפתחות API</div></section> }));

function shell(node, entry = '/profile') {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <LazyMotion features={domAnimation} strict>
        {node}
      </LazyMotion>
    </MemoryRouter>
  );
}

async function mount(entry) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(<ProfilePage />, entry)); });
  await act(async () => { await Promise.resolve(); });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function sectionIds() {
  return [...document.querySelectorAll('[data-settings-section]')].map((section) => section.getAttribute('data-settings-section'));
}

describe('organized profile settings', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
  });

  it('lists every setting in one column, with no category sidebar', async () => {
    const view = await mount();
    const text = () => document.body.textContent;
    const column = document.querySelector('[data-testid="settings-column"]');
    expect(column.className).toContain('max-w-3xl');
    expect(column.className).not.toContain('grid-cols');
    expect(document.querySelector('[data-testid="settings-nav-desktop"]')).toBeNull();
    expect(document.querySelector('[data-testid="settings-nav-mobile"]')).toBeNull();
    expect(document.querySelector('[data-testid="settings-search"]')).toBeNull();
    expect(document.querySelector('[aria-label="קטגוריות הגדרות"]')).toBeNull();
    expect(sectionIds()).toEqual([
      'trading', 'plan', 'reports', 'notifications', 'api', 'general', 'account',
    ]);
    const titles = [...document.querySelectorAll('[data-settings-section] > h2')].map((heading) => heading.textContent.trim());
    expect(titles).toEqual(['מסחר', 'מנוי', 'דוחות', 'התראות', 'API', 'כללי', 'חשבון']);
    expect(text()).toContain('שדות משלך לעסקה מוסיפים בטופס העסקה');
    expect(text()).not.toContain('שדות נוספים לעסקה');
    expect(document.querySelector('[data-testid="custom-fields-settings"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-field-form"]')).toBeNull();

    expect(text()).toContain('סוג מסחר');
    expect(text()).toContain('פתח את כל הכוח של TradeOS');
    expect(text()).toContain('דוח מס שנתי');
    expect(text()).toContain('התראות Push');
    expect(text()).toContain('עדכונים ותזכורות במייל');
    expect(text()).toContain('מפתחות API');
    expect(text()).toContain('מצב בהיר');
    expect(text()).toContain('הפעלת הסיור');
    expect(text()).toContain('תמיכה ומשוב');
    expect(text()).toContain('שיתוף האפליקציה');
    expect(text()).toContain('ייצוא נתונים');
    expect(text()).toContain('שינוי סיסמה');
    expect(text()).toContain('התנתקות');
    expect(text()).toContain('מחיקת חשבון');
    expect(text()).toContain('הצהרת נגישות');
    expect(text()).not.toContain('לוח מובילים');
    expect(text()).toContain('דמו');

    const password = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('שינוי סיסמה'));
    await act(async () => { password.click(); });
    expect(document.querySelector('input[placeholder="סיסמה נוכחית"]')).toBeTruthy();
    expect(text()).toContain('סוג מסחר');

    const stocks = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('מניות'));
    await act(async () => { stocks.click(); });
    expect(patchUserSettings).toHaveBeenCalledWith('synthetic-user', { assetClasses: ['stocks'] });
    expect(text()).toContain('שינוי סיסמה');
    await view.cleanup();
  });

  it('scrolls to the section in ?section= and keeps the rest of the page', async () => {
    const scroller = document.createElement('div');
    scroller.id = 'app-scroll';
    scroller.scrollTo = vi.fn();
    document.body.appendChild(scroller);
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function rect() {
      const top = this.id === 'app-scroll' ? 100 : this.id === 'settings-account' ? 640 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() { return {}; } };
    };
    try {
      const view = await mount('/profile?section=account');
      expect(sectionIds()).toContain('trading');
      expect(document.body.textContent).toContain('סוג מסחר');
      expect(document.body.textContent).toContain('שינוי סיסמה');
      expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 640 - 100 - 16, behavior: 'smooth' });
      expect(document.activeElement?.id).toBe('settings-account');
      await view.cleanup();
    } finally {
      Element.prototype.getBoundingClientRect = original;
      scroller.remove();
    }
  });

  it('scrolls to a hash anchor and ignores an unknown section', async () => {
    const scroller = document.createElement('div');
    scroller.id = 'app-scroll';
    scroller.scrollTo = vi.fn();
    document.body.appendChild(scroller);
    const hashView = await mount('/profile#settings-reports');
    expect(scroller.scrollTo).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('settings-reports');
    await hashView.cleanup();
    scroller.scrollTo.mockClear();

    const unknown = await mount('/profile?section=nope');
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('סוג מסחר');
    expect(document.body.textContent).toContain('מפתחות API');
    await unknown.cleanup();

    const both = await mount('/profile?section=account#settings-reports');
    expect(document.activeElement?.id).toBe('settings-account');
    await both.cleanup();
    scroller.remove();
  });
});
