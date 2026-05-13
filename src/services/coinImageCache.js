const CACHE_KEY = 'tradeos_coin_images';
const CACHE_VERSION = 6; // bump to invalidate stale localStorage with wrong URLs
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
  POPCAT: 'https://coin-images.coingecko.com/coins/images/33760/small/image.jpg',
  BONK:   'https://assets.coingecko.com/coins/images/28600/small/bonk.jpg',
  FLOKI:  'https://assets.coingecko.com/coins/images/16746/small/PNG_image.png',
  TRUMP:  'https://coin-images.coingecko.com/coins/images/53746/small/trump.png',
  KAITO:  'https://coin-images.coingecko.com/coins/images/54411/small/Qm4DW488_400x400.jpg',
  MOODENG:'https://coin-images.coingecko.com/coins/images/50264/small/MOODENG.jpg',
  PENGU:  'https://coin-images.coingecko.com/coins/images/52622/small/PUDGY_PENGUINS_PENGU_PFP.png',
  JUP:    'https://coin-images.coingecko.com/coins/images/34188/small/jup.png',
  PYTH:   'https://coin-images.coingecko.com/coins/images/31924/small/pyth.png',
  JTO:    'https://coin-images.coingecko.com/coins/images/33228/small/jto.png',
  W:      'https://coin-images.coingecko.com/coins/images/35087/small/W_Token_%283%29.png',
  STRK:   'https://assets.coingecko.com/coins/images/26433/small/starknet.png',
  EIGEN:  'https://coin-images.coingecko.com/coins/images/37441/small/eigencloud.jpg',
  ZK:     'https://assets.coingecko.com/coins/images/38043/small/ZKTokenBlack.png',
  IO:     'https://coin-images.coingecko.com/coins/images/37754/small/io_blackbg.png',
  ORDER:  'https://coin-images.coingecko.com/coins/images/38501/small/Orderly_Network_Coingecko_200%2A200.png',
  NOT:    'https://coin-images.coingecko.com/coins/images/33453/small/rFmThDiD_400x400.jpg',
  DOGS:   'https://coin-images.coingecko.com/coins/images/39699/small/dogs_logo_200x200.png',
  HMSTR:  'https://coin-images.coingecko.com/coins/images/39102/small/hamster-removebg-preview.png',
  CATI:   'https://coin-images.coingecko.com/coins/images/50236/small/cati.png',
  MAJOR:  'https://coin-images.coingecko.com/coins/images/51362/small/PW838Bvn_400x400.jpg',
  TAO:    'https://assets.coingecko.com/coins/images/28452/small/ARUsPeNQ_400x400.jpeg',
  WLD:    'https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg',
  CFX:    'https://assets.coingecko.com/coins/images/13079/small/3vuYMbjN.png',
  KAIA:   'https://assets.coingecko.com/coins/images/9672/small/klaytn.png',
  BLUR:   'https://assets.coingecko.com/coins/images/28453/small/blur.png',
  MAGIC:  'https://assets.coingecko.com/coins/images/18623/small/magic.png',
  IMX:    'https://assets.coingecko.com/coins/images/17233/small/immutableX-symbol-BLK-RGB.png',
  MANTA:  'https://coin-images.coingecko.com/coins/images/34289/small/manta.jpg',
  PIXEL:  'https://coin-images.coingecko.com/coins/images/35100/small/pixel-icon.png',
  // Additional commonly-traded coins
  TON:    'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png',
  STX:    'https://assets.coingecko.com/coins/images/2069/small/Stacks_logo_full.png',
  HIVE:   'https://assets.coingecko.com/coins/images/10840/small/logo_transparent_4x.png',
  ZEC:    'https://assets.coingecko.com/coins/images/486/small/circle-zcash-color.png',
  VET:    'https://assets.coingecko.com/coins/images/1167/small/VeChain-Logo-768x768.png',
  LUNC:   'https://assets.coingecko.com/coins/images/25477/small/LUNC.png',
  XLM:    'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png',
  EOS:    'https://assets.coingecko.com/coins/images/738/small/eos-eos-logo.png',
  XTZ:    'https://assets.coingecko.com/coins/images/2011/small/tezos.png',
  ALGO:   'https://assets.coingecko.com/coins/images/4030/small/Algorand.png',
  NEO:    'https://assets.coingecko.com/coins/images/440/small/NEO_512_512.png',
  DASH:   'https://assets.coingecko.com/coins/images/5/small/dash.png',
  IOTA:   'https://assets.coingecko.com/coins/images/3718/small/iota.png',
  MIOTA:  'https://assets.coingecko.com/coins/images/3718/small/iota.png',
  CHZ:    'https://assets.coingecko.com/coins/images/9479/small/Chiliz.png',
  ENJ:    'https://assets.coingecko.com/coins/images/1102/small/enjin-coin-logo.png',
  ONT:    'https://assets.coingecko.com/coins/images/3447/small/ONT.png',
  ZIL:    'https://assets.coingecko.com/coins/images/2687/small/Zilliqa-logo.png',
  WAVES:  'https://assets.coingecko.com/coins/images/357/small/waves.png',
  THETA:  'https://assets.coingecko.com/coins/images/2538/small/theta-token-logo.png',
  VGX:    'https://assets.coingecko.com/coins/images/794/small/Voyager-vgx.png',
  HOT:    'https://assets.coingecko.com/coins/images/3380/small/Holo_coin.png',
  BTT:    'https://assets.coingecko.com/coins/images/10868/small/btt_logo.png',
  LUNA:   'https://assets.coingecko.com/coins/images/25767/small/01_Luna_color.png',
  CRV:    'https://assets.coingecko.com/coins/images/12124/small/Curve.png',
  SNX:    'https://assets.coingecko.com/coins/images/3406/small/SNX.png',
  COMP:   'https://assets.coingecko.com/coins/images/10775/small/COMP.png',
  BAT:    'https://assets.coingecko.com/coins/images/677/small/basic-attention-token.png',
  ZRX:    'https://assets.coingecko.com/coins/images/863/small/0x.png',
  ICX:    'https://assets.coingecko.com/coins/images/1060/small/icon-icx-logo.png',
  '1INCH': 'https://assets.coingecko.com/coins/images/13469/small/1inch-token.png',
  CKB:    'https://assets.coingecko.com/coins/images/9566/small/Nervos_White.png',
  JASMY:  'https://assets.coingecko.com/coins/images/13876/small/JASMY200x200.jpg',
  AGIX:   'https://assets.coingecko.com/coins/images/2798/small/SingularityNET.png',
  ACH:    'https://assets.coingecko.com/coins/images/13119/small/ACH_token_logo.png',
  // Large-cap & well-known
  BCH:    'https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png',
  XMR:    'https://assets.coingecko.com/coins/images/69/small/monero_logo.png',
  HBAR:   'https://assets.coingecko.com/coins/images/3714/small/HBAR.png',
  EGLD:   'https://assets.coingecko.com/coins/images/6892/small/multiversx-x-egld-logo.png',
  MVX:    'https://assets.coingecko.com/coins/images/6892/small/multiversx-x-egld-logo.png',
  RUNE:   'https://assets.coingecko.com/coins/images/6537/small/rune.png',
  ICP:    'https://assets.coingecko.com/coins/images/14495/small/Internet_Computer_logo.png',
  FLOW:   'https://assets.coingecko.com/coins/images/13446/small/5f6294c0c7a8cda55cb1c936_Flow_Wordmark.png',
  KSM:    'https://assets.coingecko.com/coins/images/9568/small/m4zRhP5e_400x400.jpg',
  KAVA:   'https://assets.coingecko.com/coins/images/9761/small/kava.png',
  ONE:    'https://assets.coingecko.com/coins/images/4344/small/Y88JAze.png',
  ROSE:   'https://assets.coingecko.com/coins/images/13490/small/rose.png',
  AR:     'https://assets.coingecko.com/coins/images/4343/small/oRt6SiEN_400x400.jpg',
  DYDX:   'https://assets.coingecko.com/coins/images/17500/small/hjnIm9bV.jpg',
  HNT:    'https://assets.coingecko.com/coins/images/4284/small/Helium_HNT.png',
  CELO:   'https://assets.coingecko.com/coins/images/11090/small/InjXBNx9_400x400.jpg',
  // DeFi
  SUSHI:  'https://assets.coingecko.com/coins/images/12271/small/512x512_Logo_no_chop.png',
  YFI:    'https://assets.coingecko.com/coins/images/11172/small/yearn.png',
  BAL:    'https://assets.coingecko.com/coins/images/11683/small/Balancer.png',
  LRC:    'https://assets.coingecko.com/coins/images/1558/small/loopring.png',
  KNC:    'https://assets.coingecko.com/coins/images/14899/small/RwdVsGcw_400x400.jpg',
  BAND:   'https://assets.coingecko.com/coins/images/9545/small/Band_token_blue_violet_token.png',
  NMR:    'https://assets.coingecko.com/coins/images/752/small/numeraire.png',
  REN:    'https://assets.coingecko.com/coins/images/6825/small/Ren.png',
  OCEAN:  'https://assets.coingecko.com/coins/images/3722/small/ocean-protocol-logo.jpg',
  STORJ:  'https://assets.coingecko.com/coins/images/949/small/storj.png',
  ZRX:    'https://assets.coingecko.com/coins/images/863/small/0x.png',
  PERP:   'https://assets.coingecko.com/coins/images/12381/small/60d18e06844a844ad75901a9_mark_only_03.png',
  CTSI:   'https://assets.coingecko.com/coins/images/11038/small/cartesi.png',
  ANKR:   'https://assets.coingecko.com/coins/images/8308/small/ankr.png',
  // Exchange tokens & ecosystem
  CAKE:   'https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo_%281%29.png',
  TWT:    'https://assets.coingecko.com/coins/images/11085/small/Trust.png',
  XVS:    'https://assets.coingecko.com/coins/images/12677/small/download.jpg',
  AUDIO:  'https://assets.coingecko.com/coins/images/12913/small/AudiusCoinLogo_2x.png',
  LPT:    'https://assets.coingecko.com/coins/images/7137/small/logo-circle-green.png',
  ALICE:  'https://assets.coingecko.com/coins/images/14375/small/alice_logo.jpg',
  TLM:    'https://assets.coingecko.com/coins/images/14676/small/kY-C4o7RThfiy7haAF_WGw.png',
  REEF:   'https://assets.coingecko.com/coins/images/13504/small/Group_10572.png',
  QUICK:  'https://assets.coingecko.com/coins/images/13970/small/1_pOU6pBMEmiL-ZJVb0CYRjQ.png',
  C98:    'https://assets.coingecko.com/coins/images/17117/small/logo.png',
  // Old-gen layer-1
  LSK:    'https://assets.coingecko.com/coins/images/385/small/Lisk_symbol_-_transparent_background.png',
  SC:     'https://assets.coingecko.com/coins/images/289/small/siacoin.png',
  NANO:   'https://assets.coingecko.com/coins/images/756/small/nano-coin-logo.png',
  STEEM:  'https://assets.coingecko.com/coins/images/398/small/steem.png',
  ARDR:   'https://assets.coingecko.com/coins/images/392/small/ardor.png',
  QTUM:   'https://assets.coingecko.com/coins/images/684/small/qtum.png',
  XEM:    'https://assets.coingecko.com/coins/images/241/small/nem-logo-100x100.jpg',
  IOST:   'https://assets.coingecko.com/coins/images/2523/small/IOST.png',
  WAN:    'https://assets.coingecko.com/coins/images/3277/small/Wanchain-circle.png',
  DGB:    'https://assets.coingecko.com/coins/images/63/small/digibyte.png',
  ICX:    'https://assets.coingecko.com/coins/images/1060/small/icon-icx-logo.png',
  DENT:   'https://assets.coingecko.com/coins/images/1152/small/gLCEA4D.png',
  FUN:    'https://assets.coingecko.com/coins/images/761/small/funfair.png',
  BTG:    'https://assets.coingecko.com/coins/images/1043/small/bitcoin-gold-logo.png',
  // Gaming / NFT
  IMX:    'https://assets.coingecko.com/coins/images/17233/small/immutableX-symbol-BLK-RGB.png',
  // Newer popular coins
  SUI:    'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg',
  PYTH:   'https://assets.coingecko.com/coins/images/31924/small/pyth.png',
  TIA:    'https://assets.coingecko.com/coins/images/31967/small/tia.jpg',
  SEI:    'https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png',
  ONDO:   'https://assets.coingecko.com/coins/images/26580/small/ONDO.png',
  PENDLE: 'https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png',
  BRETT:  'https://coin-images.coingecko.com/coins/images/35529/small/1000050750.png',
  MOG:    'https://assets.coingecko.com/coins/images/31059/small/MOG_LOGO_200x200.png',
  TURBO:  'https://assets.coingecko.com/coins/images/30223/small/turbotoad.jpeg',
  MEW:    'https://coin-images.coingecko.com/coins/images/36440/small/MEW.png',
  NEIRO:  'https://coin-images.coingecko.com/coins/images/39488/small/neiro.jpg',
  POL:    'https://assets.coingecko.com/coins/images/32440/small/polygon.png',
  PONKE:  'https://coin-images.coingecko.com/coins/images/33929/small/ponke-logo.png',
  VIRTUAL:'https://coin-images.coingecko.com/coins/images/34057/small/LOGOMARK.png',
  AI16Z:  'https://coin-images.coingecko.com/coins/images/51090/small/AI16Z.jpg',
  GOAT:   'https://coin-images.coingecko.com/coins/images/50717/small/GOAT_LOGO_NEW.jpg',
  ZEREBRO:'https://coin-images.coingecko.com/coins/images/51289/small/zerebro_2.png',
  ACT:    'https://coin-images.coingecko.com/coins/images/50984/small/ai_prophecy.jpg',
  PNUT:   'https://coin-images.coingecko.com/coins/images/51301/small/Peanut_the_Squirrel.png',
  MOVE:   'https://coin-images.coingecko.com/coins/images/39345/small/movement-testnet-token.png',
  ME:     'https://coin-images.coingecko.com/coins/images/39850/small/_ME_Profile_Dark_2x.png',
  USUAL:  'https://coin-images.coingecko.com/coins/images/51091/small/USUAL.jpg',
  // 2024-2025 popular coins
  HYPE:   'https://coin-images.coingecko.com/coins/images/50882/small/hyperliquid.jpg',
  ENA:    'https://coin-images.coingecko.com/coins/images/36530/small/ethena.png',
  ETHFI:  'https://coin-images.coingecko.com/coins/images/35958/small/etherfi.jpeg',
  REZ:    'https://coin-images.coingecko.com/coins/images/37327/small/renzo_200x200.png',
  OMNI:   'https://coin-images.coingecko.com/coins/images/36465/small/Symbol-Color.png',
  PIXEL:  'https://coin-images.coingecko.com/coins/images/35100/small/pixel-icon.png',
  PORTAL: 'https://coin-images.coingecko.com/coins/images/35436/small/portal.jpeg',
  SAGA:   'https://coin-images.coingecko.com/coins/images/25691/small/zcPXETKs_400x400.jpg',
  BB:     'https://coin-images.coingecko.com/coins/images/37144/small/bb.jpeg',
  LISTA:  'https://coin-images.coingecko.com/coins/images/38068/small/lista.png',
  AEVO:   'https://assets.coingecko.com/coins/images/26266/small/aevo.jpg',
  ALT:    'https://coin-images.coingecko.com/coins/images/34608/small/Logomark_200x200.png',
  BOME:   'https://coin-images.coingecko.com/coins/images/35855/small/bome.jpeg',
  DYM:    'https://assets.coingecko.com/coins/images/31911/small/dym.png',
  MEME:   'https://assets.coingecko.com/coins/images/29220/small/meme.jpg',
  MYRO:   'https://coin-images.coingecko.com/coins/images/33832/small/myro.jpeg',
  TNSR:   'https://coin-images.coingecko.com/coins/images/35972/small/tnsr.png',
  SLERF:  'https://coin-images.coingecko.com/coins/images/35777/small/slerf.jpeg',
  BEAM:   'https://assets.coingecko.com/coins/images/32417/small/beam.png',
  MANTA:  'https://assets.coingecko.com/coins/images/34289/small/manta.png',
};

let memoryCache = null;
let fetchPromise = null;
// True only after a successful API fetch (not just STATIC_ICONS seeding).
// Used to decide whether to retry on the next prefetch call.
let apiFetchSucceeded = false;
// Throttle retries when the API is failing — avoid hammering during a session.
let lastApiAttempt = 0;
const RETRY_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const { data, ts, v } = JSON.parse(stored);
      if (v === CACHE_VERSION && Date.now() - ts < CACHE_DURATION && data && Object.keys(data).length > 0) {
        memoryCache = data;
        // localStorage contains data that was saved after a successful API fetch
        apiFetchSucceeded = true;
        return true;
      }
      // Stale version or empty payload — clear it so we re-fetch correct URLs
      localStorage.removeItem(CACHE_KEY);
    }
  } catch { /* ignore */ }
  return false;
}

function saveToStorage() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: memoryCache, ts: Date.now(), v: CACHE_VERSION }));
  } catch { /* ignore */ }
}

export function hasKnownIcon(symbol) {
  const key = (symbol || '').toUpperCase();
  return !!(MANUAL_ICONS[key] || STATIC_ICONS[key]);
}

export function getCachedImage(symbol) {
  const key = symbol.toUpperCase();
  // 1. Manual overrides (local files, always correct)
  if (MANUAL_ICONS[key]) return MANUAL_ICONS[key];
  // 2. localStorage/memoryCache — API-fetched URLs take priority (more accurate than hardcoded)
  if (!memoryCache) loadFromStorage();
  if (memoryCache?.[key]) return memoryCache[key];
  // 3. STATIC_ICONS as last resort (hardcoded CDN URLs, may be stale for newer coins)
  return STATIC_ICONS[key] || null;
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

async function fetchMarketsFromBase(base) {
  const params = 'vs_currency=usd&order=market_cap_desc&per_page=250';
  const [res1, res2] = await Promise.allSettled([
    fetch(`${base}?${params}&page=1`),
    fetch(`${base}?${params}&page=2`),
  ]);
  let fetched = 0;
  for (const result of [res1, res2]) {
    if (result.status === 'fulfilled' && result.value.ok) {
      const coins = await result.value.json();
      if (!Array.isArray(coins)) continue;
      coins.forEach((c) => {
        const img = c.image?.replace('/large/', '/small/');
        if (img && !img.includes('missing_large')) {
          memoryCache[c.symbol.toUpperCase()] = img;
          fetched++;
        }
      });
    }
  }
  return fetched;
}

export async function prefetchCoinImages() {
  // Skip re-fetch only if we already got a successful API response. STATIC_ICONS
  // alone can satisfy the >50 entries check, which previously masked persistent
  // API failures and prevented retry for the rest of the session.
  if (apiFetchSucceeded && memoryCache && Object.keys(memoryCache).length > 50) return memoryCache;
  if (loadFromStorage() && apiFetchSucceeded && Object.keys(memoryCache).length > 50) return memoryCache;

  // Avoid hammering a failing API: throttle retry attempts.
  if (!apiFetchSucceeded && lastApiAttempt && Date.now() - lastApiAttempt < RETRY_BACKOFF_MS) {
    return memoryCache || {};
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    // Seed with static icons so we always have common coins
    if (!memoryCache) memoryCache = {};
    // Always merge STATIC_ICONS as baseline (don't overwrite API entries)
    for (const [k, v] of Object.entries(STATIC_ICONS)) {
      if (!memoryCache[k]) memoryCache[k] = v;
    }

    lastApiAttempt = Date.now();
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL || '';
      let fetched = 0;

      // 1. Try Cloudflare Worker proxy
      if (workerUrl) {
        try {
          fetched = await fetchMarketsFromBase(`${workerUrl}/cg/coins/markets`);
        } catch { /* fall through */ }
      }

      // 2. Direct CoinGecko fallback if worker failed or not configured
      if (fetched === 0) {
        try {
          fetched = await fetchMarketsFromBase('https://api.coingecko.com/api/v3/coins/markets');
        } catch { /* silent */ }
      }

      if (fetched > 0) {
        apiFetchSucceeded = true;
        saveToStorage();
      }
    } catch {
      // STATIC_ICONS already seeded above
    }
    fetchPromise = null;
    return memoryCache;
  })();

  return fetchPromise;
}
