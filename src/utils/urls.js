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
