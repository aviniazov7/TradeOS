// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearPushNudgeChrome, publishPushNudgeChrome, pushNudgeBlockPx, pushNudgeClearancePx } from './floatingChrome';

describe('push nudge clearance', () => {
  it('adds a gap above the measured banner', () => {
    expect(pushNudgeClearancePx(64)).toBe(76);
    expect(pushNudgeClearancePx(64.2)).toBe(77);
  });

  it('ignores an unmeasured banner so CSS can use its fallback', () => {
    expect(pushNudgeClearancePx(0)).toBeNull();
    expect(pushNudgeClearancePx(null)).toBeNull();
    expect(pushNudgeClearancePx(Number.NaN)).toBeNull();
    expect(pushNudgeBlockPx(10, 0)).toBeNull();
    expect(pushNudgeBlockPx(Number.NaN, 400)).toBeNull();
  });

  it('pads the page above the banner at phone width and at a zoomed desktop', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const mainAt = css.indexOf('html[data-push-nudge=\'open\'] #app-scroll > main');
    const phoneBlock = css.slice(css.indexOf('@media (max-width: 1023px)'), mainAt);
    const mainRule = css.slice(mainAt);
    expect(phoneBlock).not.toContain('#app-scroll > main');
    expect(mainRule).toContain('padding-bottom: max(');
    expect(mainRule).toContain('var(--push-nudge-block, 16rem)');
    expect(mainRule).toContain('calc(env(safe-area-inset-bottom, 0px) + 10.5rem)');
    const desktop = mainRule.slice(mainRule.indexOf('@media (min-width: 1024px)'));
    expect(desktop).toContain('padding-bottom: var(--push-nudge-block, 10rem)');
    // 640px CSS viewport, banner top 160px above the bottom of a 400px-tall
    // zoomed window. The block is that distance plus the 12px gap.
    expect(pushNudgeBlockPx(240, 400)).toBe(172);
    expect(pushNudgeBlockPx(240, 400)).toBeGreaterThan(400 - 240);
  });

  it('publishes and clears the document flag the stylesheet reads', () => {
    publishPushNudgeChrome(60, 180);
    expect(document.documentElement.dataset.pushNudge).toBe('open');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('72px');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-block')).toBe('180px');
    clearPushNudgeChrome();
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-block')).toBe('');
  });
});
