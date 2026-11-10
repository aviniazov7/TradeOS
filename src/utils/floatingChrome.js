// Shared geometry for the phone's floating chrome.
//
// The push-permission banner is a near full-width bar just above the tab bar.
// In RTL its dismiss control is on the physical left — the same corner as the
// accessibility button — so that button has to move while the banner is up.
// PushNudge publishes the banner's measured height; CSS (index.css) consumes
// data-push-nudge and --push-nudge-clearance.

export const PUSH_NUDGE_GAP_PX = 12;

/** Banner height plus a gap, or null when there is nothing to clear yet. */
export function pushNudgeClearancePx(bannerHeight) {
  const h = Number(bannerHeight);
  if (!Number.isFinite(h) || h < 1) return null;
  return Math.ceil(h) + PUSH_NUDGE_GAP_PX;
}

/**
 * Pixels from the banner's top to the bottom of the viewport, plus a gap.
 * Measured, so a zoomed desktop (the banner sits on `lg:bottom-6`) and a
 * wrapped phone banner both clear the last cards.
 */
export function pushNudgeBlockPx(bannerTop, viewportHeight) {
  const top = Number(bannerTop);
  const view = Number(viewportHeight);
  if (!Number.isFinite(top) || !Number.isFinite(view) || view <= 0) return null;
  const occupied = view - top;
  if (!(occupied > 0)) return null;
  return Math.ceil(occupied) + PUSH_NUDGE_GAP_PX;
}

export function publishPushNudgeChrome(bannerHeight, blockPx) {
  const root = document.documentElement;
  root.dataset.pushNudge = 'open';
  const clearance = pushNudgeClearancePx(bannerHeight);
  if (clearance == null) root.style.removeProperty('--push-nudge-clearance');
  else root.style.setProperty('--push-nudge-clearance', `${clearance}px`);
  const block = Number(blockPx);
  if (!Number.isFinite(block) || block < 1) root.style.removeProperty('--push-nudge-block');
  else root.style.setProperty('--push-nudge-block', `${Math.ceil(block)}px`);
}

export function clearPushNudgeChrome() {
  const root = document.documentElement;
  delete root.dataset.pushNudge;
  root.style.removeProperty('--push-nudge-clearance');
  root.style.removeProperty('--push-nudge-block');
}
