// Which Worker responses the service worker must not put in Cache Storage.
// The cache is keyed by URL only, so an authenticated GET (open orders, fills,
// positions) would be replayed for the next account on this device when the
// network fails. public/sw.js keeps an equivalent copy; the unit test checks
// the two agree.

const WORKER_HOSTS = new Set([
  'trade-os.tradeos.workers.dev',
  'trade-os-staging.tradeos.workers.dev',
]);

function onWorkerHost(hostname) {
  return WORKER_HOSTS.has(hostname) || hostname.endsWith('.workers.dev');
}

// Paths that return per-user data. Listed as well as the Authorization header
// so a request is still treated as private if the header is not visible.
const PRIVATE_PREFIXES = ['/exchange/', '/hl/', '/admin/', '/push/', '/coupons/', '/api/'];
const PRIVATE_EXACT = new Set(['/notify-settings', '/ai-usage', '/candles', '/wallet']);

export function isPrivateWorkerRequest(url, hasAuthorization = false) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!onWorkerHost(parsed.hostname)) return false;
  if (hasAuthorization) return true;
  const path = parsed.pathname;
  if (PRIVATE_EXACT.has(path)) return true;
  return PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix));
}
