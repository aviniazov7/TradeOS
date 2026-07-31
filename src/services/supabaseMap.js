// ─────────────────────────────────────────────────────────────────────────────
// Field mapping between the app's (Firestore) object shape and the Supabase /
// Postgres column shape (Firestore → Supabase migration). Pure functions, no
// client import — so it can be unit-tested in isolation.
//
// Trades carry many camelCase fields; the core/queryable ones map to real
// columns, and everything else rides in a `meta` jsonb so NOTHING is lost.
// ─────────────────────────────────────────────────────────────────────────────

// app key → db column (scalar/date columns)
const TRADE_COLS = {
  pair: 'symbol',
  direction: 'side',
  orderType: 'order_type',
  entryPrice: 'entry_price',
  exitPrice: 'exit_price',
  quantity: 'quantity',
  leverage: 'leverage',
  stopLoss: 'stop_loss',
  fees: 'fees',
  pnl: 'pnl',
  netPnl: 'net_pnl',
  pnlPercent: 'pnl_percent',
  pnlFromExchange: 'pnl_from_exchange',
  riskAmount: 'risk_amount',
  rrRatio: 'rr_ratio',
  result: 'result',
  positionSize: 'position_size',
  margin: 'margin',
  status: 'status',
  session: 'session',
  strategy: 'strategy',
  setup: 'setup',
  notes: 'notes',
  source: 'source',
  externalId: 'external_id',
  journalId: 'journal_id',
  entryDate: 'opened_at',
  exitDate: 'closed_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};
// app key → db column (jsonb columns for arrays/objects)
const TRADE_JSON = { tps: 'tps', exits: 'exits', externalIds: 'external_ids' };

const TRADE_COL_TO_APP = Object.fromEntries(Object.entries(TRADE_COLS).map(([a, c]) => [c, a]));
const TRADE_JSON_TO_APP = Object.fromEntries(Object.entries(TRADE_JSON).map(([a, c]) => [c, a]));

// Row-managed keys we never fold into meta.
const SKIP = new Set(['id', 'user_id', 'meta']);

// Normalize a value for a db column: Date / Firestore Timestamp → ISO string.
function toDbValue(v) {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  return v;
}

function tradeToRow(app) {
  const row = {};
  const meta = {};
  for (const [key, val] of Object.entries(app || {})) {
    if (SKIP.has(key)) continue;
    if (TRADE_COLS[key]) row[TRADE_COLS[key]] = toDbValue(val);
    else if (TRADE_JSON[key]) row[TRADE_JSON[key]] = val ?? null;
    else meta[key] = val; // long-tail journaling fields (mistakes, ratings, urls…)
  }
  if (Object.keys(meta).length) row.meta = meta;
  return row;
}

function tradeFromRow(row) {
  if (!row) return row;
  const app = { id: row.id };
  for (const [col, val] of Object.entries(row)) {
    if (col === 'id' || col === 'user_id' || col === 'meta') continue;
    if (TRADE_COL_TO_APP[col]) app[TRADE_COL_TO_APP[col]] = val;
    else if (TRADE_JSON_TO_APP[col]) app[TRADE_JSON_TO_APP[col]] = val;
    else app[col] = val; // unmapped columns (connection_id, strategy_id) kept as-is
  }
  return { ...app, ...(row.meta || {}) }; // spread the long-tail back to the top level
}

// Per-collection mappers. Collections without an entry pass through unchanged
// (their fields already match the column names).
const MAPPERS = {
  trades: { toRow: tradeToRow, fromRow: tradeFromRow },
};

export function mapToRow(collectionName, data) {
  const m = MAPPERS[collectionName];
  return m ? m.toRow(data) : data;
}

export function mapFromRow(collectionName, row) {
  const m = MAPPERS[collectionName];
  return m ? m.fromRow(row) : row;
}
