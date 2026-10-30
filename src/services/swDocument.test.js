import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function extract(signature, endMark, argNames = []) {
  const start = sw.indexOf(signature);
  const end = sw.indexOf(endMark);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const name = signature.replace(/^async function /, '').replace(/^function /, '').split('(')[0];
  const factory = new Function(...argNames, `${sw.slice(start, end)}\nreturn ${name};`);
  return argNames.length ? factory : factory();
}

const isDocumentRequest = extract('function isDocumentRequest', '// END isDocumentRequest');
const shouldRejectHtmlAsModule = extract('function shouldRejectHtmlAsModule', '// END shouldRejectHtmlAsModule');

function headers(accept = '') {
  return { get: (name) => (name.toLowerCase() === 'accept' ? accept : '') };
}

function htmlResponse(type = 'text/html; charset=utf-8') {
  return { headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : '') } };
}

describe('service worker document policy', () => {
  it('activates immediately and keeps push while documents stay network-first', () => {
    const installAt = sw.indexOf("self.addEventListener('install'");
    const activateAt = sw.indexOf("self.addEventListener('activate'");
    expect(installAt).toBeGreaterThan(-1);
    expect(sw.slice(installAt, activateAt)).toContain('self.skipWaiting()');
    expect(sw.slice(activateAt)).toContain('self.clients.claim()');
    expect(sw).toContain("self.addEventListener('push'");
    expect(sw).toContain('showNotification');
    expect(sw).toContain("self.addEventListener('notificationclick'");
    expect(sw).toContain('if (isDocumentRequest(event.request))');
    expect(sw).toContain('event.respondWith(networkFirstDocument(event.request))');
    expect(sw.indexOf('if (isDocumentRequest(event.request))')).toBeLessThan(
      sw.indexOf('shouldRejectHtmlAsModule(event.request, response)'),
    );
    expect(sw.indexOf("statusText: 'Missing chunk'")).toBeLessThan(sw.indexOf('cache.put(event.request, clone)'));
  });

  it('treats navigations and the shell as documents, not hashed scripts', () => {
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/dashboard',
      mode: 'navigate',
      destination: 'document',
      headers: headers(),
    })).toBe(true);
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/index.html',
      mode: 'cors',
      destination: '',
      headers: headers(),
    })).toBe(true);
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/',
      mode: 'same-origin',
      destination: '',
      headers: headers('text/html,application/xhtml+xml'),
    })).toBe(true);
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/market?tab=whales',
      mode: 'same-origin',
      destination: '',
      headers: headers('text/html'),
    })).toBe(true);
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/assets/index-abc.js',
      mode: 'cors',
      destination: 'script',
      headers: headers('*/*'),
    })).toBe(false);
    expect(isDocumentRequest({
      url: 'https://tradeoslive.web.app/icon-192.png',
      mode: 'no-cors',
      destination: 'image',
      headers: headers('image/png'),
    })).toBe(false);
  });

  it('rejects an HTML body standing in for a removed chunk and keeps real scripts', () => {
    const script = { url: 'https://tradeoslive.web.app/assets/index-old.js' };
    expect(shouldRejectHtmlAsModule(script, htmlResponse())).toBe(true);
    expect(shouldRejectHtmlAsModule(script, htmlResponse('application/javascript'))).toBe(false);
    expect(shouldRejectHtmlAsModule(
      { url: 'https://tradeoslive.web.app/index.html' },
      htmlResponse(),
    )).toBe(false);
    expect(shouldRejectHtmlAsModule(
      { url: 'https://tradeoslive.web.app/logos/btc.png' },
      htmlResponse(),
    )).toBe(false);
  });

  it('fetches a document from the network and falls back to the cached shell only when offline', async () => {
    const put = vi.fn();
    const caches = {
      open: vi.fn(() => Promise.resolve({ put })),
      match: vi.fn(async () => new Response('cached-shell')),
    };
    const fetchMock = vi.fn(async () => new Response('fresh-html', { status: 200 }));
    const networkFirstDocument = extract(
      'async function networkFirstDocument',
      '// END networkFirstDocument',
      ['fetch', 'caches', 'CACHE_NAME', 'SHELL_URL'],
    )(fetchMock, caches, 'tradeos-test', '/index.html');

    const fresh = await networkFirstDocument({ url: 'https://tradeoslive.web.app/dashboard?x=1' });
    expect(await fresh.text()).toBe('fresh-html');
    expect(fetchMock).toHaveBeenCalledWith('https://tradeoslive.web.app/dashboard?x=1', {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
    });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('/index.html');

    fetchMock.mockRejectedValueOnce(new TypeError('Load failed'));
    const offline = await networkFirstDocument({ url: 'https://tradeoslive.web.app/' });
    expect(await offline.text()).toBe('cached-shell');
    expect(caches.match).toHaveBeenCalledWith('/index.html');

    caches.match.mockResolvedValueOnce(undefined);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const empty = await networkFirstDocument({ url: 'https://tradeoslive.web.app/index.html' });
    expect(empty.status).toBe(503);

    const opens = caches.open.mock.calls.length;
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const missing = await networkFirstDocument({ url: 'https://tradeoslive.web.app/index.html' });
    expect(missing.status).toBe(404);
    expect(caches.open.mock.calls.length).toBe(opens);
  });
});
