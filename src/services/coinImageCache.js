const CACHE_KEY = 'tradeos_coin_images';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (image URLs are stable)

// Non-crypto assets — hosted locally in /public/icons/
const MANUAL_ICONS = {
  XAU: '/icons/xau.svg',
};

// Hardcoded CoinGecko CDN URLs for the most common trading coins.
// These are STATIC assets on CoinGecko's CDN — no API key or rate limit.
// Serves as permanent fallback even when the API is unavailable.
const STATIC_ICONS = {
  BTC:    'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH:    'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL:    'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  BNB:    'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  XRP:    'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  DOGE:   'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  ADA:    'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  AVAX:   'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  DOT:    'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
  LINK:   'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  MATIC:  'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
  POL:    'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
  SHIB:   'https://assets.coingecko.com/coins/images/11939/small/shiba.png',
  TRX:    'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  SUI:    'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg',
  PEPE:   'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg',
  WIF:    'https://assets.coingecko.com/coins/images/33566/small/dogwifhat.jpg',
  NEAR:   'https://assets.coingecko.com/coins/images/10365/small/near.jpg',
  APT:    'https://assets.coingecko.com/coins/images/26455/small/aptos_round.png',
  ARB:    'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  OP:     'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
  ATOM:   'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png',
  LTC:    'https://assets.coingecko.com/coins/images/2/small/litecoin.png',
  UNI:    'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
  FTM:    'https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png',
  FET:    'https://assets.coingecko.com/coins/images/5681/small/Fetch.jpg',
  INJ:    'https://assets.coingecko.com/coins/images/12882/small/Secondary_Symbol.png',
  SEI:    'https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png',
  TIA:    'https://assets.coingecko.com/coins/images/31967/small/tia.jpg',
  RENDER: 'https://assets.coingecko.com/coins/images/11636/small/rndr.png',
  RNDR:   'https://assets.coingecko.com/coins/images/11636/small/rndr.png',
  ETC:    'https://assets.coingecko.com/coins/images/453/small/ethereum-classic-logo.png',
  FIL:    'https://assets.coingecko.com/coins/images/12817/small/filecoin.png',
  GRT:    'https://assets.coingecko.com/coins/images/13397/small/Graph_Token.png',
  AAVE:   'https://assets.coingecko.com/coins/images/12645/small/AAVE.png',
  MKR:    'https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png',
  SAND:   'https://assets.coingecko.com/coins/images/12129/small/sandbox_logo.jpg',
  MANA:   'https://assets.coingecko.com/coins/images/878/small/decentraland-mana.png',
  AXS:    'https://assets.coingecko.com/coins/images/13029/small/axie_infinity_logo.png',
  GALA:   'https://assets.coingecko.com/coins/images/12493/small/GALA-COINGECKO.png',
  POPCAT: 'https://assets.coingecko.com/coins/images/34884/small/popcat.jpeg',
  BONK:   'https://assets.coingecko.com/coins/images/28600/small/bonk.jpg',
  FLOKI:  'https://assets.coingecko.com/coins/images/16746/small/PNG_image.png',
  TRUMP:  'https://assets.coingecko.com/coins/images/52878/small/trump.png',
  KAITO:  'https://assets.coingecko.com/coins/images/53885/small/kaito-icon-200x200.png',
  MOODENG:'https://assets.coingecko.com/coins/images/51667/small/moodeng.jpeg',
  PENGU:  'https://assets.coingecko.com/coins/images/52716/small/pengu.png',
  JUP:    'https://assets.coingecko.com/coins/images/34188/small/jup.png',
  PYTH:   'https://assets.coingecko.com/coins/images/31924/small/pyth.png',
  JTO:    'https://assets.coingecko.com/coins/images/33769/small/jto.png',
  W:      'https://assets.coingecko.com/coins/images/35251/small/W.png',
  STRK:   'https://assets.coingecko.com/coins/images/26433/small/starknet.png',
  EIGEN:  'https://assets.coingecko.com/coins/images/33069/small/eigen.png',
  ZK:     'https://assets.coingecko.com/coins/images/38043/small/ZKTokenBlack.png',
  IO:     'https://assets.coingecko.com/coins/images/38110/small/io.png',
  ORDER:  'https://assets.coingecko.com/coins/images/34963/small/order.png',
  NOT:    'https://assets.coingecko.com/coins/images/35620/small/not.png',
  DOGS:   'https://assets.coingecko.com/coins/images/37289/small/DOGS.png',
  HMSTR:  'https://assets.coingecko.com/coins/images/38741/small/hamster_kombat.png',
  CATI:   'https://assets.coingecko.com/coins/images/37419/small/cati.png',
  MAJOR:  'https://assets.coingecko.com/coins/images/38699/small/major.png',
  TAO:    'https://assets.coingecko.com/coins/images/28452/small/ARUsPeNQ_400x400.jpeg',
  WLD:    'https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg',
  CFX:    'https://assets.coingecko.com/coins/images/13079/small/3vuYMbjN.png',
  KAIA:   'https://assets.coingecko.com/coins/images/9672/small/klaytn.png',
  BLUR:   'https://assets.coingecko.com/coins/images/28453/small/blur.png',
  MAGIC:  'https://assets.coingecko.com/coins/images/18623/small/magic.png',
  IMX:    'https://assets.coingecko.com/coins/images/17233/small/immutableX-symbol-BLK-RGB.png',
  MANTA:  'https://assets.coingecko.com/coins/images/34289/small/manta.png',
  PIXEL:  'https://assets.coingecko.com/coins/images/34289/small/manta.png',
};

let memoryCache = null;
let fetchPromise = null;

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const { data, ts } = JSON.parse(stored);
      if (Date.now() - ts < CACHE_DURATION) {
        memoryCache = data;
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

function saveToStorage() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: memoryCache, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getCachedImage(symbol) {
  const key = symbol.toUpperCase();
  if (MANUAL_ICONS[key]) return MANUAL_ICONS[key];
  if (STATIC_ICONS[key]) return STATIC_ICONS[key]; // always available
  if (!memoryCache) loadFromStorage();
  return memoryCache?.[key] || null;
}

export function cacheImage(symbol, url) {
  if (!memoryCache) {
    loadFromStorage();
    if (!memoryCache) memoryCache = {};
  }
  memoryCache[symbol.toUpperCase()] = url;
  saveToStorage();
}

export function clearCachedImage(symbol) {
  if (!memoryCache) {
    loadFromStorage();
    if (!memoryCache) return;
  }
  delete memoryCache[symbol.toUpperCase()];
  saveToStorage();
}

export async function prefetchCoinImages() {
  // If we have fresh cache with many entries, skip re-fetch
  if (memoryCache && Object.keys(memoryCache).length > 50) return memoryCache;
  if (loadFromStorage() && Object.keys(memoryCache).length > 50) return memoryCache;

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL || '';
      const base = workerUrl
        ? `${workerUrl}/cg/coins/markets`
        : 'https://api.coingecko.com/api/v3/coins/markets';
      const params = 'vs_currency=usd&order=market_cap_desc&per_page=250';

      // Seed with static icons first so we always have the common ones
      if (!memoryCache) memoryCache = { ...STATIC_ICONS };

      const [res1, res2] = await Promise.allSettled([
        fetch(`${base}?${params}&page=1`),
        fetch(`${base}?${params}&page=2`),
      ]);

      let fetched = 0;
      for (const result of [res1, res2]) {
        if (result.status === 'fulfilled' && result.value.ok) {
          const coins = await result.value.json();
          coins.forEach((c) => {
            const img = c.image?.replace('/large/', '/small/');
            if (img) { memoryCache[c.symbol.toUpperCase()] = img; fetched++; }
          });
        }
      }

      if (fetched > 0) saveToStorage(); // only save if we actually got new data
    } catch {
      // If fetch fails, at least STATIC_ICONS are already seeded
      if (!memoryCache) memoryCache = { ...STATIC_ICONS };
    }
    fetchPromise = null;
    return memoryCache;
  })();

  return fetchPromise;
}
