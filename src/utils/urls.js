// URL sanitizing shared across the app.
//
// Any URL that originates from user input (TradingView chart links) or from a
// third-party feed ends up rendered as <a href> / <img src>. React renders
// javascript:/data: hrefs as-is (it only logs a warning), and <input
// type="url"> happily accepts them — so every such href must pass through
// safeHttpUrl before rendering.

// Returns the trimmed URL when it is a plain http(s) link, null otherwise.
export function safeHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

// https only. Impact links are copied from a third-party JSON feed into a
// blob every signed-in user can open, so http and javascript: are dropped
// before they are stored.
export function httpsUrl(url) {
  if (typeof url !== 'string') return '';
  const t = url.trim();
  return /^https:\/\//i.test(t) ? t : '';
}
