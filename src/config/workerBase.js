// The Cloudflare Worker's base URL — ONE definition for the whole client.
//
// This used to be re-read from the environment in 17 places with two different
// fallbacks, and the three sites that fell back to '' each failed in their own
// silent way when VITE_WORKER_URL was missing at build time: the push call in
// PendingLimitOrders POSTed to a relative path and 404'd, MarketOverview
// switched to calling CoinGecko directly and hit its rate limit, and the coin
// image cache did the same. One build-env mistake produced three unrelated,
// hard-to-diagnose symptoms instead of one obvious failure.
//
// Never point this at trade-os-staging.workers.dev: per CLAUDE.md that hostname
// has no live deployment, and every wrangler deploy in this repo — staging flag
// included — lands on the production `trade-os` Worker.
export const WORKER_BASE =
  import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';

export default WORKER_BASE;
