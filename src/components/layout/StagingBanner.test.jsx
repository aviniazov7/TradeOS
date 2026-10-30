// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import StagingBanner from './StagingBanner';
import { showStagingBanner, STAGING_BANNER_TEXT } from '../../utils/stagingBanner';

async function renderBanner(props) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<StagingBanner {...props} />); });
  return {
    async cleanup() {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('showStagingBanner', () => {
  it('is hidden for the production hostname even when the staging flag is set', () => {
    expect(showStagingBanner({
      hostname: 'tradeoslive.web.app',
      stagingFlag: '1',
    })).toBe(false);
    expect(showStagingBanner({
      hostname: 'TRADEOSLIVE.WEB.APP',
      stagingFlag: true,
    })).toBe(false);
    expect(showStagingBanner({
      hostname: 'tradeoslive.web.app.',
      stagingFlag: '1',
    })).toBe(false);
  });

  it('shows on preview channel hostnames without the build flag', () => {
    expect(showStagingBanner({
      hostname: 'tradeoslive--dev-0qe24kd4.web.app',
      stagingFlag: '',
    })).toBe(true);
    expect(showStagingBanner({
      hostname: 'tradeoslive--pr-12-ab12cd.web.app',
    })).toBe(true);
  });

  it('shows on other hosts only when the staging build flag is set', () => {
    expect(showStagingBanner({ hostname: 'localhost', stagingFlag: '1' })).toBe(true);
    expect(showStagingBanner({ hostname: 'localhost', stagingFlag: '' })).toBe(false);
    expect(showStagingBanner({ hostname: 'tradeoslive.firebaseapp.com' })).toBe(false);
  });
});

describe('StagingBanner', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('is hidden for the production hostname', async () => {
    const view = await renderBanner({
      hostname: 'tradeoslive.web.app',
      stagingFlag: '1',
    });
    expect(document.querySelector('[data-testid="staging-banner"]')).toBeNull();
    expect(document.body.textContent).not.toContain('STAGING');
    expect(document.body.textContent).not.toContain(STAGING_BANNER_TEXT);
    await view.cleanup();
  });

  it('shows the short English warning on a preview channel', async () => {
    const view = await renderBanner({
      hostname: 'tradeoslive--dev-0qe24kd4.web.app',
      stagingFlag: '',
    });
    const banner = document.querySelector('[data-testid="staging-banner"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toBe(STAGING_BANNER_TEXT);
    expect(banner.getAttribute('dir')).toBe('ltr');
    await view.cleanup();
  });
});
