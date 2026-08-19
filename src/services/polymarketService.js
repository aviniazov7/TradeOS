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
export async function fetchLeaderboard({ top = C.LEADERBOARD_TOP, from = 0, category = 'overall', signal } = {}) {
  const pages = Math.ceil((top - from) / C.LEADERBOARD_PAGE);
  const seen = new Set();
  const out = [];
  for (let p = 0; p < pages; p++) {
    const offset = from + p * C.LEADERBOARD_PAGE;
    const limit = Math.min(C.LEADERBOARD_PAGE, top - offset);
    if (limit <= 0) break;
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

function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
}

// A conditionId is a 32-byte hex hash — validate before using it in URLs/keys.
const isConditionId = (c) => typeof c === 'string' && /^0x[0-9a-fA-F]{64}$/.test(c);

function normalizeMarket(m) {
  const outcomes = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices).map((p) => Number(p) || 0);
  const sum = prices.reduce((s, p) => s + p, 0);
  return {
    id: m.id,
    conditionId: m.conditionId,
    question: m.question || '—',
    slug: m.slug || null,
    eventSlug: m.events?.[0]?.slug || null,
    icon: safeHttpUrl(m.icon || m.image) || null,
    outcomes,
    prices,
    priceSum: sum,                               // ≠1 on a binary market → mispricing gap
    volume24hr: Number(m.volume24hr) || 0,
    liquidity: Number(m.liquidityNum ?? m.liquidity) || 0,
    spread: Number(m.spread) || 0,
    oneDayChange: Number(m.oneDayPriceChange) || 0,
    endDate: m.endDate || null,
    isNew: !!m.new,
  };
}

// A market is only usable if it has a price per outcome — one whose
// outcomePrices didn't parse would render 0% and a false "gap 100¢" badge.
const isUsableMarket = (m) => isConditionId(m.conditionId)
  && m.outcomes.length >= 2
  && m.prices.length === m.outcomes.length;

// Open markets from the Gamma API (CORS-open, verified live). Ordered
// server-side; the explorer re-sorts/filters client-side on this set.
export async function fetchMarkets({ limit = 60, order = 'volume24hr', signal } = {}) {
  const url = `${C.GAMMA_API}/markets?closed=false&active=true&limit=${limit}`
    + `&order=${encodeURIComponent(order)}&ascending=false`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : []).map(normalizeMarket).filter(isUsableMarket);
}

// One market by conditionId — lets the market page survive a refresh or a
// shared link instead of bouncing back to the board (verified: gamma supports
// ?condition_ids= and returns an exact single match).
export async function fetchMarketByCondition(conditionId, { signal } = {}) {
  if (!isConditionId(conditionId)) return null;
  const url = `${C.GAMMA_API}/markets?condition_ids=${conditionId}`;
  const rows = await getJson(url, { signal });
  const m = (Array.isArray(rows) ? rows : []).map(normalizeMarket).find(isUsableMarket);
  return m || null;
}

// Who holds a market — one entry per outcome token, holders sorted by amount.
// The raw holder rows carry profile fields; keep only what we render.
export async function fetchHolders(conditionId, { signal } = {}) {
  if (!isConditionId(conditionId)) return [];
  const url = `${C.DATA_API}/holders?market=${conditionId}&limit=20`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : []).map((t) => ({
    token: t.token,
    holders: (Array.isArray(t.holders) ? t.holders : [])
      .filter((h) => isAddress(h.proxyWallet))
      .map((h) => ({
        wallet: h.proxyWallet,
        name: h.name || h.pseudonym || null,
        profileImage: safeHttpUrl(h.profileImageOptimized || h.profileImage) || null,
        amount: Number(h.amount) || 0,
        outcomeIndex: Number.isInteger(h.outcomeIndex) ? h.outcomeIndex : null,
      })),
  }));
}

// Market page on Polymarket (fixed https origin + slug-encoded).
export function marketUrl(eventSlug, slug) {
  const s = eventSlug || slug;
  return s ? `https://polymarket.com/event/${encodeURIComponent(s)}` : null;
}

function normalizeTrade(t) {
  const size = Number(t.size) || 0;
  const price = Number(t.price) || 0;
  return {
    // txHash makes fills unique — a whale sweep split across fills in the same
    // second/side would otherwise collapse into one row in the radar's dedup.
    id: `${t.transactionHash || 'n'}-${t.proxyWallet}-${t.conditionId}-${t.timestamp}-${t.side}-${t.size}`,
    wallet: t.proxyWallet,
    name: (typeof t.name === 'string' && t.name && !t.name.toLowerCase().startsWith('0x')) ? t.name : null,
    side: t.side || null,               // BUY / SELL
    size,
    price,
    usd: size * price,                  // /trades has no usdcSize — derive it
    title: t.title || t.slug || '—',
    slug: t.slug || null,
    eventSlug: t.eventSlug || null,
    icon: safeHttpUrl(t.icon) || null,
    outcome: t.outcome || null,
    conditionId: t.conditionId,
    timestamp: Number(t.timestamp) || 0,
  };
}

// The live tape — recent trades across all of Polymarket (the whale radar
// polls this and filters by $ size client-side).
export async function fetchTrades({ limit = 100, signal } = {}) {
  const url = `${C.DATA_API}/trades?limit=${limit}`;
  const rows = await getJson(url, { signal });
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeTrade)
    .filter((t) => isAddress(t.wallet));
}

// Profile link on Polymarket. Fixed https origin + validated address → the href
// can never be turned into a javascript:/data: scheme or leave polymarket.com.
export function profileUrl(wallet) {
  return isAddress(wallet) ? `${C.PROFILE_URL}/${wallet}` : null;
}
