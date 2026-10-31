import { tickerCoinKey, tickerMarkUrls } from './tickerMarks';
import eurusd from '../../public/logos/symbols/eurusd.svg?raw';
import gbpusd from '../../public/logos/symbols/gbpusd.svg?raw';
import usdjpy from '../../public/logos/symbols/usdjpy.svg?raw';
import audusd from '../../public/logos/symbols/audusd.svg?raw';
import usdcad from '../../public/logos/symbols/usdcad.svg?raw';
import usdchf from '../../public/logos/symbols/usdchf.svg?raw';
import nzdusd from '../../public/logos/symbols/nzdusd.svg?raw';
import usFlag from '../../public/logos/symbols/us-flag.svg?raw';

// Flag art is in the JS bundle as a data URI. An <img src="/logos/...svg">
// fetches after paint, so a menu of forex symbols pops in one flag at a time.
// A data URI stays an <img> (clip-path ids stay inside that image document).
const RAW = {
  '/logos/symbols/eurusd.svg': eurusd,
  '/logos/symbols/gbpusd.svg': gbpusd,
  '/logos/symbols/usdjpy.svg': usdjpy,
  '/logos/symbols/audusd.svg': audusd,
  '/logos/symbols/usdcad.svg': usdcad,
  '/logos/symbols/usdchf.svg': usdchf,
  '/logos/symbols/nzdusd.svg': nzdusd,
  '/logos/symbols/us-flag.svg': usFlag,
};

function toDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DATA = Object.fromEntries(
  Object.entries(RAW).map(([url, svg]) => [url, toDataUri(svg)]),
);

/** Inlined flag for this symbol, or '' when the mark is not a flag SVG. */
export function inlineFlagSrc(symbol) {
  const url = tickerMarkUrls(tickerCoinKey(symbol))[0];
  return (url && DATA[url]) || '';
}

let warmed = false;

/** Decode every flag before a symbol menu asks for it. */
export function preloadFlagSvgs() {
  if (warmed || typeof Image === 'undefined') return;
  warmed = true;
  for (const src of Object.values(DATA)) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = src;
  }
}

preloadFlagSvgs();
