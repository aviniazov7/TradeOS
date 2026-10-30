import { tradeSetups } from './setupStats';
import { TRADINGVIEW_URL_RE } from './tradingViewLink';

// Mirrors firestore.rules isValidTrade / isValidTradeCommon. The Worker
// writes with the Admin SDK, which bypasses rules, so this is the check.

const PAIR_MAX = 30;
const TEXT_MAX = 4000;
const SHORT_MAX = 80;
const TAG_MAX = 40;
const MAX_TAGS = 12;
const MAX_EXITS = 20;
const MAX_TPS = 8;
const MAX_ENTRIES = 20;
const MAX_CHECKLIST = 30;

const ALLOWED_FIELDS = [
  'journalId', 'pair', 'direction', 'orderType', 'marketType', 'strategy',
  'timeframe', 'trigger', 'status', 'entryPrice', 'exitPrice', 'tps', 'exits',
  'stopLoss', 'originalStopLoss', 'takeProfit', 'quantity', 'riskAmount',
  'leverage', 'fees', 'entries', 'planId', 'planName', 'checklist',
  'checklistAdherence', 'tags', 'setups', 'entryDate', 'exitDate',
  'entryReason', 'notes', 'emotionBefore', 'emotionAfter', 'mistakes',
  'session', 'tradingViewUrls', 'source', 'focusRating', 'planAdherenceRating',
  'stressRating', 'confidenceRating', 'assetClass', 'contract',
  'externalId',
];

const NUMERIC = [
  'entryPrice', 'exitPrice', 'stopLoss', 'originalStopLoss', 'takeProfit',
  'quantity', 'riskAmount', 'leverage', 'fees',
  'focusRating', 'planAdherenceRating', 'stressRating', 'confidenceRating',
  'checklistAdherence',
];

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function coerceNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function asDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortText(v, max) {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (s.length > max) return undefined;
  return s;
}

/**
 * Turn a public-API JSON body into the payload buildStoredTrade expects.
 * Returns { ok: true, trade } or { ok: false, error }.
 * Derived pnl / positionSize are NOT applied here.
 */
export function prepareApiTrade(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'JSON object body is required' };
  }
  const src = {};
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) src[key] = body[key];
  }

  const journalId = typeof src.journalId === 'string' ? src.journalId.trim() : '';
  if (!journalId || journalId.length > 128 || journalId.includes('/')) {
    return { ok: false, error: 'journalId is required' };
  }

  for (const key of NUMERIC) {
    if (src[key] == null || src[key] === '') continue;
    const n = coerceNum(src[key]);
    if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };
    src[key] = n;
  }

  if (!isNum(src.entryPrice) || src.entryPrice <= 0) {
    return { ok: false, error: 'entryPrice must be a number greater than 0' };
  }
  if (!isNum(src.quantity) || src.quantity <= 0) {
    return { ok: false, error: 'quantity must be a number greater than 0' };
  }
  if (src.stopLoss == null) src.stopLoss = 0;
  if (!isNum(src.stopLoss) || src.stopLoss < 0) {
    return { ok: false, error: 'stopLoss must be a number greater than or equal to 0' };
  }
  if (src.fees == null) src.fees = 0;
  if (!isNum(src.fees) || src.fees < 0) {
    return { ok: false, error: 'fees must be a number greater than or equal to 0' };
  }
  if (src.direction !== 'long' && src.direction !== 'short') {
    return { ok: false, error: "direction must be 'long' or 'short'" };
  }

  const pair = typeof src.pair === 'string' ? src.pair.trim() : '';
  if (!pair || pair.length > PAIR_MAX) {
    return { ok: false, error: `pair must be a string of 1–${PAIR_MAX} characters` };
  }
  src.pair = pair;

  const assetClass = src.assetClass || 'crypto';
  if (!['crypto', 'futures_cme', 'stocks'].includes(assetClass)) {
    return { ok: false, error: "assetClass must be 'crypto', 'futures_cme', or 'stocks'" };
  }
  src.assetClass = assetClass;

  if (assetClass === 'futures_cme') {
    const c = src.contract;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return { ok: false, error: 'futures trades require a contract object' };
    }
    const contracts = coerceNum(c.contracts);
    const pointValue = coerceNum(c.pointValue);
    const tickSize = coerceNum(c.tickSize);
    if (!(contracts > 0) || !(pointValue > 0) || !(tickSize > 0)) {
      return { ok: false, error: 'contract.contracts, pointValue and tickSize must be numbers greater than 0' };
    }
    const symbol = shortText(c.symbol ?? '', 20);
    if (symbol === undefined) return { ok: false, error: 'contract.symbol must be a short string' };
    src.contract = { symbol, contracts, pointValue, tickSize };
    if (!(src.quantity > 0)) src.quantity = contracts;
  } else {
    if (src.leverage == null) src.leverage = 1;
    if (!isNum(src.leverage) || src.leverage < 1 || src.leverage > 200) {
      return { ok: false, error: 'leverage must be a number from 1 to 200' };
    }
    delete src.contract;
  }

  if (src.exitPrice == null) src.exitPrice = 0;
  if (!isNum(src.exitPrice) || src.exitPrice < 0) {
    return { ok: false, error: 'exitPrice must be a number greater than or equal to 0' };
  }

  const exitsError = normalizeExits(src);
  if (exitsError) return { ok: false, error: exitsError };

  if (src.status == null) {
    const exited = (Array.isArray(src.exits) ? src.exits : []).reduce((s, e) => s + (e.percent || 0), 0);
    src.status = src.exitPrice > 0 || exited >= 99.95 ? 'closed' : (src.exits?.length ? 'partial' : 'open');
  }
  if (!['open', 'closed', 'partial'].includes(src.status)) {
    return { ok: false, error: "status must be 'open', 'closed', or 'partial'" };
  }

  if ('setups' in src) src.setups = tradeSetups({ setups: src.setups });

  if ('tradingViewUrls' in src) {
    const urls = src.tradingViewUrls;
    if (!Array.isArray(urls) || urls.length > 4) {
      return { ok: false, error: 'tradingViewUrls must be a list of at most 4 URLs' };
    }
    for (const url of urls) {
      if (typeof url !== 'string' || url.length > 2000 || !TRADINGVIEW_URL_RE.test(url)) {
        return { ok: false, error: 'tradingViewUrls entries must be https tradingview.com links' };
      }
    }
  }

  for (const key of ['strategy', 'timeframe', 'trigger', 'session', 'orderType', 'marketType', 'source', 'planName', 'externalId']) {
    if (src[key] == null) continue;
    const max = key === 'externalId' ? 128 : SHORT_MAX;
    const text = shortText(src[key], max);
    if (text === undefined) return { ok: false, error: `${key} must be a string of at most ${max} characters` };
    src[key] = text;
  }
  for (const key of ['notes', 'entryReason', 'mistakes', 'emotionBefore', 'emotionAfter']) {
    if (src[key] == null) continue;
    const text = shortText(src[key], TEXT_MAX);
    if (text === undefined) return { ok: false, error: `${key} must be a string of at most ${TEXT_MAX} characters` };
    src[key] = text;
  }

  if ('tags' in src) {
    if (!Array.isArray(src.tags) || src.tags.length > MAX_TAGS) {
      return { ok: false, error: `tags must be a list of at most ${MAX_TAGS} strings` };
    }
    const tags = [];
    for (const tag of src.tags) {
      const text = shortText(tag, TAG_MAX);
      if (!text) return { ok: false, error: `each tag must be a string of 1–${TAG_MAX} characters` };
      tags.push(text);
    }
    src.tags = tags;
  }

  if ('tps' in src && src.tps != null) {
    if (!Array.isArray(src.tps) || src.tps.length > MAX_TPS) {
      return { ok: false, error: `tps must be a list of at most ${MAX_TPS} prices` };
    }
    const tps = [];
    for (const price of src.tps) {
      const n = coerceNum(price);
      if (!(n > 0)) return { ok: false, error: 'tps prices must be numbers greater than 0' };
      tps.push(n);
    }
    src.tps = tps;
  }

  if ('entries' in src && src.entries != null) {
    const err = normalizeEntries(src);
    if (err) return { ok: false, error: err };
  }

  if ('checklist' in src && src.checklist != null) {
    const err = normalizeChecklist(src);
    if (err) return { ok: false, error: err };
  }

  if (src.entryDate != null) {
    const d = asDate(src.entryDate);
    if (!d) return { ok: false, error: 'entryDate must be an ISO date' };
    src.entryDate = d;
  }
  if (src.exitDate != null) {
    const d = asDate(src.exitDate);
    if (!d) return { ok: false, error: 'exitDate must be an ISO date' };
    src.exitDate = d;
  }

  if (!(Number(src.originalStopLoss) > 0)) src.originalStopLoss = src.stopLoss || 0;
  if (!src.source) src.source = 'manual';
  src.journalId = journalId;

  // Exchange imports set pnlFromExchange before computeTradeFields on the
  // in-app path and do not call prepareApiTrade. A public API or MCP client
  // must not override the price-based P&L, so the field is dropped even if
  // a caller sends it.
  delete src.pnlFromExchange;

  return { ok: true, trade: src };
}

function normalizeExits(src) {
  if (src.exits == null) return null;
  if (!Array.isArray(src.exits) || src.exits.length > MAX_EXITS) {
    return `exits must be a list of at most ${MAX_EXITS} fills`;
  }
  const exits = [];
  for (const exit of src.exits) {
    if (!exit || typeof exit !== 'object') return 'each exit must be an object';
    const price = coerceNum(exit.price);
    if (!(price > 0)) return 'each exit needs a price greater than 0';
    const row = { price };
    if (exit.percent != null) {
      const percent = coerceNum(exit.percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return 'exit percent must be between 0 and 100';
      row.percent = percent;
    }
    if (exit.contracts != null) {
      const contracts = coerceNum(exit.contracts);
      if (!(contracts > 0)) return 'exit contracts must be greater than 0';
      row.contracts = contracts;
    }
    if (row.percent == null && row.contracts == null) return 'each exit needs percent or contracts';
    if (exit.date != null) {
      const d = asDate(exit.date);
      if (!d) return 'exit date must be an ISO date';
      row.date = d;
    }
    exits.push(row);
  }
  src.exits = exits;
  return null;
}

function normalizeEntries(src) {
  if (!Array.isArray(src.entries) || src.entries.length > MAX_ENTRIES) {
    return `entries must be a list of at most ${MAX_ENTRIES} fills`;
  }
  const entries = [];
  for (const entry of src.entries) {
    if (!entry || typeof entry !== 'object') return 'each entry must be an object';
    const price = coerceNum(entry.price);
    const quantity = coerceNum(entry.quantity);
    if (!(price > 0) || !(quantity > 0)) return 'each entry needs a price and quantity greater than 0';
    const row = { price, quantity };
    if (entry.date != null) {
      const d = asDate(entry.date);
      if (!d) return 'entry fill date must be an ISO date';
      row.date = d;
    }
    entries.push(row);
  }
  src.entries = entries;
  return null;
}

function normalizeChecklist(src) {
  if (!Array.isArray(src.checklist) || src.checklist.length > MAX_CHECKLIST) {
    return `checklist must be a list of at most ${MAX_CHECKLIST} items`;
  }
  const rows = [];
  for (const row of src.checklist) {
    if (!row || typeof row !== 'object') return 'each checklist row must be an object';
    const item = shortText(row.item, 200);
    if (!item) return 'each checklist item must be a string of 1–200 characters';
    if (typeof row.done !== 'boolean') return 'checklist done must be a boolean';
    rows.push({ item, done: row.done });
  }
  src.checklist = rows;
  return null;
}
