import { summarizeTrades } from './journalAnalytics';

// What a journal owner can reveal to one viewer. Every switch starts off.
// Notes, emotions and chart links hang off a trade, so they stay hidden
// unless the trades switch is on too. Balances are journal-level and can
// be shared on their own. Nothing here reads a network or a database.
export const SHARE_FIELD_KEYS = ['trades', 'notes', 'emotions', 'balances', 'tradingView'];

const TRADE_KEYS = [
  'id', 'journalId', 'pair', 'direction', 'status', 'orderType', 'marketType',
  'strategy', 'timeframe', 'session', 'trigger', 'assetClass',
  'entryPrice', 'exitPrice', 'quantity', 'leverage', 'fees', 'stopLoss',
  'takeProfit', 'riskAmount', 'pnl', 'netPnl', 'pnlPercent', 'rrRatio', 'result',
  'entryDate', 'exitDate',
];

const NOTE_KEYS = ['notes', 'entryReason'];
const EMOTION_KEYS = [
  'emotionBefore', 'emotionAfter', 'mistakes',
  'focusRating', 'planAdherenceRating', 'stressRating', 'confidenceRating',
];

export function defaultShareFields() {
  return {
    trades: false,
    notes: false,
    emotions: false,
    balances: false,
    tradingView: false,
  };
}

export function normalizeShareFields(input) {
  const fields = defaultShareFields();
  if (!input || typeof input !== 'object') return fields;
  for (const key of SHARE_FIELD_KEYS) fields[key] = input[key] === true;
  return fields;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function copyKeys(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function contractOf(trade) {
  const contract = trade?.contract;
  if (!contract || typeof contract !== 'object') return undefined;
  const out = {};
  for (const key of ['contracts', 'pointValue', 'tickSize', 'currency']) {
    if (contract[key] !== undefined) out[key] = contract[key];
  }
  return Object.keys(out).length ? out : undefined;
}

function exitsOf(trade) {
  if (!Array.isArray(trade?.exits)) return undefined;
  return trade.exits.map((exit) => {
    if (!exit || typeof exit !== 'object') return null;
    const row = {};
    if (exit.price !== undefined) row.price = exit.price;
    if (exit.percent !== undefined) row.percent = exit.percent;
    if (exit.contracts !== undefined) row.contracts = exit.contracts;
    return Object.keys(row).length ? row : null;
  }).filter(Boolean);
}

function chartLinks(trade) {
  if (!Array.isArray(trade?.tradingViewUrls)) return undefined;
  return trade.tradingViewUrls.filter((url) => typeof url === 'string');
}

function projectTrade(trade, fields) {
  const view = copyKeys(trade, TRADE_KEYS);
  const contract = contractOf(trade);
  if (contract) view.contract = contract;
  const exits = exitsOf(trade);
  if (exits) view.exits = exits;
  if (fields.notes) Object.assign(view, copyKeys(trade, NOTE_KEYS));
  if (fields.emotions) Object.assign(view, copyKeys(trade, EMOTION_KEYS));
  if (fields.tradingView) {
    const links = chartLinks(trade);
    if (links) view.tradingViewUrls = links;
  }
  return view;
}

function balancesOf(journal) {
  return {
    initialBalance: finiteNumber(journal?.initialBalance),
    propAccountSize: finiteNumber(journal?.propFirm?.accountSize),
  };
}

/**
 * Viewer-shaped copy of one journal.
 * Trades from any other journal are dropped. Statistics are computed from
 * the copy, so a hidden note or a foreign trade cannot change them.
 * Live balances and exchange addresses are never copied.
 */
export function filterJournalShare(journal, trades, fields) {
  const selected = normalizeShareFields(fields);
  const journalId = typeof journal?.id === 'string' ? journal.id : '';
  const view = { journalId };
  if (!journalId) return view;

  if (selected.balances) view.balances = balancesOf(journal);

  if (selected.trades) {
    const visible = (Array.isArray(trades) ? trades : [])
      .filter((trade) => trade?.journalId === journalId)
      .map((trade) => projectTrade(trade, selected));
    view.trades = visible;
    view.stats = summarizeTrades(visible);
  }

  return view;
}
