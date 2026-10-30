import { describe, expect, it, vi } from 'vitest';
import { shouldReloadOnControllerChange } from './swUpdate';
import {
  CHUNK_RELOAD_KEY,
  installChunkLoadRecovery,
  resetChunkReloadForTests,
} from '../utils/chunkReload';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

// One document. Module state resets, as it does on a real navigation.
// sessionStorage is the caller's and survives from the previous visit.
function openVisit({ storage, href = 'https://tradeoslive.web.app/', activation, preload }) {
  resetChunkReloadForTests();
  const reloads = [];
  const reload = () => { reloads.push(href); };
  const location = { href };
  const history = { state: null, replaceState: vi.fn() };
  const target = new EventTarget();
  const uninstall = installChunkLoadRecovery({ target, reload, storage, location, history });

  if (shouldReloadOnControllerChange({
    hadController: !!activation?.hadController,
    refreshing: false,
    scriptChanged: !!activation?.scriptChanged,
  })) reload();

  if (preload) {
    const event = new Event('vite:preloadError', { cancelable: true });
    event.payload = preload;
    target.dispatchEvent(event);
  }

  uninstall();
  return reloads.length;
}

describe('repeated visits and service worker activation', () => {
  it('does not reload a normal open, including when the worker activates every time', () => {
    const storage = memoryStorage();
    const activations = [
      { hadController: false, scriptChanged: true },
      { hadController: true, scriptChanged: false },
      { hadController: true, scriptChanged: true },
      { hadController: true, scriptChanged: false },
    ];
    for (const activation of activations) {
      expect(openVisit({
        storage,
        activation,
        preload: new Error('Unable to preload CSS for /assets/index.css'),
      })).toBe(0);
    }
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('reloads at most once when a hashed chunk is actually missing', () => {
    const storage = memoryStorage();
    const chunk = new Error('Failed to fetch dynamically imported module: /assets/trade-old.js');
    expect(openVisit({
      storage,
      activation: { hadController: true, scriptChanged: true },
      preload: chunk,
    })).toBe(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');

    expect(openVisit({
      storage,
      href: 'https://tradeoslive.web.app/?__reload=10',
      activation: { hadController: true, scriptChanged: true },
      preload: chunk,
    })).toBe(0);
    expect(openVisit({
      storage,
      activation: { hadController: true, scriptChanged: false },
      preload: chunk,
    })).toBe(0);
    expect(openVisit({
      storage,
      activation: { hadController: true, scriptChanged: true },
      preload: new Error('Importing a module script failed.'),
    })).toBe(0);
  });
});
