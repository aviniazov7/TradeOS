// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import PublicDemoPage from './PublicDemoPage';
import { PUBLIC_DEMO_BANNER } from '../../utils/publicDemo';

describe('public demo page', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('shows the banner and does not call the network or store anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<PublicDemoPage />); });
    expect(document.querySelector('[data-testid="public-demo-banner"]').textContent).toBe(PUBLIC_DEMO_BANNER);
    expect(document.body.textContent).toContain('שום דבר לא נשמר');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
    el.remove();
    fetchSpy.mockRestore();
    setItem.mockRestore();
  });
});
