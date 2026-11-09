// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearPushNudgeChrome, publishPushNudgeChrome, pushNudgeClearancePx } from './floatingChrome';

describe('push nudge clearance', () => {
  it('adds a gap above the measured banner', () => {
    expect(pushNudgeClearancePx(64)).toBe(76);
    expect(pushNudgeClearancePx(64.2)).toBe(77);
  });

  it('ignores an unmeasured banner so CSS can use its fallback', () => {
    expect(pushNudgeClearancePx(0)).toBeNull();
    expect(pushNudgeClearancePx(null)).toBeNull();
    expect(pushNudgeClearancePx(Number.NaN)).toBeNull();
  });

  it('pads the phone page above a wrapped notifications banner', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const rule = css.slice(css.indexOf("@media (max-width: 1023px)"));
    expect(rule).toContain("html[data-push-nudge='open'] #app-scroll > main");
    expect(rule).toContain('padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 80px + var(--push-nudge-clearance, 7.5rem))');
    // A two-line banner on a 390px screen is about 96px. Clearance is that
    // height plus the 12px gap, and the banner itself starts 80px up.
    const banner = 96;
    const contentEndsAt = 80 + pushNudgeClearancePx(banner);
    expect(contentEndsAt).toBeGreaterThan(80 + banner);
  });

  it('publishes and clears the document flag the stylesheet reads', () => {
    publishPushNudgeChrome(60);
    expect(document.documentElement.dataset.pushNudge).toBe('open');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('72px');
    clearPushNudgeChrome();
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('');
  });
});
