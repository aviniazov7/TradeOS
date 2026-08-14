// Polymarket public-data client (read-only, no auth, no private keys).
// The Data API sends `access-control-allow-origin: *`, so the browser calls it
// directly. The API returns camelCase; we normalize to a stable internal shape
// here so the rest of the app never depends on their field names.
import { POLYMARKET as C } from '../config/polymarket';

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
    profileImage: r.profileImage || null,
  };
}

// Leaderboard is hard-capped at 50 rows/call — paginate via offset up to `top`.
export async function fetchLeaderboard({ top = C.LEADERBOARD_TOP, category = 'overall', signal } = {}) {
  const pages = Math.ceil(top / C.LEADERBOARD_PAGE);
  const out = [];
  for (let p = 0; p < pages; p++) {
    const offset = p * C.LEADERBOARD_PAGE;
    const limit = Math.min(C.LEADERBOARD_PAGE, top - offset);
    const url = `${C.DATA_API}/v1/leaderboard`
      + `?timePeriod=${C.TIME_PERIOD}&orderBy=PNL&limit=${limit}&offset=${offset}`
      + `&category=${encodeURIComponent(category)}`;
    const rows = await getJson(url, { signal }); // sequential: offset pagination
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < limit) break; // reached the end
  }
  return out.map(normalizeLeaderboardRow);
}

function normalizePosition(p) {
  return {
    wallet: p.proxyWallet,
    conditionId: p.conditionId,
    title: p.title || p.slug || '—',
    slug: p.slug || null,
    eventSlug: p.eventSlug || null,
    icon: p.icon || null,
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
  if (!wallet) return [];
  const url = `${C.DATA_API}/positions?user=${encodeURIComponent(wallet)}&limit=${limit}`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : []).map(normalizePosition);
}

export function profileUrl(wallet) {
  return wallet ? `${C.PROFILE_URL}/${wallet}` : null;
}
