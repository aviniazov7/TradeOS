// Polymarket Money Radar — all tunable knobs live here (no hard-coding).
// These are initial calibration values; re-tune once real data is observed.
//
// Verified live (14.8.2026):
// - leaderboard is hard-capped at 50 rows/call → must paginate via offset.
// - the API sends `access-control-allow-origin: *`, so the browser can call it
//   directly (no proxy needed for the read-only MVP).
// - leaderboard timePeriod only supports `month` (no all-time) → smart money is
//   defined on a 30-day basis.
export const POLYMARKET = {
  DATA_API: 'https://data-api.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
  PROFILE_URL: 'https://polymarket.com/profile', // + /{wallet}

  LEADERBOARD_PAGE: 50,        // API hard max per call — do not raise
  LEADERBOARD_TOP: 200,        // how many top wallets the MVP board pulls (4 calls)
  TIME_PERIOD: 'month',        // only value the API supports

  // Scoring eligibility — separate skill from luck / noise.
  MIN_VOLUME: 10_000,          // real skin in the game
  MIN_RESOLVED: 20,            // enough closed markets (needs positions history — phase 2)

  // Discovery — a single position over this flags a wallet worth watching even
  // if it hasn't climbed the leaderboard yet (phase 2).
  DISCOVERY_MIN_POSITION: 25_000,

  // Sync tiers (phase 2 — server ingestion).
  TIER1_TOP: 1_000,
  TIER2_TOP: 5_000,

  CACHE_TTL_MS: 10 * 60 * 1000, // client cache for the leaderboard
};
