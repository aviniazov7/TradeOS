// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import UiTour from './UiTour';
import { UI_TOUR_SHADE, UI_TOUR_WIZARD_EVENT, readTourSeen, replayUiTour } from '../../utils/uiTour';

let profile;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'synthetic-user' },
    profile,
  }),
}));

function anchors() {
  const root = document.createElement('div');
  root.innerHTML = `
    <button data-tour="menu">תפריט</button>
    <button data-tour="search">חיפוש</button>
    <a data-tour="new-trade">פלוס</a>
    <a data-tour="settings">הגדרות</a>
  `;
  document.body.appendChild(root);
  return root;
}

function closeWizard() {
  window.dispatchEvent(new CustomEvent(UI_TOUR_WIZARD_EVENT, { detail: { open: false } }));
}

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<UiTour />); });
  return {
    el,
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('UiTour', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    HTMLElement.prototype.getBoundingClientRect = () => ({
      top: 12, left: 12, width: 44, height: 44, bottom: 56, right: 56, x: 12, y: 12, toJSON() {},
    });
  });

  it('walks a new user through the shell and remembers skip on this device', async () => {
    profile = { onboardingCompleted: false };
    localStorage.clear();
    sessionStorage.clear();
    const marks = anchors();
    const view = await mount();
    expect(document.querySelector('[data-testid="ui-tour"]')).toBeNull();
    await act(async () => { closeWizard(); });
    const tour = document.querySelector('[data-testid="ui-tour"]');
    expect(tour).toBeTruthy();
    expect(tour.textContent).toContain('התפריט');
    expect(tour.className).toContain('z-[120]');
    const ring = tour.querySelector('[data-testid="ui-tour-ring"]');
    expect(ring).toBeTruthy();
    expect(ring.style.boxShadow).toContain(UI_TOUR_SHADE.dark);
    const card = tour.querySelector('[data-testid="ui-tour-card"]');
    expect(card.style.background).toBe('var(--modal-header-solid)');
    expect(card.className).toContain('border');
    expect(card.className).not.toContain('bg-bg-secondary');
    expect(card.style.boxShadow).toContain('rgba(0,0,0,0.55)');
    const ringBottom = Number.parseFloat(ring.style.top) + Number.parseFloat(ring.style.height);
    const cardTop = Number.parseFloat(card.style.top);
    const cardLeft = Number.parseFloat(card.style.left);
    const cardRight = cardLeft + Number.parseFloat(card.style.width);
    expect(cardTop).toBeGreaterThanOrEqual(ringBottom);
    expect(cardLeft).toBeGreaterThanOrEqual(12);
    expect(cardRight).toBeLessThanOrEqual(window.innerWidth - 12);
    const skip = [...tour.querySelectorAll('button')].find((button) => button.textContent.trim() === 'דלג');
    await act(async () => { skip.click(); });
    expect(document.querySelector('[data-testid="ui-tour"]')).toBeNull();
    expect(readTourSeen('synthetic-user')).toBe(true);
    await view.cleanup();
    marks.remove();
  });

  it('stays hidden for an existing account until settings replay it', async () => {
    profile = { onboardingCompleted: true };
    localStorage.clear();
    sessionStorage.clear();
    const marks = anchors();
    const view = await mount();
    await act(async () => { closeWizard(); });
    expect(document.querySelector('[data-testid="ui-tour"]')).toBeNull();
    await act(async () => { replayUiTour('synthetic-user'); });
    expect(document.querySelector('[data-testid="ui-tour"]').textContent).toContain('התפריט');
    const next = [...document.querySelectorAll('[data-testid="ui-tour"] button')].find((button) => button.textContent.includes('הבא'));
    await act(async () => { next.click(); });
    expect(document.body.textContent).toContain('חיפוש');
    await act(async () => { next.click(); });
    expect(document.body.textContent).toContain('עסקה חדשה');
    const done = [...document.querySelectorAll('[data-testid="ui-tour"] button')].find((button) => button.textContent.includes('סיום'));
    expect(done).toBeFalsy();
    await act(async () => { next.click(); });
    const finish = [...document.querySelectorAll('[data-testid="ui-tour"] button')].find((button) => button.textContent.includes('סיום'));
    await act(async () => { finish.click(); });
    expect(readTourSeen('synthetic-user')).toBe(true);
    expect(document.querySelector('[data-testid="ui-tour"]')).toBeNull();
    await view.cleanup();
    marks.remove();
  });

  it('does not cover the slide wizard', async () => {
    profile = { onboardingCompleted: false };
    localStorage.clear();
    sessionStorage.clear();
    const marks = anchors();
    const view = await mount();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(UI_TOUR_WIZARD_EVENT, { detail: { open: true } }));
    });
    expect(document.querySelector('[data-testid="ui-tour"]')).toBeNull();
    await view.cleanup();
    marks.remove();
  });
});
