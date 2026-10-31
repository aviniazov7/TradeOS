// Self-hosted marks for instruments that are not a coin and not a listed stock.
// Futures keep TradingView's square marks: the price ticker draws them with
// object-fit contain. Backtest CFD symbols use a coin, two overlapping flags,
// or a US flag, because CoinIcon crops every image to a circle and a letter
// tile there reads as an empty placeholder.
const GOLD_COIN = '/logos/symbols/gold-coin.svg';
const SILVER_COIN = '/logos/symbols/silver-coin.svg';
const US_FLAG = '/logos/symbols/us-flag.svg';

const MARKS = {
  GC: '/logos/marks/gold.svg',
  MGC: '/logos/marks/gold.svg',
  XAU: '/logos/marks/gold.svg',
  XAUUSD: GOLD_COIN,
  SI: '/logos/marks/silver.svg',
  XAGUSD: SILVER_COIN,
  CL: '/logos/marks/oil.svg',
  MCL: '/logos/marks/oil.svg',
  NG: '/logos/marks/gas.svg',
  ES: '/logos/marks/sp500.svg',
  MES: '/logos/marks/sp500.svg',
  NQ: '/logos/marks/nasdaq.svg',
  MNQ: '/logos/marks/nasdaq.svg',
  NAS100: US_FLAG,
  US100: US_FLAG,
  US500: US_FLAG,
  YM: '/logos/marks/dow.svg',
  MYM: '/logos/marks/dow.svg',
  US30: US_FLAG,
  RTY: '/logos/marks/russell.svg',
  M2K: '/logos/marks/russell.svg',
  // Base currency in front, quote behind. A typed broker suffix (EURUSD.R)
  // is not listed here, so it keeps the neutral letter fallback.
  EURUSD: '/logos/symbols/eurusd.svg',
  GBPUSD: '/logos/symbols/gbpusd.svg',
  USDJPY: '/logos/symbols/usdjpy.svg',
  AUDUSD: '/logos/symbols/audusd.svg',
  USDCAD: '/logos/symbols/usdcad.svg',
  USDCHF: '/logos/symbols/usdchf.svg',
  NZDUSD: '/logos/symbols/nzdusd.svg',
};

/** Local logo URLs for a futures/commodity symbol, or [] when it has no mark. */
export function tickerMarkUrls(symbol) {
  const url = MARKS[String(symbol || '').toUpperCase()];
  return url ? [url] : [];
}

// Official coin images (CoinGecko coin-images), saved locally so the ticker
// does not depend on a favicon or a CDN that answers 403. Coins outside this
// set use CoinIcon.
const COINS = {
  BTC: '/logos/coins/btc.png',
  ETH: '/logos/coins/eth.png',
  XRP: '/logos/coins/xrp.png',
  BNB: '/logos/coins/bnb.png',
  // Hashed filename: Firebase caches /logos for 7 days, and the first
  // sol.png at this path was CoinGecko's green circle. A new URL is the
  // only way a phone drops that cached body.
  SOL: '/logos/coins/sol-15954313.png',
  DOGE: '/logos/coins/doge.svg',
  ADA: '/logos/coins/ada.png',
  TRX: '/logos/coins/trx.png',
  LINK: '/logos/coins/link.png',
  AVAX: '/logos/coins/avax.png',
  LTC: '/logos/coins/ltc.svg',
  BCH: '/logos/coins/bch.png',
  TON: '/logos/coins/ton.png',
  SUI: '/logos/coins/sui.png',
  XLM: '/logos/coins/xlm.png',
  ZEC: '/logos/coins/zec.png',
  XMR: '/logos/coins/xmr.png',
  LEO: '/logos/coins/leo.png',
  HYPE: '/logos/coins/hype.jpg',
  TAO: '/logos/coins/tao.jpg',
};

/** BTC, SOL/USDT, and SOLUSDT all name the same coin. */
export function tickerCoinKey(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[/-]?USDT$/, '')
    .replace(/\//g, '')
    .trim();
}

/** Local coin logo, or [] so the caller can fall through to CoinIcon. */
export function tickerCoinUrls(symbol) {
  const url = COINS[tickerCoinKey(symbol)];
  return url ? [url] : [];
}
