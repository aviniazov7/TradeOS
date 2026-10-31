import { resolveTypedSymbol } from './pairCatalog';

const FALLBACK_PAIR = 'BTCUSDT';

function tradeTime(trade) {
  const n = new Date(trade?.date || trade?.createdAt || 0).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * Symbol for a new backtest trade.
 * The journal's first selected symbol wins. With none selected, use the
 * last symbol saved in that journal (this session, then its trades).
 */
export function defaultBacktestPair({ pairs, trades, lastUsed } = {}) {
  for (const raw of pairs || []) {
    const symbol = resolveTypedSymbol(raw);
    if (symbol) return symbol;
  }
  const remembered = resolveTypedSymbol(lastUsed);
  if (remembered) return remembered;
  const latest = [...(trades || [])].sort((a, b) => tradeTime(b) - tradeTime(a));
  for (const trade of latest) {
    const symbol = resolveTypedSymbol(trade?.pair);
    if (symbol) return symbol;
  }
  return FALLBACK_PAIR;
}

/** Stable text of the new/edit trade dialog, used for dirty detection. */
export function backtestTradeSnapshot(form) {
  return JSON.stringify({
    pair: form?.pair || '',
    direction: form?.direction || '',
    strategy: form?.strategy || '',
    trigger: form?.trigger || '',
    timeframe: form?.timeframe || '',
    session: form?.session || '',
    date: form?.date || '',
    maxR: form?.maxR ?? '',
    stopDistancePct: form?.stopDistancePct ?? '',
    rResult: form?.rResult ?? '',
    result: form?.result || '',
    entryChartUrl: form?.entryChartUrl || '',
    managementChartUrl: form?.managementChartUrl || '',
    notes: form?.notes || '',
  });
}

/** Stable text of the settings dialog, ignoring row keys and UI-only state. */
export function backtestSettingsSnapshot(form, draft = '') {
  const examples = (form?.tradeExamples || []).map((ex) => ({
    title: ex?.title || '',
    chartUrl: ex?.chartUrl || '',
    description: ex?.description || '',
  }));
  return JSON.stringify({
    name: form?.name || '',
    description: form?.description || '',
    entryRules: form?.entryRules || '',
    exitRules: form?.exitRules || '',
    riskManagement: form?.riskManagement || '',
    notes: form?.notes || '',
    color: form?.color || '',
    pairs: [...(form?.pairs || [])],
    timeframes: [...(form?.timeframes || [])],
    sessions: [...(form?.sessions || [])],
    checklist: [...(form?.checklist || [])],
    tradeExamples: examples,
    marketConditions: form?.marketConditions || '',
    tradeManagement: form?.tradeManagement || '',
    draft: draft || '',
  });
}
