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

function shell(node) {
  return (
    <MemoryRouter>
      <LazyMotion features={domAnimation} strict>
        {node}
      </LazyMotion>
    </MemoryRouter>
  );
}

function clickNav(id) {
  const button = document.querySelector(`[data-testid="settings-nav-desktop"] [data-testid="settings-item-side-${id}"]`);
  if (!button) throw new Error(`missing settings item ${id}`);
  button.click();
}

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(<ProfilePage />)); });
  await act(async () => { await Promise.resolve(); });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
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

  it('lists every existing setting, then shows one category without dropping its actions', async () => {
    const view = await mount();
    const text = () => document.body.textContent;
    expect(text()).toContain('סוג מסחר');
    expect(text()).toContain('פתח את כל הכוח של TradeOS');
    expect(text()).toContain('דוח מס שנתי');
    expect(text()).toContain('התראות Push');
    expect(text()).toContain('עדכונים ותזכורות במייל');
    expect(text()).toContain('מפתחות API');
    expect(text()).toContain('מצב בהיר');
    expect(text()).toContain('תמיכה ומשוב');
    expect(text()).toContain('שיתוף האפליקציה');
    expect(text()).toContain('ייצוא נתונים');
    expect(text()).toContain('שינוי סיסמה');
    expect(text()).toContain('התנתקות');
    expect(text()).toContain('מחיקת חשבון');
    expect(text()).toContain('הצהרת נגישות');
    expect(text()).not.toContain('לוח מובילים');

    await act(async () => { clickNav('account'); });
    expect(text()).toContain('שינוי סיסמה');
    expect(text()).toContain('דמו');
    expect(text()).not.toContain('סוג מסחר');
    expect(text()).not.toContain('דוח מס שנתי');

    const password = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('שינוי סיסמה'));
    await act(async () => { password.click(); });
    expect(document.querySelector('input[placeholder="סיסמה נוכחית"]')).toBeTruthy();

    await act(async () => { clickNav('trading'); });
    const stocks = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('מניות'));
    await act(async () => { stocks.click(); });
    expect(patchUserSettings).toHaveBeenCalledWith('synthetic-user', { assetClasses: ['stocks'] });
    await view.cleanup();
  });

  it('filters by the search box and can return to the full page', async () => {
    const view = await mount();
    const search = document.querySelector('[data-testid="settings-search"]');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(search, 'סיסמה');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('שינוי סיסמה');
    expect(document.body.textContent).not.toContain('סוג מסחר');
    expect(document.body.textContent).not.toContain('מפתחות API');

    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(search, 'אין דבר כזה');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="settings-empty"]')).toBeTruthy();
    expect(document.body.textContent).toContain('דמו');

    const back = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('הצגת כל ההגדרות'));
    await act(async () => { back.click(); });
    expect(document.body.textContent).toContain('סוג מסחר');
    expect(document.body.textContent).toContain('מפתחות API');
    await view.cleanup();
  });
});
