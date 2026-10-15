// Self-hosted marks for instruments that are not a coin and not a listed stock.
// TradingView's commodity and index marks, saved under public/logos so a CDN
// hiccup cannot turn the ticker into a broken image or a generic glyph.
const MARKS = {
  GC: '/logos/marks/gold.svg',
  MGC: '/logos/marks/gold.svg',
  XAU: '/logos/marks/gold.svg',
  SI: '/logos/marks/silver.svg',
  CL: '/logos/marks/oil.svg',
  MCL: '/logos/marks/oil.svg',
  NG: '/logos/marks/gas.svg',
  ES: '/logos/marks/sp500.svg',
  MES: '/logos/marks/sp500.svg',
  NQ: '/logos/marks/nasdaq.svg',
  MNQ: '/logos/marks/nasdaq.svg',
  YM: '/logos/marks/dow.svg',
  MYM: '/logos/marks/dow.svg',
  RTY: '/logos/marks/russell.svg',
  M2K: '/logos/marks/russell.svg',
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
