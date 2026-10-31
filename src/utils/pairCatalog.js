// Backtest pair catalog: crypto USDT pairs stay, and common CFD/forex
// symbols sit beside them. A typed symbol is kept as typed (uppercased)
// when it is not already listed — it is not forced onto a USDT suffix.
//
// Price decimals here are display precision, not a contract multiplier.
// Backtest P&L is R, so it never treats a pip as a USDT coin tick.
// Dollar P&L of (exit − entry) × coin quantity is only valid for a
// USDT/USDC/BUSD pair. JPY, gold, and index CFDs are not that.

import { COINS } from './constants';
import { formatPrice } from './formatters';

export const SYMBOL_MAX_LENGTH = 15;

// A–Z, digits, and the separators brokers actually put in a symbol.
const CUSTOM_SYMBOL_RE = /^[A-Z0-9./-]{1,15}$/;

// Short English names — one line in the RTL menu, same tone as "Gold".
export const CFD_FOREX_PAIRS = [
  { symbol: 'XAUUSD', name: 'Gold', decimals: 2, category: 'Metals' },
  { symbol: 'XAGUSD', name: 'Silver', decimals: 3, category: 'Metals' },
  { symbol: 'EURUSD', name: 'Euro', decimals: 5, category: 'Forex' },
  { symbol: 'GBPUSD', name: 'Pound', decimals: 5, category: 'Forex' },
  { symbol: 'USDJPY', name: 'Yen', decimals: 3, category: 'Forex' },
  { symbol: 'AUDUSD', name: 'Aussie', decimals: 5, category: 'Forex' },
  { symbol: 'USDCAD', name: 'Canada', decimals: 5, category: 'Forex' },
  { symbol: 'USDCHF', name: 'Swiss', decimals: 5, category: 'Forex' },
  { symbol: 'NZDUSD', name: 'Kiwi', decimals: 5, category: 'Forex' },
  { symbol: 'US30', name: 'Dow', decimals: 1, category: 'Indices' },
  { symbol: 'NAS100', name: 'Nasdaq', decimals: 1, category: 'Indices' },
  { symbol: 'US500', name: 'S&P', decimals: 1, category: 'Indices' },
];

const CFD_BY_SYMBOL = new Map(CFD_FOREX_PAIRS.map((p) => [p.symbol, p]));
const COIN_BY_SYMBOL = new Map(COINS.map((c) => [c.symbol, c]));

/** Uppercase, trim, and accept only a broker-like symbol. Null when invalid. */
export function normalizeCustomSymbol(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s || s.length > SYMBOL_MAX_LENGTH || !CUSTOM_SYMBOL_RE.test(s)) return null;
  return s;
}

function compactSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Listed form of a typed symbol, ignoring . / - separators.
 * "eur/usd" and "EURUSD" are both EURUSD. Null when it is not in a catalog.
 */
export function canonicalListedSymbol(raw) {
  const norm = normalizeCustomSymbol(raw);
  if (!norm) return null;
  const compact = compactSymbol(norm);
  if (CFD_BY_SYMBOL.has(compact)) return compact;
  if (compact.endsWith('USDT')) {
    const base = compact.slice(0, -4);
    if (COIN_BY_SYMBOL.has(base)) return compact;
  }
  return null;
}

/**
 * Symbol to store. A listed instrument wins (so "xau/usd" saves as XAUUSD).
 * Anything else keeps the validated spelling, separators included.
 */
export function resolveTypedSymbol(raw) {
  return canonicalListedSymbol(raw) || normalizeCustomSymbol(raw);
}

/** Drop blanks and duplicates. Listed aliases collapse to one symbol. */
export function uniqueSymbols(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const symbol = resolveTypedSymbol(raw);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

/** Metals / Forex / Indices for a listed CFD symbol. Empty for coins and free text. */
export function categoryForSymbol(symbol) {
  return CFD_BY_SYMBOL.get(compactSymbol(symbol))?.category || '';
}

export function nameForSymbol(symbol) {
  const compact = compactSymbol(symbol);
  const cfd = CFD_BY_SYMBOL.get(compact);
  if (cfd) return cfd.name;
  if (compact.endsWith('USDT')) {
    const coin = COIN_BY_SYMBOL.get(compact.slice(0, -4));
    if (coin) return coin.name;
  }
  const coin = COIN_BY_SYMBOL.get(compact);
  return coin ? coin.name : '';
}

/**
 * Display decimals for a symbol.
 * null → crypto magnitude (BTC at 2 places, a sub-cent coin at up to 8).
 * JPY is 3, majors are 5, gold is 2. Never the crypto 8-place default.
 */
export function priceDecimalsForSymbol(symbol) {
  const compact = compactSymbol(symbol);
  if (!compact) return null;
  const listed = CFD_BY_SYMBOL.get(compact);
  if (listed) return listed.decimals;
  if (compact.endsWith('USDT') || compact.endsWith('USDC') || compact.endsWith('BUSD')) return null;
  if (compact.endsWith('JPY')) return 3;
  if (compact.startsWith('XAU')) return 2;
  if (compact.startsWith('XAG')) return 3;
  if (/^(US30|DJ30)$/.test(compact)) return 1;
  if (/^(NAS100|US100|US500|SPX500)$/.test(compact)) return 1;
  if (/^[A-Z]{6}$/.test(compact)) return 5;
  return 2;
}

/**
 * True only when (exit − entry) × coin quantity is already a USDT-style
 * dollar P&L. Forex, gold CFDs, and indices need a contract multiplier
 * (or are quoted in JPY) and must not take this path.
 */
export function cryptoQuantityPnl(symbol) {
  const compact = compactSymbol(symbol);
  if (!compact) return true;
  return compact.endsWith('USDT') || compact.endsWith('USDC') || compact.endsWith('BUSD');
}

/**
 * Amount text when the quote is not dollars. Null means the caller should
 * keep the normal $ formatter (USDT coins and USD-quoted CFDs).
 */
export function formatQuoteAmount(value, currency, { signed = false, digits = 2 } = {}) {
  if (!currency || currency === 'USD') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : (signed && n > 0 ? '+' : '');
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  });
  return `${sign}${body} ${currency}`;
}

/** Price text for a known symbol. Crypto pairs keep formatPrice. */
export function formatSymbolPrice(value, symbol) {
  const n = Number(value);
  if (value == null || value === '' || Number.isNaN(n)) return '0';
  if (n === 0) return '0';
  const decimals = priceDecimalsForSymbol(symbol);
  if (decimals == null) return formatPrice(n);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
}

function matchesQuery(pair, name, q) {
  if (!q) return true;
  const p = pair.toUpperCase();
  const n = (name || '').toUpperCase();
  const compactQ = q.replace(/[./-]/g, '');
  const compactP = p.replace(/[./-]/g, '');
  return p.includes(q) || n.includes(q) || (compactQ.length > 0 && compactP.includes(compactQ));
}

/**
 * Rows for a pair picker.
 * includeMarkets adds the CFD/forex catalog and keeps a typed symbol as-is.
 * Without it, a typed ticker still becomes SYMBOLUSDT (crypto journal).
 * emptyIsMarketsOnly: an empty query shows the CFD list, not every coin.
 */
export function buildPairResults({
  query = '',
  selected = [],
  saved = [],
  includeMarkets = false,
  remote = [],
  emptyIsMarketsOnly = false,
} = {}) {
  const q = String(query || '').trim().toUpperCase();
  const selectedSet = new Set(selected.map((s) => String(s).toUpperCase()));
  const marketsOnly = emptyIsMarketsOnly && !q;
  const rows = [];
  const seen = new Set();

  const push = (pair, name, category = '') => {
    const key = String(pair || '').toUpperCase();
    if (!key || seen.has(key) || selectedSet.has(key)) return;
    if (!matchesQuery(key, name, q)) return;
    seen.add(key);
    rows.push({ pair: key, symbol: key.replace(/USDT$/, ''), name: name || '', category });
  };

  if (includeMarkets) {
    for (const p of CFD_FOREX_PAIRS) push(p.symbol, p.name, p.category);
    for (const raw of saved) {
      const symbol = resolveTypedSymbol(raw);
      if (symbol) push(symbol, nameForSymbol(symbol), categoryForSymbol(symbol));
    }
  }

  const includeCoins = !(marketsOnly && (includeMarkets || emptyIsMarketsOnly));
  if (includeCoins) {
    const coinCategory = includeMarkets ? 'Crypto' : '';
    for (const c of COINS) push(`${c.symbol}USDT`, c.name, coinCategory);
    for (const r of remote) {
      const sym = String(r?.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!sym || COIN_BY_SYMBOL.has(sym)) continue;
      push(`${sym}USDT`, r.name || sym, coinCategory);
    }
  }

  let custom = null;
  if (q) {
    if (includeMarkets) {
      const symbol = resolveTypedSymbol(q);
      if (symbol && !seen.has(symbol) && !selectedSet.has(symbol)) {
        custom = { pair: symbol, symbol, name: nameForSymbol(symbol) };
      }
    } else {
      const symbol = q.replace(/USDT$/i, '');
      const pair = symbol ? `${symbol}USDT` : '';
      if (symbol && pair && !seen.has(pair) && !selectedSet.has(pair)) {
        custom = { pair, symbol, name: symbol };
      }
    }
  }

  return { rows, custom };
}
