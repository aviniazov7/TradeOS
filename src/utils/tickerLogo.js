import { tickerCoinKey, tickerCoinUrls, tickerMarkUrls } from './tickerMarks';
import { stockLogoUrls, stockSymbol } from './stocks';

// Tile behind the mark. Dark drawings sit on white; the green NVIDIA eye and
// the Solana bars sit on black so they are not white-on-white. Inset is the
// image box inside the circle. Callers always paint with object-fit: contain.
const FRAMES = {
  AAPL: { background: '#ffffff', inset: '78%' },
  NVDA: { background: '#000000', inset: '90%' },
  TSLA: { background: '#ffffff', inset: '80%' },
  MSFT: { background: '#ffffff', inset: '80%' },
  AMZN: { background: '#ffffff', inset: '82%' },
  META: { background: '#f0f3fa', inset: '100%' },
  QQQ: { background: '#000AD2', inset: '100%' },
  SPY: { background: '#001AFF', inset: '100%' },
  // The PNG is already the black tile with padded bars, so the image fills
  // the circle. A smaller inset painted a second ring around the mark.
  SOL: { background: '#000000', inset: '100%' },
  DOGE: { background: '#ba9f33', inset: '100%' },
  LTC: { background: '#bfbbbb', inset: '100%' },
  XRP: { background: '#ffffff', inset: '100%' },
  XLM: { background: '#ffffff', inset: '84%' },
  LEO: { background: '#ffffff', inset: '86%' },
};

export function tickerLogoFrame(kind, symbol) {
  const s = kind === 'crypto' ? tickerCoinKey(symbol) : stockSymbol(symbol);
  const frame = FRAMES[s] || { background: 'transparent', inset: '100%' };
  const urls = kind === 'stock'
    ? stockLogoUrls(s)
    : kind === 'crypto'
      ? tickerCoinUrls(s)
      : tickerMarkUrls(s);
  return { ...frame, urls };
}
