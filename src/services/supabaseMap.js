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
// `fixed` are Supabase-only discriminator columns injected on write and dropped
// on read (e.g. kind='note' when several collections share journal_entries).
function makeMapper(colMap, jsonKeys = {}, fixed = {}) {
  const colToApp = Object.fromEntries(Object.entries(colMap).map(([a, c]) => [c, a]));
  const jsonToApp = Object.fromEntries(Object.entries(jsonKeys).map(([a, c]) => [c, a]));
  const fixedCols = new Set(Object.keys(fixed));
  const SKIP = new Set(['id', 'user_id', 'meta']);
  return {
    // app object → db row (unmapped fields → meta jsonb; discriminators injected)
    toRow(app) {
      const row = { ...fixed };
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
    // db row → app object (meta spreads back; discriminators dropped)
    fromRow(row) {
      if (!row) return row;
      const app = { id: row.id };
      for (const [col, val] of Object.entries(row)) {
        if (col === 'id' || col === 'user_id' || col === 'meta' || fixedCols.has(col)) continue;
        if (colToApp[col]) app[colToApp[col]] = val;
        else if (jsonToApp[col]) app[jsonToApp[col]] = val;
        else if (val != null) app[col] = val; // keep unmapped non-null cols
        // (connection_id, strategy_id, …); skip nulls so unused shared columns
        // like journal_entries.content don't leak onto the app object.
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

// ── journal family ───────────────────────────────────────────────────────────
// notes / tradingPlans / processes / morningJournals / eveningJournals all fold
// into journal_entries, split by a fixed `kind`. Their fields are very varied,
// so we keep it faithful+simple: only dates map to columns, everything else →
// meta (round-trips perfectly). The `kind` discriminator is injected on write
// and dropped on read.
const ENTRY_COLS = { createdAt: 'created_at', updatedAt: 'updated_at' };
// journals / backtestJournals are the trade/backtest CONTAINERS → journals table.
const CONTAINER_COLS = {
  name: 'name', exchange: 'exchange', initialBalance: 'initial_balance',
  createdAt: 'created_at', updatedAt: 'updated_at',
};

const MAPPERS = {
  trades: makeMapper(TRADE_COLS, TRADE_JSON),
  signals: makeMapper(SIGNAL_COLS),
  strategies: makeMapper(STRATEGY_COLS, STRATEGY_JSON),
  backtests: makeMapper(BACKTEST_COLS),
  dca: makeMapper(DCA_COLS),
  notes: makeMapper(ENTRY_COLS, {}, { kind: 'note' }),
  tradingPlans: makeMapper(ENTRY_COLS, {}, { kind: 'plan' }),
  processes: makeMapper(ENTRY_COLS, {}, { kind: 'process' }),
  morningJournals: makeMapper(ENTRY_COLS, {}, { kind: 'morning' }),
  eveningJournals: makeMapper(ENTRY_COLS, {}, { kind: 'evening' }),
  journals: makeMapper(CONTAINER_COLS, {}, { is_backtest: false }),
  backtestJournals: makeMapper(CONTAINER_COLS, {}, { is_backtest: true }),
};

export function mapToRow(collectionName, data) {
  const m = MAPPERS[collectionName];
  return m ? m.toRow(data) : data;
}

export function mapFromRow(collectionName, row) {
  const m = MAPPERS[collectionName];
  return m ? m.fromRow(row) : row;
}
