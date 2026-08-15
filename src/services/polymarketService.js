// Polymarket public-data client (read-only, no auth, no private keys).
// The Data API sends `access-control-allow-origin: *`, so the browser calls it
// directly. The API returns camelCase; we normalize to a stable internal shape
// here so the rest of the app never depends on their field names — and we
// sanitize every external URL (image/link) through the app's safeHttpUrl guard
// at this boundary, so nothing downstream ever renders a raw untrusted url.
import { POLYMARKET as C } from '../config/polymarket';
import { safeHttpUrl } from '../utils/urls';

// A wallet is an EVM address; keep only well-formed ones so links/keys are sound.
const isAddress = (w) => typeof w === 'string' && /^0x[0-9a-fA-F]{40}$/.test(w);

async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Polymarket ${res.status}`);
  return res.json();
}

function normalizeLeaderboardRow(r) {
  // userName is often just the wallet address with a suffix — treat that as "no name".
  const uname = typeof r.userName === 'string' ? r.userName : '';
  const hasRealName = uname && !uname.toLowerCase().startsWith('0x');
  return {
    rank: Number(r.rank) || null,
    wallet: r.proxyWallet,
    name: hasRealName ? uname : null,
    xUsername: r.xUsername || null,
    verified: !!r.verifiedBadge,
    volume: Number(r.vol) || 0,
    pnl: Number(r.pnl) || 0,
    profileImage: safeHttpUrl(r.profileImage) || null,
  };
}

// Leaderboard is hard-capped at 50 rows/call — paginate via offset up to `top`.
// Drops malformed wallets and de-dupes by wallet (defensive: keeps React keys
// unique even if a wallet surfaces on two pages).
export async function fetchLeaderboard({ top = C.LEADERBOARD_TOP, category = 'overall', signal } = {}) {
  const pages = Math.ceil(top / C.LEADERBOARD_PAGE);
  const seen = new Set();
  const out = [];
  for (let p = 0; p < pages; p++) {
    const offset = p * C.LEADERBOARD_PAGE;
    const limit = Math.min(C.LEADERBOARD_PAGE, top - offset);
    const url = `${C.DATA_API}/v1/leaderboard`
      + `?timePeriod=${C.TIME_PERIOD}&orderBy=PNL&limit=${limit}&offset=${offset}`
      + `&category=${encodeURIComponent(category)}`;
    const rows = await getJson(url, { signal }); // sequential: offset pagination
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      if (!isAddress(r.proxyWallet) || seen.has(r.proxyWallet)) continue;
      seen.add(r.proxyWallet);
      out.push(normalizeLeaderboardRow(r));
    }
    if (rows.length < limit) break; // reached the end
  }
  return out;
}

function normalizePosition(p) {
  return {
    wallet: p.proxyWallet,
    conditionId: p.conditionId,
    title: p.title || p.slug || '—',
    slug: p.slug || null,
    eventSlug: p.eventSlug || null,
    icon: safeHttpUrl(p.icon) || null,
    outcome: p.outcome,
    size: Number(p.size) || 0,
    avgPrice: Number(p.avgPrice) || 0,
    curPrice: Number(p.curPrice) || 0,
    initialValue: Number(p.initialValue) || 0,
    currentValue: Number(p.currentValue) || 0,
    cashPnl: Number(p.cashPnl) || 0,
    percentPnl: Number(p.percentPnl) || 0,
    realizedPnl: Number(p.realizedPnl) || 0,
    redeemable: !!p.redeemable,
    endDate: p.endDate || null,
  };
}

// Current open/closed positions for a wallet — the rich per-market detail.
export async function fetchPositions(wallet, { limit = 100, signal } = {}) {
  if (!isAddress(wallet)) return [];
  const url = `${C.DATA_API}/positions?user=${encodeURIComponent(wallet)}&limit=${limit}`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : []).map(normalizePosition);
}

function normalizeActivity(a) {
  return {
    id: a.transactionHash ? `${a.transactionHash}-${a.conditionId}-${a.outcomeIndex ?? ''}` : `${a.conditionId}-${a.timestamp}`,
    type: a.type || 'TRADE',        // TRADE / REDEEM / SPLIT / MERGE …
    side: a.side || null,           // BUY / SELL
    size: Number(a.size) || 0,
    price: Number(a.price) || 0,
    usdcSize: Number(a.usdcSize) || 0,
    title: a.title || a.slug || '—',
    slug: a.slug || null,
    eventSlug: a.eventSlug || null,
    icon: safeHttpUrl(a.icon) || null,
    outcome: a.outcome || null,
    outcomeIndex: a.outcomeIndex ?? null,
    conditionId: a.conditionId,
    timestamp: Number(a.timestamp) || 0, // unix seconds
  };
}

// A wallet's full chronological trade history (BUY/SELL/redeem…) — how it
// actually trades, not just what it holds now.
export async function fetchActivity(wallet, { limit = 100, signal } = {}) {
  if (!isAddress(wallet)) return [];
  const url = `${C.DATA_API}/activity?user=${encodeURIComponent(wallet)}&limit=${limit}`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : []).map(normalizeActivity);
}

// Profile link on Polymarket. Fixed https origin + validated address → the href
// can never be turned into a javascript:/data: scheme or leave polymarket.com.
export function profileUrl(wallet) {
  return isAddress(wallet) ? `${C.PROFILE_URL}/${wallet}` : null;
}
