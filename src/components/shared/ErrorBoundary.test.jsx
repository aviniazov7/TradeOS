// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary';
import { CHUNK_RELOAD_KEY, resetChunkReloadForTests } from '../../utils/chunkReload';

function Boom({ error }) {
  throw error;
}

function mount(error) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return {
    el,
    render: async () => {
      await act(async () => {
        root.render(
          <ErrorBoundary>
            <Boom error={error} />
          </ErrorBoundary>,
        );
      });
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('ErrorBoundary chunk recovery', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    sessionStorage.clear();
    resetChunkReloadForTests();
    window.history.replaceState(null, '', '/');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('hard-reloads once on Safari\'s module error and then shows the screen', async () => {
    const error = new Error('Importing a module script failed.');
    const first = mount(error);
    await first.render();
    expect(first.el.textContent).not.toContain('משהו השתבש');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    const reloaded = window.location.href;
    expect(reloaded).toContain('__reload=');
    await first.cleanup();

    resetChunkReloadForTests();
    const second = mount(error);
    await second.render();
    expect(second.el.textContent).toContain('משהו השתבש');
    expect(window.location.href).toBe(reloaded);
    await second.cleanup();
  });

  it('reloads on a dynamic import failure and on ChunkLoadError', async () => {
    const dynamic = mount(new Error('Failed to fetch dynamically imported module: /assets/index-old.js'));
    await dynamic.render();
    expect(dynamic.el.textContent).not.toContain('משהו השתבש');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    await dynamic.cleanup();

    sessionStorage.clear();
    resetChunkReloadForTests();
    window.history.replaceState(null, '', '/');
    const chunk = mount(Object.assign(new Error('network'), { name: 'ChunkLoadError' }));
    await chunk.render();
    expect(chunk.el.textContent).not.toContain('משהו השתבש');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    await chunk.cleanup();
  });

  it('leaves an ordinary error and a missing Firebase config on screen', async () => {
    const ordinary = mount(new Error('Cannot read properties of undefined'));
    await ordinary.render();
    expect(ordinary.el.textContent).toContain('משהו השתבש');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    await ordinary.cleanup();

    const config = mount(Object.assign(new Error('api-key-not-valid'), { code: 'tradeos/firebase-config-missing' }));
    await config.render();
    expect(config.el.textContent).toContain('תצורת Firebase חסרה');
    expect(config.el.textContent).not.toContain('משהו השתבש');
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    await config.cleanup();
  });

  it('still offers a manual hard reload after the automatic one was used', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    const view = mount(new Error('Loading chunk 4 failed.'));
    await view.render();
    expect(view.el.textContent).toContain('רענן דף');
    const before = window.location.href;
    const button = view.el.querySelector('button');
    await act(async () => { button.click(); });
    expect(window.location.href).not.toBe(before);
    expect(window.location.href).toContain('__reload=');
    await view.cleanup();
  });
});
