// First-run spotlight tour. It is remembered per account on this device
// (localStorage) and never writes the profile, so Firestore rules stay put.
// onboardingCompleted is not touched: the slide wizard keeps its own flag.
// A session mark remembers that this tab already saw a new account, because
// finishing the wizard flips that flag to true before the tour can open.

export const UI_TOUR_REPLAY_EVENT = 'tradeos-ui-tour-replay';
export const UI_TOUR_WIZARD_EVENT = 'tradeos-ui-tour-wizard';

export const UI_TOUR_STEPS = [
  {
    id: 'menu',
    title: 'התפריט',
    body: 'יומן, בקטסט, תוכניות ושוק נפתחים מכאן.',
    target: '[data-tour="menu"]',
  },
  {
    id: 'search',
    title: 'חיפוש',
    body: 'מוצאים מסך, מטבע או עסקה בלי לגלול בתפריט.',
    target: '[data-tour="search"]',
  },
  {
    id: 'trade',
    title: 'עסקה חדשה',
    body: 'הפלוס פותח עסקה. אחרי חיבור בורסה העסקאות נכנסות לבד.',
    target: '[data-tour="new-trade"]',
    optional: true,
  },
  {
    id: 'settings',
    title: 'הגדרות',
    body: 'ערכת נושא, התראות וחשבון. את הסיור מפעילים שוב מכאן.',
    target: '[data-tour="settings"]',
  },
];

export function tourSeenKey(uid) {
  return uid ? `tradeos_ui_tour_${uid}` : '';
}

export function tourCandidateKey(uid) {
  return uid ? `tradeos_ui_tour_new_${uid}` : '';
}

export function readTourSeen(uid, storage = globalThis.localStorage) {
  if (!uid || !storage) return false;
  try { return storage.getItem(tourSeenKey(uid)) === '1'; } catch { return false; }
}

export function writeTourSeen(uid, storage = globalThis.localStorage) {
  if (!uid || !storage) return;
  try { storage.setItem(tourSeenKey(uid), '1'); } catch { /* private mode */ }
}

export function clearTourSeen(uid, storage = globalThis.localStorage) {
  if (!uid || !storage) return;
  try { storage.removeItem(tourSeenKey(uid)); } catch { /* private mode */ }
}

export function noteTourCandidate(uid, onboardingCompleted, storage = globalThis.sessionStorage) {
  if (!uid || !storage || onboardingCompleted !== false) return;
  try { storage.setItem(tourCandidateKey(uid), '1'); } catch { /* private mode */ }
}

export function isTourCandidate(uid, onboardingCompleted, storage = globalThis.sessionStorage) {
  if (onboardingCompleted === false) return true;
  if (!uid || !storage) return false;
  try { return storage.getItem(tourCandidateKey(uid)) === '1'; } catch { return false; }
}

// The slide wizard owns the screen until it settles closed. Replay ignores
// that only after the wizard says it is closed, so the two never stack.
export function shouldShowUiTour({
  uid,
  profileKnown,
  wizardClosed,
  seen,
  candidate,
  replay,
} = {}) {
  if (!uid || !profileKnown || !wizardClosed) return false;
  if (replay) return true;
  if (seen || !candidate) return false;
  return true;
}

export function visibleTourSteps(steps, isTargetVisible) {
  return steps.filter((step) => !step.optional || isTargetVisible(step));
}

export function isTourTargetVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Scrim behind the tour. Darker than the first version so the page
// (demo banner, new-trade button) recedes, without hiding the spotlight.
export const UI_TOUR_SHADE = {
  light: 'rgba(15, 23, 42, 0.62)',
  dark: 'rgba(0, 0, 0, 0.78)',
};

export function tourCardPosition(rect, viewport, cardHeight = 176) {
  const margin = 12;
  const gap = 12;
  const height = Math.max(1, Number(cardHeight) || 176);
  const width = Math.min(320, Math.max(160, viewport.width - margin * 2));
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const maxTop = Math.max(margin, viewport.height - height - margin);
  const clampLeft = (value) => Math.max(margin, Math.min(value, maxLeft));
  const clampTop = (value) => Math.max(margin, Math.min(value, maxTop));

  if (!rect) {
    return {
      top: clampTop((viewport.height - height) / 2),
      left: clampLeft((viewport.width - width) / 2),
      width,
    };
  }

  const left = clampLeft(rect.left + rect.width / 2 - width / 2);
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - gap - height;
  const roomBelow = viewport.height - margin - belowTop;
  const roomAbove = rect.top - gap - margin;
  const fitsBelow = roomBelow >= height;
  const fitsAbove = roomAbove >= height;
  const targetMid = rect.top + (rect.bottom - rect.top) / 2;
  const preferBelow = targetMid < viewport.height * 0.55;

  let top;
  if (preferBelow && fitsBelow) top = belowTop;
  else if (!preferBelow && fitsAbove) top = aboveTop;
  else if (fitsBelow) top = belowTop;
  else if (fitsAbove) top = aboveTop;
  else if (roomBelow >= roomAbove) top = clampTop(belowTop);
  else top = clampTop(aboveTop);

  const overlapsTarget = top < rect.bottom && top + height > rect.top;
  if (overlapsTarget) {
    if (fitsAbove) top = aboveTop;
    else if (fitsBelow) top = belowTop;
    else if (roomAbove >= roomBelow) top = clampTop(aboveTop);
    else top = clampTop(belowTop);
  }

  return { top, left, width };
}

export function publishWizardForTour(open) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UI_TOUR_WIZARD_EVENT, { detail: { open: !!open } }));
}

export function replayUiTour(uid, storage = globalThis.localStorage) {
  clearTourSeen(uid, storage);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UI_TOUR_REPLAY_EVENT));
}
