// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import OnboardingWizard from './OnboardingWizard';

const setUserProfile = vi.fn(async () => {});

vi.mock('../../services/firestoreService', () => ({
  getUserProfile: vi.fn(async () => ({ exists: true, data: { onboardingCompleted: false } })),
  setUserProfile: (...args) => setUserProfile(...args),
  timestamp: () => ({ seconds: 1 }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'new-user' } }),
}));

function shell(node) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <LazyMotion features={domAnimation} strict>
        {node}
      </LazyMotion>
    </MemoryRouter>
  );
}

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(shell(<OnboardingWizard />)); });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('OnboardingWizard', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
  });

  it('does not finish onboarding when the user skips, and connect is the primary action', async () => {
    sessionStorage.clear();
    localStorage.clear();
    setUserProfile.mockClear();
    const view = await mount();
    const skip = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'דלג');
    expect(skip).toBeTruthy();
    await act(async () => { skip.click(); });
    expect(setUserProfile).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('tradeos-onboarding-dismissed')).toBe('1');

    const { reopenOnboarding } = await import('../../utils/onboardingGate');
    await act(async () => { reopenOnboarding(); });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    for (let i = 0; i < 3; i += 1) {
      const next = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('הבא'));
      await act(async () => { next.click(); });
    }
    const buttons = [...document.querySelectorAll('[role="dialog"] button')];
    const connect = buttons.find((b) => b.textContent.includes('חיבור בורסה'));
    const firstTrade = buttons.find((b) => b.textContent.includes('עסקה ראשונה'));
    expect(connect.className).toContain('bg-accent-muted');
    expect(firstTrade.className).not.toContain('bg-accent-muted');
    const consent = document.querySelector('[data-testid="onboarding-email-consent"] input');
    expect(consent).toBeTruthy();
    expect(consent.checked).toBe(false);
    expect(document.body.textContent).toContain('אני מעוניין/ת לקבל עדכונים ותזכורות במייל');
    setUserProfile.mockClear();
    await act(async () => { consent.click(); });
    expect(setUserProfile).toHaveBeenCalledWith('new-user', expect.objectContaining({ marketingEmails: true }));
    expect(connect.compareDocumentPosition(firstTrade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const later = buttons.find((b) => b.textContent.includes('אעשה את זה אחר כך'));
    setUserProfile.mockClear();
    await act(async () => { later.click(); });
    expect(setUserProfile).not.toHaveBeenCalled();
    await view.cleanup();
  });
});
