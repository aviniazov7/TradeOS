// Canonical USDT symbols for the plan form. The builder picker and the AI
// draft both go through here, so "Bitcoin", "BTC" and "ביטקוין" become the
// same chip PlanForm already knows how to select. No network.

import { COINS } from './constants';

export const PLAN_PAIR_LIMIT = 12;

const HEBREW_NAMES = {
  ביטקוין: 'BTC',
  בטקוין: 'BTC',
  אתריום: 'ETH',
  סולנה: 'SOL',
  בינאנס: 'BNB',
  קרדנו: 'ADA',
  ריפל: 'XRP',
  דוגקוין: 'DOGE',
  שיבה: 'SHIB',
  פפה: 'PEPE',
  יוניסוואפ: 'UNI',
  מייקר: 'MKR',
};

const BASE_BY_ALIAS = new Map();

for (const coin of COINS) {
  BASE_BY_ALIAS.set(coin.symbol.toUpperCase(), coin.symbol);
  BASE_BY_ALIAS.set(coin.name.trim().toUpperCase(), coin.symbol);
  BASE_BY_ALIAS.set(`${coin.symbol.toUpperCase()}USDT`, coin.symbol);
}

for (const [alias, symbol] of Object.entries(HEBREW_NAMES)) {
  BASE_BY_ALIAS.set(alias, symbol);
}

export const PLAN_PAIRS = COINS.map((coin) => `${coin.symbol}USDT`);

const PAIR_SET = new Set(PLAN_PAIRS);

export function planPairFromName(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const direct = BASE_BY_ALIAS.get(text) || BASE_BY_ALIAS.get(text.toUpperCase());
  if (direct) return `${direct}USDT`;
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = BASE_BY_ALIAS.get(compact.endsWith('USDT') ? compact.slice(0, -4) : compact);
  return base ? `${base}USDT` : '';
}

export function normalizePlanPairs(list) {
  const out = [];
  for (const item of list || []) {
    const pair = planPairFromName(item);
    if (!pair || !PAIR_SET.has(pair) || out.includes(pair)) continue;
    out.push(pair);
    if (out.length >= PLAN_PAIR_LIMIT) break;
  }
  return out;
}

export function searchPlanPairs(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  return COINS.filter((coin) => {
    const pair = `${coin.symbol}USDT`;
    if (coin.symbol.toLowerCase().includes(q) || coin.name.toLowerCase().includes(q) || pair.toLowerCase().includes(q)) {
      return true;
    }
    return Object.entries(HEBREW_NAMES).some(([alias, symbol]) => symbol === coin.symbol && alias.includes(q));
  }).slice(0, 8).map((coin) => ({
    pair: `${coin.symbol}USDT`,
    label: coin.name,
  }));
}
