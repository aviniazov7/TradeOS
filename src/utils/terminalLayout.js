// Pure helpers for the terminal's split-screen chart layouts (TradingView-style
// multi-chart). A layout is a grid of named areas — one letter per pane, 'a' =
// pane 0 — so the same definition drives the CSS grid, the picker icons, the
// draggable dividers and the per-pane defaults. Track sizes are fractions that
// sum to 1. No React — unit-tested in terminalLayout.test.js.
import { TIMEFRAMES, tvSymbol } from './terminal';

/**
 * areas  rows × cols of pane letters; a letter must cover a rectangle
 * cols / rows  default track fractions (equal when omitted)
 * tfs    default timeframe per pane (TIMEFRAMES ids)
 */
export const CHART_LAYOUTS = [
  { id: '1', label: 'גרף אחד', areas: [['a']], tfs: ['4H'] },
  { id: '2v', label: 'שניים זה לצד זה', areas: [['a', 'b']], tfs: ['D', '4H'] },
  { id: '2h', label: 'שניים זה מעל זה', areas: [['a'], ['b']], tfs: ['D', '4H'] },
  { id: '3l', label: 'גדול משמאל + שניים מימין', areas: [['a', 'b'], ['a', 'c']], cols: [0.56, 0.44], tfs: ['30m', 'D', '4H'] },
  { id: '3r', label: 'שניים משמאל + גדול מימין', areas: [['b', 'a'], ['c', 'a']], cols: [0.44, 0.56], tfs: ['30m', 'D', '4H'] },
  { id: '3c', label: 'שלוש עמודות', areas: [['a', 'b', 'c']], tfs: ['D', '4H', '30m'] },
  { id: '4', label: 'ארבעה (2×2)', areas: [['a', 'b'], ['c', 'd']], tfs: ['W', 'D', '4H', '30m'] },
  { id: '1+3', label: 'גדול + שלושה קטנים', areas: [['a', 'a', 'a'], ['b', 'c', 'd']], rows: [0.64, 0.36], tfs: ['4H', 'D', '1H', '15m'] },
];

export const DEFAULT_LAYOUT_ID = '3l';

// Old 1 / 2 / 4 toggle values (tradeos_terminal_layout) → layout ids.
const LEGACY_LAYOUT = { 1: '1', 2: '2v', 4: '4' };

export function getLayout(id) {
  return CHART_LAYOUTS.find((l) => l.id === id) || CHART_LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT_ID);
}

/** The saved layout id, else the legacy 1/2/4 choice mapped, else the default. */
export function resolveLayoutId(saved, legacy) {
  if (CHART_LAYOUTS.some((l) => l.id === saved)) return saved;
  const old = LEGACY_LAYOUT[parseInt(legacy, 10)];
  return old || DEFAULT_LAYOUT_ID;
}

const letterIndex = (ch) => ch.charCodeAt(0) - 97;

/** Number of panes (distinct letters). */
export function paneCount(layout) {
  return new Set(layout.areas.flat()).size;
}

/** CSS grid-template-areas: `"a b" "a c"`. */
export function gridTemplateAreas(layout) {
  return layout.areas.map((row) => `"${row.join(' ')}"`).join(' ');
}

/**
 * Each pane's rectangle in grid cells, ordered by pane index:
 * [{ index, area, col, row, colSpan, rowSpan }]. Throws on a non-rectangular area.
 */
export function areaRects(layout) {
  const box = {};
  layout.areas.forEach((row, r) => row.forEach((ch, c) => {
    const b = box[ch] || (box[ch] = { r0: r, r1: r, c0: c, c1: c, cells: 0 });
    b.r0 = Math.min(b.r0, r); b.r1 = Math.max(b.r1, r);
    b.c0 = Math.min(b.c0, c); b.c1 = Math.max(b.c1, c);
    b.cells += 1;
  }));
  return Object.entries(box)
    .map(([area, b]) => {
      const colSpan = b.c1 - b.c0 + 1;
      const rowSpan = b.r1 - b.r0 + 1;
      if (colSpan * rowSpan !== b.cells) throw new Error(`area ${area} is not a rectangle`);
      return { index: letterIndex(area), area, col: b.c0, row: b.r0, colSpan, rowSpan };
    })
    .sort((x, y) => x.index - y.index);
}

/**
 * The draggable dividers. A vertical ('x') divider sits on the boundary after
 * column `index` and covers the rows [start, end) where the panes on both sides
 * differ; a horizontal ('y') one likewise between rows. In a 2×2 grid each
 * boundary is one full-length divider (shared, like TradingView); next to a
 * spanning pane it only covers the split side.
 */
export function layoutDividers(layout) {
  const { areas } = layout;
  const rows = areas.length;
  const cols = areas[0].length;
  const out = [];
  const runs = (len, differs) => {
    const segs = [];
    let start = -1;
    for (let i = 0; i <= len; i += 1) {
      const d = i < len && differs(i);
      if (d && start < 0) start = i;
      if (!d && start >= 0) { segs.push([start, i]); start = -1; }
    }
    return segs;
  };
  for (let c = 0; c < cols - 1; c += 1) {
    for (const [start, end] of runs(rows, (r) => areas[r][c] !== areas[r][c + 1])) out.push({ axis: 'x', index: c, start, end });
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (const [start, end] of runs(cols, (c) => areas[r][c] !== areas[r + 1][c])) out.push({ axis: 'y', index: r, start, end });
  }
  return out;
}

const equal = (n) => Array.from({ length: n }, () => 1 / n);

/** The layout's default { cols, rows } fractions. */
export function defaultSizes(layout) {
  const nRows = layout.areas.length;
  const nCols = layout.areas[0].length;
  return {
    cols: layout.cols && layout.cols.length === nCols ? [...layout.cols] : equal(nCols),
    rows: layout.rows && layout.rows.length === nRows ? [...layout.rows] : equal(nRows),
  };
}

/**
 * The smallest track fraction allowed: `minPx` of `totalPx`, but never so big
 * that `n` tracks can't fit (≤ 1/n) and never below 5%.
 */
export function minFraction(minPx, totalPx, n) {
  if (n <= 1) return 0;
  const f = totalPx > 0 ? minPx / totalPx : 0.1;
  return Math.min(Math.max(f, 0.05), 1 / n);
}

/**
 * Saved track fractions → a safe array: right length, finite, positive, each ≥
 * `min`, summing to 1. Anything off falls back to `fallback`.
 */
export function normalizeSizes(sizes, fallback, min = 0.05) {
  const n = fallback.length;
  if (!Array.isArray(sizes) || sizes.length !== n || !sizes.every((v) => Number.isFinite(v) && v > 0)) return [...fallback];
  const sum = sizes.reduce((a, b) => a + b, 0);
  let out = sizes.map((v) => v / sum);
  if (out.some((v) => v < min - 1e-9)) {
    // Lift the too-small tracks to the minimum and take it from the rest.
    const low = out.map((v) => v < min);
    const deficit = out.reduce((a, v, i) => a + (low[i] ? min - v : 0), 0);
    const spare = out.reduce((a, v, i) => a + (low[i] ? 0 : v - min), 0);
    if (spare <= deficit) return [...fallback];
    out = out.map((v, i) => (low[i] ? min : v - ((v - min) / spare) * deficit));
  }
  return out;
}

/**
 * Move the boundary after track `index` by `delta` (a fraction of the whole):
 * only the two neighbouring tracks change, each kept ≥ `min`.
 */
export function resizeTracks(sizes, index, delta, min = 0.05) {
  if (index < 0 || index >= sizes.length - 1 || !Number.isFinite(delta)) return sizes;
  const a = sizes[index];
  const b = sizes[index + 1];
  const d = Math.min(Math.max(delta, min - a), b - min);
  if (Math.abs(d) < 1e-9) return sizes;
  const out = [...sizes];
  out[index] = a + d;
  out[index + 1] = b - d;
  return out;
}

/** Fraction from the start to the boundary after track `index`. */
export function trackOffset(sizes, index) {
  return sizes.slice(0, index + 1).reduce((a, b) => a + b, 0);
}

/** Fractions → grid-template-columns/rows (`fr`, so gaps are subtracted first). */
export function gridTemplate(sizes) {
  return sizes.map((v) => `${Number(v.toFixed(5))}fr`).join(' ');
}

/** The saved sizes for a layout (validated), else its defaults. */
export function sizesForLayout(layout, saved) {
  const def = defaultSizes(layout);
  const s = saved && typeof saved === 'object' ? saved[layout.id] : null;
  return {
    cols: normalizeSizes(s?.cols, def.cols),
    rows: normalizeSizes(s?.rows, def.rows),
  };
}

const TF_IDS = new Set(TIMEFRAMES.map((t) => t.id));

/**
 * The layout's panes from what was saved for it: [{ tf, symbol }] — a valid
 * timeframe (else the layout default) and an own symbol or null (follows the
 * selected position).
 */
export function panesForLayout(layout, saved) {
  const list = saved && typeof saved === 'object' && Array.isArray(saved[layout.id]) ? saved[layout.id] : [];
  return layout.tfs.map((tf, i) => {
    const s = list[i] || {};
    const sym = typeof s.symbol === 'string' && s.symbol.trim() ? s.symbol.trim().toUpperCase() : null;
    return { tf: TF_IDS.has(s.tf) ? s.tf : tf, symbol: sym };
  });
}

/**
 * What the user typed in a pane's symbol box → a TradingView symbol.
 *   "BINANCE:ETHUSDT" / "OKX:BTCUSDT.P" — taken as is
 *   "eth" / "ETHUSDT" / "eth-usdt"      — the perp on `exchange` (USDT added
 *                                          when no USDT/USDC/USD quote)
 *   "TVC:GOLD"                          — any non-crypto market: with a prefix
 * '' → null.
 */
export function symbolFromInput(input, exchange) {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes(':')) {
    const [venue, ticker] = raw.split(':');
    const v = venue.replace(/[^A-Z0-9_]/g, '');
    const t = (ticker || '').replace(/[^A-Z0-9_.!]/g, '');
    return v && t ? `${v}:${t}` : null;
  }
  const clean = raw.replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  const pair = /(USDT|USDC|USD)$/.test(clean) ? clean : `${clean}USDT`;
  return tvSymbol(pair, exchange);
}

/** "BYBIT:SOLUSDT.P" → "SOLUSDT" (for labels). */
export function symbolLabel(symbol) {
  const s = String(symbol || '');
  const t = s.includes(':') ? s.split(':')[1] : s;
  return t.replace(/\.P$/, '');
}
