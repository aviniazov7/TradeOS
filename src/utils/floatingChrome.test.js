// @vitest-environment happy-dom
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

  it('publishes and clears the document flag the stylesheet reads', () => {
    publishPushNudgeChrome(60);
    expect(document.documentElement.dataset.pushNudge).toBe('open');
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('72px');
    clearPushNudgeChrome();
    expect(document.documentElement.dataset.pushNudge).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--push-nudge-clearance')).toBe('');
  });
});
