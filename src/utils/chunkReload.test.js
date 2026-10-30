import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_QUERY,
  hardReload,
  installChunkLoadRecovery,
  isChunkLoadError,
  isChunkReloadInFlight,
  loadWithChunkReload,
  noteChunkReloadQuery,
  reloadOnceForChunkError,
  resetChunkReloadForTests,
  shouldReloadForPreloadError,
  shouldReloadForWindowError,
  stripChunkReloadQuery,
} from './chunkReload';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

async function flush() {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

describe('chunk load errors', () => {
  it('recognizes Safari, Chromium, Firefox, and webpack chunk failures', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError('Importing a module script failed')).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/app-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module: /assets/app-abc.js'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('network'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Expected a JavaScript module script but the server responded with a MIME type of "text/html".'))).toBe(true);
    expect(isChunkLoadError(new Error('unsupported MIME type'))).toBe(false);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/index.css'))).toBe(false);
  });
});

describe('one-time hard reload', () => {
  beforeEach(() => {
    resetChunkReloadForTests();
  });

  it('reloads once per session and keeps the rest of the URL', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage, reload })).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    expect(isChunkReloadInFlight()).toBe(true);
    expect(reloadOnceForChunkError({ storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    const location = {
      href: 'https://tradeoslive.web.app/market?tab=whales&__reload=old#book',
      replace: vi.fn(),
    };
    hardReload(location);
    const next = new URL(location.replace.mock.calls[0][0]);
    expect(next.pathname).toBe('/market');
    expect(next.searchParams.get('tab')).toBe('whales');
    expect(next.searchParams.getAll(CHUNK_RELOAD_QUERY)).toEqual([expect.stringMatching(/^\d+$/)]);
    expect(next.hash).toBe('#book');
  });

  it('does not reload when the guard cannot be stored', () => {
    const reload = vi.fn();
    const storage = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    expect(reloadOnceForChunkError({ storage, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(isChunkReloadInFlight()).toBe(false);
  });

  it('drops the guard when the reload itself throws', () => {
    const storage = memoryStorage();
    expect(reloadOnceForChunkError({
      storage,
      reload() { throw new Error('replace failed'); },
    })).toBe(false);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    expect(isChunkReloadInFlight()).toBe(false);
  });

  it('strips the cache-buster without another navigation or clearing the guard', () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1' });
    const location = { href: 'https://tradeoslive.web.app/journal?tab=1&__reload=99#h' };
    const history = { state: { k: 1 }, replaceState: vi.fn() };
    expect(noteChunkReloadQuery(location, storage)).toBe(true);
    expect(stripChunkReloadQuery(location, history)).toBe(true);
    expect(history.replaceState).toHaveBeenCalledWith({ k: 1 }, '', '/journal?tab=1#h');
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    expect(stripChunkReloadQuery({ href: 'https://tradeoslive.web.app/journal?tab=1' }, history)).toBe(false);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });

  it('treats a document that still has the cache-buster as already reloaded', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const location = { href: 'https://tradeoslive.web.app/?__reload=5' };
    expect(reloadOnceForChunkError({ storage, reload, location })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });
});

describe('lazy() import recovery', () => {
  beforeEach(() => {
    resetChunkReloadForTests();
  });

  it('hangs a rejected chunk import and reloads once', async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let settled = false;
    loadWithChunkReload(
      () => Promise.reject(new Error('Importing a module script failed.')),
      { storage, reload },
    ).then(() => { settled = true; }, () => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });

  it('rejects the second failure so the error boundary can render', async () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1' });
    const reload = vi.fn();
    await expect(loadWithChunkReload(
      () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      { storage, reload },
    )).rejects.toThrow(/Failed to fetch dynamically imported module/);
    expect(reload).not.toHaveBeenCalled();
  });

  it('lets a real module and a real error through', async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const mod = { default: function Page() { return null; } };
    await expect(loadWithChunkReload(() => Promise.resolve(mod), { storage, reload })).resolves.toBe(mod);
    await expect(loadWithChunkReload(
      () => Promise.reject(new Error('render bug')),
      { storage, reload },
    )).rejects.toThrow('render bug');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('vite:preloadError and window errors', () => {
  let uninstall = () => {};

  beforeEach(() => {
    resetChunkReloadForTests();
  });

  afterEach(() => {
    uninstall();
    uninstall = () => {};
  });

  function listen(overrides = {}) {
    const target = new EventTarget();
    const reload = vi.fn();
    const storage = overrides.storage || memoryStorage();
    const location = overrides.location || { href: 'https://tradeoslive.web.app/dashboard' };
    const history = overrides.history || { state: null, replaceState: vi.fn() };
    uninstall = installChunkLoadRecovery({ target, reload, storage, location, history });
    return { target, reload, storage, history };
  }

  it('reloads once on a real vite:preloadError and then lets the error surface', () => {
    const { target, reload } = listen();
    const first = new Event('vite:preloadError', { cancelable: true });
    first.payload = new Error('Failed to fetch dynamically imported module: /assets/app-old.js');
    target.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    resetChunkReloadForTests();
    const second = new Event('vite:preloadError', { cancelable: true });
    second.payload = new Error('Importing a module script failed.');
    target.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores stylesheet preloads, empty prefetches, and modulepreload link errors', () => {
    const { target, reload } = listen();
    const css = new Event('vite:preloadError', { cancelable: true });
    css.payload = new Error('Unable to preload CSS for /assets/index.css');
    const empty = new Event('vite:preloadError', { cancelable: true });
    const linkError = {
      target: { tagName: 'LINK' },
      message: 'Importing a module script failed.',
      error: null,
      preventDefault: vi.fn(),
    };
    target.dispatchEvent(css);
    target.dispatchEvent(empty);
    expect(shouldReloadForPreloadError(css)).toBe(false);
    expect(shouldReloadForPreloadError(empty)).toBe(false);
    expect(shouldReloadForPreloadError({ payload: new Error('Failed to fetch dynamically imported module') })).toBe(true);
    expect(shouldReloadForWindowError(linkError, target)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(css.defaultPrevented).toBe(false);
  });

  it('reloads on an unhandled chunk rejection and a Safari module error', () => {
    const { target, reload, storage } = listen();
    const rejection = new Event('unhandledrejection', { cancelable: true });
    rejection.reason = new Error('Failed to fetch dynamically imported module: /assets/x.js');
    target.dispatchEvent(rejection);
    expect(rejection.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');

    const safari = new Event('error', { cancelable: true });
    safari.message = 'Importing a module script failed.';
    target.dispatchEvent(safari);
    expect(safari.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated rejections and only installs once', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const storage = memoryStorage();
    const first = installChunkLoadRecovery({
      target,
      reload,
      storage,
      location: { href: 'https://tradeoslive.web.app/' },
      history: { state: null, replaceState: vi.fn() },
    });
    const second = installChunkLoadRecovery({
      target,
      reload,
      storage,
      location: { href: 'https://tradeoslive.web.app/' },
      history: { state: null, replaceState: vi.fn() },
    });
    uninstall = () => { first(); second(); };

    const noise = new Event('unhandledrejection', { cancelable: true });
    noise.reason = new Error('quota exceeded');
    target.dispatchEvent(noise);
    expect(reload).not.toHaveBeenCalled();
    expect(noise.defaultPrevented).toBe(false);

    const prefetch = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(prefetch);
    expect(reload).not.toHaveBeenCalled();

    const hit = new Event('vite:preloadError', { cancelable: true });
    hit.payload = new Error('Loading chunk 3 failed.');
    target.dispatchEvent(hit);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('strips a leftover cache-buster when recovery is installed', () => {
    const history = { state: { a: 1 }, replaceState: vi.fn() };
    listen({
      location: { href: 'https://tradeoslive.web.app/?__reload=5' },
      history,
    });
    expect(history.replaceState).toHaveBeenCalledWith({ a: 1 }, '', '/');
  });
});
