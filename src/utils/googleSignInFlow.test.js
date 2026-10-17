import { describe, expect, it } from 'vitest';
import { startGoogleSignIn } from './googleSignInFlow';

describe('startGoogleSignIn', () => {
  it('calls the popup synchronously when the resolver is already loaded', () => {
    const order = [];
    let microtaskRan = false;
    queueMicrotask(() => { microtaskRan = true; });

    const result = startGoogleSignIn({
      standalone: false,
      resolver: { id: 'ready' },
      popup: (resolver) => {
        order.push(['popup', microtaskRan, resolver.id]);
        return 'popup-promise';
      },
      redirect: () => { order.push('redirect'); },
      loadResolver: () => { order.push('load'); return Promise.resolve({ id: 'late' }); },
      markRedirect: () => { order.push('mark'); },
    });

    expect(order).toEqual([['popup', false, 'ready']]);
    expect(result).toBe('popup-promise');
  });

  it('does not open a popup when the resolver is still loading', async () => {
    const order = [];
    let resolveLoad;
    const result = startGoogleSignIn({
      standalone: false,
      resolver: null,
      popup: () => { order.push('popup'); },
      redirect: (resolver) => {
        order.push(['redirect', resolver.id]);
        return 'redirect-promise';
      },
      loadResolver: () => {
        order.push('load');
        return new Promise((resolve) => { resolveLoad = resolve; });
      },
      markRedirect: () => { order.push('mark'); },
    });

    expect(order).toEqual(['mark', 'load']);
    resolveLoad({ id: 'late' });
    await expect(result).resolves.toBe('redirect-promise');
    expect(order).toEqual(['mark', 'load', ['redirect', 'late']]);
  });

  it('uses redirect in a standalone PWA even when the resolver is ready', async () => {
    const order = [];
    const result = startGoogleSignIn({
      standalone: true,
      resolver: { id: 'ready' },
      popup: () => { order.push('popup'); },
      redirect: (resolver) => {
        order.push(['redirect', resolver.id]);
        return 'redirect-promise';
      },
      loadResolver: () => {
        order.push('load');
        return Promise.resolve({ id: 'ready' });
      },
      markRedirect: () => { order.push('mark'); },
    });

    expect(order).toEqual(['mark', 'load']);
    await expect(result).resolves.toBe('redirect-promise');
    expect(order).not.toContain('popup');
  });
});
