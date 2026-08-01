// ─────────────────────────────────────────────────────────────────────────────
// Field mapping between the app's (Firestore) object shape and the Supabase /
// Postgres column shape (Firestore → Supabase migration). Pure functions, no
// client import — so it can be unit-tested in isolation.
//
// Core/queryable fields map to real columns; everything else rides in a `meta`
// jsonb so NOTHING is lost. `makeMapper` builds a bidirectional mapper from a
// simple app→column map (+ optional jsonb keys).
// ─────────────────────────────────────────────────────────────────────────────

// Normalize a value for a db column: Date / Firestore Timestamp → ISO string.
function toDbValue(v) {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  return v;
}

// appKey → dbColumn maps. jsonKeys are for array/object fields (jsonb columns).
function makeMapper(colMap, jsonKeys = {}) {
  const colToApp = Object.fromEntries(Object.entries(colMap).map(([a, c]) => [c, a]));
  const jsonToApp = Object.fromEntries(Object.entries(jsonKeys).map(([a, c]) => [c, a]));
  const SKIP = new Set(['id', 'user_id', 'meta']);
  return {
    // app object → db row (unmapped fields → meta jsonb)
    toRow(app) {
      const row = {};
      const meta = {};
      for (const [key, val] of Object.entries(app || {})) {
        if (SKIP.has(key)) continue;
        if (colMap[key]) row[colMap[key]] = toDbValue(val);
        else if (jsonKeys[key]) row[jsonKeys[key]] = val ?? null;
        else meta[key] = val;
      }
      if (Object.keys(meta).length) row.meta = meta;
      return row;
    },
    // db row → app object (meta spreads back to the top level)
    fromRow(row) {
      if (!row) return row;
      const app = { id: row.id };
      for (const [col, val] of Object.entries(row)) {
        if (col === 'id' || col === 'user_id' || col === 'meta') continue;
        if (colToApp[col]) app[colToApp[col]] = val;
        else if (jsonToApp[col]) app[jsonToApp[col]] = val;
        else app[col] = val; // unmapped columns (connection_id, strategy_id) kept as-is
      }
      return { ...app, ...(row.meta || {}) };
    },
  };
}

// ── trades ──────────────────────────────────────────────────────────────────
const TRADE_COLS = {
  pair: 'symbol', direction: 'side', orderType: 'order_type',
  entryPrice: 'entry_price', exitPrice: 'exit_price', quantity: 'quantity',
  leverage: 'leverage', stopLoss: 'stop_loss', fees: 'fees',
  pnl: 'pnl', netPnl: 'net_pnl', pnlPercent: 'pnl_percent',
  pnlFromExchange: 'pnl_from_exchange', riskAmount: 'risk_amount',
  rrRatio: 'rr_ratio', result: 'result', positionSize: 'position_size',
  margin: 'margin', status: 'status', session: 'session',
  strategy: 'strategy', setup: 'setup', notes: 'notes', source: 'source',
  externalId: 'external_id', journalId: 'journal_id',
  entryDate: 'opened_at', exitDate: 'closed_at',
  createdAt: 'created_at', updatedAt: 'updated_at',
};
const TRADE_JSON = { tps: 'tps', exits: 'exits', externalIds: 'external_ids' };

// ── signals ─────────────────────────────────────────────────────────────────
const SIGNAL_COLS = {
  pair: 'symbol', direction: 'side', status: 'status', notes: 'notes',
  entryZone: 'entry_zone', targetPrice: 'target_price', stopPrice: 'stop_price',
  createdAt: 'created_at', updatedAt: 'updated_at',
};

// ── strategies ──────────────────────────────────────────────────────────────
const STRATEGY_COLS = {
  name: 'name', description: 'description',
  createdAt: 'created_at', updatedAt: 'updated_at',
};
const STRATEGY_JSON = { rules: 'rules' };

// ── backtests (backtest TRADES — trade-like) ─────────────────────────────────
const BACKTEST_COLS = {
  pair: 'symbol', direction: 'side', strategy: 'strategy', trigger: 'trigger_name',
  timeframe: 'timeframe', session: 'session', rResult: 'r_result', result: 'result',
  notes: 'notes', entryChartUrl: 'entry_chart_url', managementChartUrl: 'management_chart_url',
  date: 'date', createdAt: 'created_at', updatedAt: 'updated_at',
}; // maxR / stopDistancePct → meta

// ── dca (dca_plans) ──────────────────────────────────────────────────────────
const DCA_COLS = { coin: 'symbol', createdAt: 'created_at', updatedAt: 'updated_at' };
// frequency / amountPerEntry / targetPrice / entries / totals / coingeckoId → meta

const MAPPERS = {
  trades: makeMapper(TRADE_COLS, TRADE_JSON),
  signals: makeMapper(SIGNAL_COLS),
  strategies: makeMapper(STRATEGY_COLS, STRATEGY_JSON),
  backtests: makeMapper(BACKTEST_COLS),
  dca: makeMapper(DCA_COLS),
};

export function mapToRow(collectionName, data) {
  const m = MAPPERS[collectionName];
  return m ? m.toRow(data) : data;
}

export function mapFromRow(collectionName, row) {
  const m = MAPPERS[collectionName];
  return m ? m.fromRow(row) : row;
}
