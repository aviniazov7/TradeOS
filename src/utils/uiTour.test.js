// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  UI_TOUR_REPLAY_EVENT,
  UI_TOUR_STEPS,
  isTourCandidate,
  isTourTargetVisible,
  noteTourCandidate,
  readTourSeen,
  replayUiTour,
  shouldShowUiTour,
  tourCardPosition,
  UI_TOUR_SHADE,
  visibleTourSteps,
  writeTourSeen,
} from './uiTour';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const open = {
  uid: 'new-user',
  profileKnown: true,
  wizardClosed: true,
  seen: false,
  candidate: true,
  replay: false,
};

describe('ui tour gate', () => {
  it('shows once for a new account after the wizard closes', () => {
    expect(shouldShowUiTour(open)).toBe(true);
    expect(shouldShowUiTour({ ...open, wizardClosed: false })).toBe(false);
    expect(shouldShowUiTour({ ...open, profileKnown: false })).toBe(false);
    expect(shouldShowUiTour({ ...open, seen: true })).toBe(false);
    expect(shouldShowUiTour({ ...open, candidate: false })).toBe(false);
  });

  it('keeps the tour eligible after the wizard marks setup done in this tab', () => {
    const session = memoryStorage();
    expect(isTourCandidate('new-user', true, session)).toBe(false);
    noteTourCandidate('new-user', false, session);
    noteTourCandidate('old-user', true, session);
    expect(isTourCandidate('new-user', true, session)).toBe(true);
    expect(isTourCandidate('old-user', true, session)).toBe(false);
    expect(isTourCandidate('new-user', false, session)).toBe(true);
  });

  it('remembers skip and done per account, and replay clears that memory', () => {
    const local = memoryStorage();
    writeTourSeen('new-user', local);
    expect(readTourSeen('new-user', local)).toBe(true);
    expect(readTourSeen('other', local)).toBe(false);
    const listener = vi.fn();
    window.addEventListener(UI_TOUR_REPLAY_EVENT, listener);
    replayUiTour('new-user', local);
    expect(readTourSeen('new-user', local)).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(UI_TOUR_REPLAY_EVENT, listener);
    expect(shouldShowUiTour({ ...open, seen: false, candidate: false, replay: true })).toBe(true);
  });

  it('drops the new-trade step when that control is not on screen', () => {
    const steps = visibleTourSteps(UI_TOUR_STEPS, (step) => step.id !== 'trade');
    expect(steps.map((step) => step.id)).toEqual(['menu', 'search', 'settings']);
    expect(isTourTargetVisible(null)).toBe(false);
    expect(isTourTargetVisible({ getBoundingClientRect: () => ({ width: 0, height: 10 }) })).toBe(false);
    expect(isTourTargetVisible({ getBoundingClientRect: () => ({ width: 8, height: 8 }) })).toBe(true);
  });

  it('places the card under a top target and above a bottom one', () => {
    const viewport = { width: 390, height: 800 };
    const below = tourCardPosition({ top: 20, bottom: 64, left: 16, width: 40, height: 44 }, viewport);
    expect(below.top).toBeGreaterThan(64);
    const above = tourCardPosition({ top: 700, bottom: 760, left: 160, width: 48, height: 60 }, viewport);
    expect(above.top).toBeLessThan(700);
    expect(below.left).toBeGreaterThanOrEqual(12);
    expect(below.left + below.width).toBeLessThanOrEqual(390);
  });

  it('keeps a top-left settings target clear inside a phone and a desktop', () => {
    const target = { top: 10, bottom: 54, left: 8, width: 40, height: 44 };
    const height = 188;
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const card = tourCardPosition(target, viewport, height);
      expect(card.top).toBeGreaterThanOrEqual(target.bottom + 12);
      expect(card.top + height).toBeLessThanOrEqual(viewport.height - 12);
      expect(card.left).toBeGreaterThanOrEqual(12);
      expect(card.left + card.width).toBeLessThanOrEqual(viewport.width - 12);
    }
  });

  it('keeps a bottom new-trade target clear on a phone', () => {
    const viewport = { width: 390, height: 844 };
    const target = { top: 760, bottom: 820, left: 170, width: 48, height: 60 };
    const height = 188;
    const card = tourCardPosition(target, viewport, height);
    expect(card.top + height).toBeLessThanOrEqual(target.top - 12);
    expect(card.top).toBeGreaterThanOrEqual(12);
    expect(card.left).toBeGreaterThanOrEqual(12);
    expect(card.left + card.width).toBeLessThanOrEqual(viewport.width - 12);
  });

  it('dims the page more than a light scrim in both themes', () => {
    expect(UI_TOUR_SHADE.dark).toBe('rgba(0, 0, 0, 0.78)');
    expect(UI_TOUR_SHADE.light).toBe('rgba(15, 23, 42, 0.62)');
  });
});
