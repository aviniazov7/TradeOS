// Notification clicks must stay inside the app. Absolute URLs, protocol-relative
// URLs, and backslashes (which the URL parser turns into a different host) are
// replaced with the app root. The returned value is always a path.

const BASE = 'https://tradeoslive.web.app/';

export function safeNotificationPath(raw) {
  if (typeof raw !== 'string') return '/';
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes(':')) return '/';
  try {
    const url = new URL(path, BASE);
    if (url.origin !== 'https://tradeoslive.web.app') return '/';
    const out = `${url.pathname}${url.search}${url.hash}`;
    if (!out.startsWith('/') || out.startsWith('//')) return '/';
    return out;
  } catch {
    return '/';
  }
}
