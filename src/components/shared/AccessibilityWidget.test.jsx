// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AccessibilityWidget from './AccessibilityWidget';

async function mount(path = '/journal') {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AccessibilityWidget />
      </MemoryRouter>,
    );
  });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('AccessibilityWidget', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('marks the corner button so the push banner can lift it', async () => {
    const view = await mount('/journal');
    const fab = document.querySelector('[data-testid="a11y-fab"]');
    expect(fab).toBeTruthy();
    expect(fab.className).toContain('a11y-fab');
    expect(fab.className).toContain('left-3');
    expect(fab.className).toContain('bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)]');
    expect(fab.getAttribute('aria-label')).toBe('פתיחת תפריט נגישות');
    await view.cleanup();
  });

  it('does not reserve nav clearance on pages without the tab bar', async () => {
    const view = await mount('/login');
    const fab = document.querySelector('[data-testid="a11y-fab"]');
    expect(fab.className).toContain('bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]');
    expect(fab.className).not.toContain('6.25rem');
    await view.cleanup();
  });
});
