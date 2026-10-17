// TradingView links attached to a trade. A snapshot share
// (tradingview.com/x/<id>) maps to its public PNG. A chart URL is embedded.
// Anything else that is a direct image is shown as an image. Nothing else
// is turned into an iframe.

const SNAPSHOT_RE = /tradingview\.com\/x\/([A-Za-z0-9]+)/i;
const TV_HOST_RE = /^https:\/\/(?:www\.|s\.)?tradingview\.com\//i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

export function tradingViewSnapshotImage(url) {
  const raw = String(url || '').trim();
  if (!/^https:\/\//i.test(raw)) return null;
  if (IMAGE_RE.test(raw)) return raw;
  const m = raw.match(SNAPSHOT_RE);
  if (!m) return null;
  const id = m[1];
  return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
}

/** Chart pages embed. Snapshot pages do not — those have an image preview. */
export function tradingViewEmbedSrc(url) {
  const raw = String(url || '').trim();
  if (!TV_HOST_RE.test(raw)) return null;
  if (SNAPSHOT_RE.test(raw)) return null;
  return raw;
}
