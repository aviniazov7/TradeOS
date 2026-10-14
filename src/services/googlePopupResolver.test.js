import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({
  auth: { name: 'test-auth', currentUser: null },
  googleProvider: { providerId: 'google.com' },
}));

// Package exports hide these files from bare specifiers. They are the browser
// build Vite ships, where browserPopupRedirectResolver is the class.
vi.mock('firebase/auth', async () => {
  const actual = await import('../../node_modules/@firebase/auth/dist/esm/index.js');
  return {
    ...actual,
    signInWithPopup: vi.fn(() => Promise.resolve(null)),
    signInWithRedirect: vi.fn(() => Promise.resolve()),
    getRedirectResult: vi.fn(() => Promise.resolve(null)),
    reauthenticateWithPopup: vi.fn(() => Promise.resolve(null)),
  };
});

vi.mock('@firebase/auth/internal', async () => {
  return import('../../node_modules/@firebase/auth/dist/esm/internal.js');
});

let originalInitialize;
let resolverClass;

afterEach(() => {
  if (resolverClass && originalInitialize) {
    resolverClass.prototype._initialize = originalInitialize;
  }
  vi.clearAllMocks();
  vi.resetModules();
});

async function load() {
  const authMod = await import('firebase/auth');
  const internal = await import('@firebase/auth/internal');
  const svc = await import('./authService');
  const firebase = await import('./firebase');
  resolverClass = authMod.browserPopupRedirectResolver;
  originalInitialize = resolverClass.prototype._initialize;
  let release = () => {};
  let started = false;
  resolverClass.prototype._initialize = function () {
    started = true;
    return new Promise((resolve) => { release = resolve; });
  };
  return {
    authMod,
    internal,
    svc,
    firebase,
    started: () => started,
    release: () => release(),
  };
}

function expectResolverClass(call, resolverClass) {
  const resolver = call[2];
  expect(resolver).toBe(resolverClass);
  expect(typeof resolver).toBe('function');
  expect(resolver).not.toBeInstanceOf(Promise);
}

describe('Google sign-in resolver argument', () => {
  it('uses one browserPopupRedirectResolver class for the public and internal SDKs', async () => {
    const { authMod, internal } = await load();
    expect(internal.browserPopupRedirectResolver).toBe(authMod.browserPopupRedirectResolver);
    expect(typeof authMod.browserPopupRedirectResolver).toBe('function');
    const instance = internal._getInstance(authMod.browserPopupRedirectResolver);
    expect(instance).toBeInstanceOf(authMod.browserPopupRedirectResolver);
    expect(internal._getInstance(authMod.browserPopupRedirectResolver)).toBe(instance);
  });

  it('passes the resolver class into signInWithPopup once the iframe is warm', async () => {
    const { authMod, svc, firebase, release, started } = await load();
    const warming = svc.preloadPopupResolver();
    await vi.waitFor(() => { expect(started()).toBe(true); });
    release();
    await warming;

    const result = svc.loginWithGoogle();
    expect(authMod.signInWithPopup).toHaveBeenCalledTimes(1);
    expectResolverClass(
      authMod.signInWithPopup.mock.calls[0],
      authMod.browserPopupRedirectResolver,
    );
    expect(authMod.signInWithPopup.mock.calls[0][0]).toBe(firebase.auth);
    expect(authMod.signInWithPopup.mock.calls[0][1]).toBe(firebase.googleProvider);
    expect(authMod.signInWithRedirect).not.toHaveBeenCalled();
    await result;
  });

  it('passes the resolver class into signInWithRedirect when the iframe is not warm yet', async () => {
    const { authMod, svc, firebase, release, started } = await load();
    const pending = svc.loginWithGoogle();
    await vi.waitFor(() => { expect(started()).toBe(true); });
    expect(authMod.signInWithPopup).not.toHaveBeenCalled();
    expect(authMod.signInWithRedirect).not.toHaveBeenCalled();
    release();
    await pending;
    expect(authMod.signInWithPopup).not.toHaveBeenCalled();
    expect(authMod.signInWithRedirect).toHaveBeenCalledTimes(1);
    expectResolverClass(
      authMod.signInWithRedirect.mock.calls[0],
      authMod.browserPopupRedirectResolver,
    );
    expect(authMod.signInWithRedirect.mock.calls[0][0]).toBe(firebase.auth);
    expect(authMod.signInWithRedirect.mock.calls[0][1]).toBe(firebase.googleProvider);
  });
});
