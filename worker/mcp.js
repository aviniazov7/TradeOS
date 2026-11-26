// Remote MCP server (Streamable HTTP, stateless) for the TradeOS journal.
// Same tos_ API key and rate limits as /api/v1. Tool calls run the public
// API functions in-process — this worker does not HTTP itself.
//
// Protocol: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
// No session id and no SSE stream. GET and DELETE are 405. POST is one
// JSON-RPC message. Notifications get 202. Tool failures are isError results.

import {
  authorizeApi, createTrade, deleteTrade, getPlan, journalStats, listDailyJournals, listJournals,
  listPlans, listRiskRules, listTrades, updateTrade,
} from './publicApi.js';

const PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];
const PREFERRED_PROTOCOL = '2025-11-25';

const TOOLS = [
  {
    name: 'list_journals',
    description: 'List the journals owned by the API key, live accounts and backtest journals. Each row has id, name, type (live or backtest), and isBacktest. Live rows also have exchange (the broker, for example MEXC or Bybit), assetClass, currency, initialBalance, archived, starred, and isDefault. Backtest rows have no broker: exchange is empty, assetClass and initialBalance are null, and description, createdAt, and updatedAt are included. Optional type is live or backtest; omit it to list both. Use id or name with list_trades and get_stats. add_trade, update_trade, and delete_trade accept live journals only. Omitting a journal elsewhere does not pick one of these for you.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['live', 'backtest'], description: 'Omit to list live and backtest journals. live is the trading accounts. backtest is the backtest journals.' },
      },
    },
  },
  {
    name: 'add_trade',
    description: 'Add one trade to a live journal owned by the API key. Backtest journals are read-only: a backtest journal id or name is not found and nothing is written. Validation and stored fields match POST /api/v1/trades: pnl, netPnl, pnlPercent, result, position size, margin, and a derived risk amount when entry, stop, and size can price it. P&L is computed from prices and fees. pnlFromExchange is not accepted. Only the properties listed in this schema are accepted. Pass journalId or journal (the journal name, or its id). One of them is required — omitting both is rejected and does not guess a journal. Also required: pair, direction (long or short), entryPrice, quantity. status may be omitted — an exit price closes the trade, partial exits become partial, otherwise the trade stays open. fees default to 0 and leverage to 1 (crypto and stocks). Futures (assetClass futures_cme) need contract.contracts, contract.pointValue, and contract.tickSize. Optional custom is an object of field id to string or number, checked against the user\'s settings/customTradeFields definitions. Unknown ids and values that do not match a field are rejected. Omit custom for a trade with no answers. Pass idempotencyKey (8–128 printable characters) to make a retry return the original trade instead of writing another one. A shared journal does not include custom.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair', 'direction', 'entryPrice', 'quantity'],
      properties: {
        journalId: { type: 'string', description: 'Id of a journal the key owner owns.' },
        journal: { type: 'string', description: 'Journal name (case-insensitive) or journal id. Must belong to the key owner. Ambiguous names are rejected.' },
        pair: { type: 'string', description: 'Symbol, 1–30 characters. Example: BTCUSDT.' },
        direction: { type: 'string', enum: ['long', 'short'] },
        entryPrice: { type: 'number', exclusiveMinimum: 0 },
        exitPrice: { type: 'number', minimum: 0 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        stopLoss: { type: 'number', minimum: 0 },
        takeProfit: { type: 'number' },
        leverage: { type: 'number', description: '1–200. Defaults to 1 for crypto and stocks.' },
        fees: { type: 'number', minimum: 0 },
        riskAmount: { type: 'number', description: 'Optional. Derived from entry, stop, and size when omitted or 0.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        assetClass: { type: 'string', enum: ['crypto', 'futures_cme', 'stocks'] },
        entryDate: { type: 'string', description: 'ISO-8601. Defaults to now.' },
        exitDate: { type: 'string', description: 'ISO-8601.' },
        notes: { type: 'string' },
        entryReason: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        contract: {
          type: 'object',
          description: 'Required when assetClass is futures_cme.',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            contracts: { type: 'number', exclusiveMinimum: 0 },
            pointValue: { type: 'number', exclusiveMinimum: 0 },
            tickSize: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        idempotencyKey: { type: 'string', description: '8–128 printable characters. A repeat returns the original trade.' },
        custom: {
          type: 'object',
          additionalProperties: true,
          description: 'Answers for fields defined on settings/customTradeFields. Keys are field ids (f1, f2, …). Text and select values are strings; a number field is a number. Unknown ids and values that do not match the definition are rejected. Omit for no answers.',
        },
      },
    },
  },
  {
    name: 'update_trade',
    description: 'Update one live trade owned by the API key. Same checks as PATCH /api/v1/trades/{id}. Backtest trades are read-only: a backtest trade id is not found and is not modified. id is required. Every other argument is optional and partial: omitted fields stay as stored. Only the properties listed here are accepted. id and createdAt cannot be changed. Sending no field besides id is rejected. Validation matches add_trade (types, ranges, futures contract). The Worker recomputes pnl, netPnl, pnlPercent, result, position size, margin, and R from the merged trade, and sets updatedAt. Another user\'s id is not found. Pass journalId or journal only when moving the trade to another live journal you own. A backtest journal is not a valid destination. custom replaces the whole answer map and is checked against the user\'s defined fields. Omit custom to keep the stored answers. {} clears them. A shared journal does not include custom.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128, description: 'Trade id from add_trade or list_trades.' },
        journalId: { type: 'string', description: 'Move the trade to this journal id. The journal must belong to the key owner.' },
        journal: { type: 'string', description: 'Journal name (case-insensitive) or journal id to move the trade to.' },
        pair: { type: 'string', description: 'Symbol, 1–30 characters. Example: BTCUSDT.' },
        direction: { type: 'string', enum: ['long', 'short'] },
        entryPrice: { type: 'number', exclusiveMinimum: 0 },
        exitPrice: { type: 'number', minimum: 0 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        stopLoss: { type: 'number', minimum: 0 },
        takeProfit: { type: 'number' },
        leverage: { type: 'number', description: '1–200 for crypto and stocks.' },
        fees: { type: 'number', minimum: 0 },
        riskAmount: { type: 'number', description: 'Derived from entry, stop, and size when omitted or 0 on create. Send 0 to recompute it.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        assetClass: { type: 'string', enum: ['crypto', 'futures_cme', 'stocks'] },
        entryDate: { type: 'string', description: 'ISO-8601. Does not change createdAt.' },
        exitDate: { type: 'string', description: 'ISO-8601.' },
        notes: { type: 'string' },
        entryReason: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        contract: {
          type: 'object',
          description: 'Required when assetClass is futures_cme.',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            contracts: { type: 'number', exclusiveMinimum: 0 },
            pointValue: { type: 'number', exclusiveMinimum: 0 },
            tickSize: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        custom: {
          type: 'object',
          additionalProperties: true,
          description: 'Replaces the whole answer map. Keys are field ids defined on settings/customTradeFields. {} clears stored answers. Omit this argument to leave them unchanged.',
        },
      },
    },
  },
  {
    name: 'list_trades',
    description: 'List the caller\'s trades. Live trades are newest entryDate first. The same entryDate ties break by document id in that same direction. Set order to "asc" for oldest first (id ascending on a tie). Optional filters: journalId or journal (name or id of a journal the key owner owns), status (open, closed, or partial), pair, direction (long or short), from, to, and type (live or backtest). Omitting type and the journal filter lists live trades only, same as before. Pass a backtest journal id, or type=backtest, to read that owner\'s backtest trades (users/{uid}/backtests). Backtest rows are ordered by date (createdAt when date is missing), undated rows last, and include the stored fields: strategy (setup), trigger, session, stopDistancePct (stop distance, percent), rResult (R), maxR (Max R), result, timeframe, notes, and chart URLs. There is no stored tags field and no stored 3R field on a backtest trade. status does not apply to backtest trades. from and to filter the entry date for live trades and the backtest date for backtest trades (ISO-8601 or YYYY-MM-DD). limit is 1–100 and defaults to 50. Pass the previous nextCursor as cursor to read the next page; the cursor is only valid for the same filters and order. Live trades with no entryDate are omitted. Each live trade includes custom when that trade has answers, and omits the field when it does not. A shared journal does not include custom; this list is only the key owner\'s trades.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        journalId: { type: 'string' },
        journal: { type: 'string', description: 'Journal name or id. A backtest journal id returns that journal\'s backtest trades. Omit, with no type, to list live trades from every account.' },
        type: { type: 'string', enum: ['live', 'backtest'], description: 'live lists live trades. backtest lists backtest trades. Omit to keep live trades unless journalId is a backtest journal.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        pair: { type: 'string' },
        direction: { type: 'string', enum: ['long', 'short'] },
        from: { type: 'string', description: 'Entry-date lower bound. ISO-8601 or YYYY-MM-DD.' },
        to: { type: 'string', description: 'Entry-date upper bound. ISO-8601 or YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string', description: 'nextCursor from the previous page.' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Default desc: newest entryDate first.' },
      },
    },
  },
  {
    name: 'delete_trade',
    description: 'Delete one live trade owned by the API key. id is the trade id from add_trade or list_trades. Backtest trades are read-only: a backtest trade id is not found and is not deleted. The trade must live under that user — another user\'s id is not found. Screenshot docs for the trade are removed too. Stats and balances are computed from the trades that remain, the same way the journal screen updates after a delete. There is no separate aggregate to patch.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Trade id.' },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Performance for one journal, matching GET /api/v1/stats. Pass journalId or journal (name or id) of a live journal or a backtest journal. One of them is required — omitting both is rejected and does not combine journals. period is all (default), week, month, or year. from and to, when set, replace period. A live journal returns counts, win rate (breakevens excluded), net P&L, opening and current balance, return percent on the equity the period opened at (null when the journal has no opening balance), summed dollar risk, profit factor, expectancy, average R, and max drawdown. A backtest journal returns the same counts and win rate from result, with avgR, totalR, bestR, and worstR from rResult, and an R profit factor. Dollar fields (totalPnl, balances, returnPercent, riskAmount) are null because a backtest trade does not store dollar P&L. type and isBacktest say which kind was read. truncated is true when more than 5000 trades were scanned. Deleting a live trade changes the next live result, because stats are summed from the trades that remain. Backtest trades cannot be deleted here.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        journalId: { type: 'string' },
        journal: { type: 'string', description: 'Journal name or id. Required when journalId is omitted.' },
        period: { type: 'string', enum: ['all', 'week', 'month', 'year'] },
        from: { type: 'string', description: 'ISO-8601 or YYYY-MM-DD. Replaces period when set.' },
        to: { type: 'string', description: 'ISO-8601 or YYYY-MM-DD. Replaces period when set.' },
        groupBy: {
          type: 'string',
          enum: ['session', 'setup', 'weekday', 'hour'],
          description: 'Add a groups array. session uses the stored field. For a live journal, setup uses stored setups, or the entry trigger when setups is empty (backtest setup is strategy). weekday and hour are Asia/Jerusalem. Omit to leave the stats object unchanged.',
        },
      },
    },
  },
  {
    name: 'list_daily_journals',
    description: 'Read the API key owner\'s morning and evening journal entries. Read-only. Optional from and to are calendar days (YYYY-MM-DD, inclusive) matched to each entry\'s date. Optional kind is morning or evening; omit it for both. Optional journalId must be a live journal the key owns. Entries are not stored per trading journal, so journalId does not filter them (filteredByJournal is false). Each entry includes kind and the stored fields (emotion, sleep, lesson, and the rest). Another user\'s journal id is not found. Business ledger and notebook entries are not included.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'Inclusive YYYY-MM-DD lower bound.' },
        to: { type: 'string', description: 'Inclusive YYYY-MM-DD upper bound.' },
        kind: { type: 'string', enum: ['morning', 'evening'] },
        journalId: { type: 'string', description: 'A live journal the key owns. Checked, not used as a filter.' },
      },
    },
  },
  {
    name: 'get_risk_rules',
    description: 'Read live-journal risk rules and whether they are breached right now. Read-only. Omit journalId to list every live journal the key owns. Pass journalId or journal for one. Each row has riskRules and dailyLossAlert as stored, plus status from the same measurement as the journal screen (weekly loss, daily and weekly loss percent, max trades per day, trading hours, and the daily dollar alert). status.breached is true when any enabled rule or the daily alert is breached. A backtest journal is rejected. Dollar caps use closed trades only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        journalId: { type: 'string' },
        journal: { type: 'string', description: 'Live journal name or id. Omit with journalId to list every live journal.' },
      },
    },
  },
  {
    name: 'list_plans',
    description: 'List the trading plans owned by the API key. Read-only. Each row is a summary: id, name, description, isActive, color, pairs, timeframes, sessions, maxDailyLoss, maxPositions, createdAt, and updatedAt. Active plans come first, then name. Use id with get_plan for the full stored document (rules, risk, sessions, checklist). There is no write tool for plans.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'get_plan',
    description: 'Read one trading plan owned by the API key. id is the plan id from list_plans. The plan object is the stored document: name, description, entryRules, exitRules, riskManagement, goals, notes, pairs, timeframes, sessions, maxDailyLoss, maxPositions, checklist, mistakesToAvoid, marketConditions, dailyRoutine, tradeManagement, tradeExamples, color, isActive, createdAt, updatedAt, and any other field saved on that document. Another user\'s id is not found. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128, description: 'Plan id from list_plans.' },
      },
    },
  },
];

function jsonResponse(cors, status, body, extra = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function rpc(cors, status, id, result, error) {
  const body = { jsonrpc: '2.0', id };
  if (error) body.error = error;
  else body.result = result;
  return jsonResponse(cors, status, body);
}

function toolError(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function toolOk(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false,
  };
}

function acceptsJson(request) {
  const accept = request.headers.get('Accept');
  if (!accept) return true;
  return accept.split(',').some((part) => {
    const media = part.split(';')[0].trim().toLowerCase();
    return media === 'application/json' || media === 'text/event-stream' || media === '*/*';
  });
}

function tradeRequest(args, { method = 'POST', path = '/api/v1/trades' } = {}) {
  const { idempotencyKey, ...trade } = args;
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey != null && idempotencyKey !== '') headers['Idempotency-Key'] = String(idempotencyKey);
  return new Request(`https://trade-os.internal${path}`, {
    method,
    headers,
    body: JSON.stringify(trade),
  });
}

function queryUrl(path, args, keys) {
  const url = new URL(`https://trade-os.internal${path}`);
  for (const key of keys) {
    const value = args[key];
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function asTool(response) {
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (response.status >= 400 || !body || typeof body !== 'object') {
    const message = body && typeof body.error === 'string' ? body.error : `request failed (${response.status})`;
    return toolError(message);
  }
  return toolOk(body);
}

async function callTool(params, ctx) {
  const name = params?.name;
  const args = params?.arguments == null ? {} : params.arguments;
  if (typeof name !== 'string' || !name) {
    return { rpcError: { code: -32602, message: 'tools/call requires params.name' } };
  }
  if (typeof args !== 'object' || Array.isArray(args)) return toolError('arguments must be an object');
  if (name === 'add_trade') return asTool(await createTrade(tradeRequest(args), ctx));
  if (name === 'update_trade') {
    const id = typeof args.id === 'string' ? args.id : '';
    const patch = { ...args };
    delete patch.id;
    return asTool(await updateTrade(id, tradeRequest(patch, {
      method: 'PATCH',
      path: `/api/v1/trades/${encodeURIComponent(id)}`,
    }), ctx));
  }
  if (name === 'list_journals') {
    return asTool(await listJournals(ctx, queryUrl('/api/v1/journals', args, ['type'])));
  }
  if (name === 'list_trades') {
    return asTool(await listTrades(queryUrl('/api/v1/trades', args, [
      'journalId', 'journal', 'type', 'status', 'pair', 'direction', 'from', 'to', 'limit', 'cursor', 'order',
    ]), ctx));
  }
  if (name === 'delete_trade') return asTool(await deleteTrade(typeof args.id === 'string' ? args.id : '', ctx));
  if (name === 'get_stats') {
    return asTool(await journalStats(queryUrl('/api/v1/stats', args, ['journalId', 'journal', 'period', 'from', 'to', 'groupBy']), ctx));
  }
  if (name === 'list_plans') return asTool(await listPlans(ctx));
  if (name === 'get_plan') return asTool(await getPlan(typeof args.id === 'string' ? args.id : '', ctx));
  if (name === 'list_daily_journals') {
    return asTool(await listDailyJournals(queryUrl('/api/v1/daily-journals', args, ['from', 'to', 'kind', 'journalId']), ctx));
  }
  if (name === 'get_risk_rules') {
    return asTool(await listRiskRules(queryUrl('/api/v1/risk-rules', args, ['journalId', 'journal']), ctx));
  }
  return toolError(`unknown tool: ${name}`);
}

function initializeResult(params) {
  const requested = params?.protocolVersion;
  return {
    protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PREFERRED_PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'tradeos', title: 'TradeOS', version: '1.0.0' },
    instructions: 'TradeOS journal tools for the signed-in API key. list_journals returns live and backtest journals (type, isBacktest, id, name; live rows also include exchange). Optional type is live or backtest. add_trade writes one live trade to journalId or journal (optional idempotencyKey); omitting both is rejected. Backtest journals are read-only. custom, when sent, is checked against settings/customTradeFields. update_trade patches one live trade by id and recomputes P&L; id and createdAt stay as stored; omit custom to keep stored answers. list_trades returns newest entryDate first unless order is asc, includes custom only when a live trade has answers, and lists live trades when no journal filter and no type are passed. Pass a backtest journal id or type=backtest for backtest trades (strategy, session, stopDistancePct, rResult, maxR). A shared journal never includes custom. delete_trade removes one live trade by id and does not delete backtest trades. get_stats is one live or backtest journal, by journalId or journal. Optional groupBy is session, setup, weekday, or hour. Live setup groups use stored setups, or the entry trigger when setups is empty. list_plans and get_plan read trading plans. list_daily_journals reads morning and evening entries. get_risk_rules reads live-journal risk rules and breach status. None of those three write. Dates are ISO-8601.',
  };
}

async function dispatch(message, ctx) {
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') return initializeResult(message.params);
  if (message.method === 'ping') return {};
  if (message.method === 'tools/list') return { tools: TOOLS };
  if (message.method === 'tools/call') return callTool(params, ctx);
  return { rpcError: { code: -32601, message: `method not found: ${message.method}` } };
}

export async function handleMcp(request, deps) {
  const cors = deps.cors || {};
  const origin = request.headers.get('Origin');
  if (origin && !deps.allowOrigin?.(origin)) {
    return jsonResponse(cors, 403, { error: 'origin not allowed' });
  }

  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path !== '/mcp') return jsonResponse(cors, 404, { error: 'not found' });

  if (request.method === 'GET' || request.method === 'DELETE') {
    return jsonResponse(cors, 405, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32601, message: 'this stateless server has no SSE stream and no session to terminate' },
    }, { Allow: 'POST' });
  }
  if (request.method !== 'POST') {
    return jsonResponse(cors, 405, { error: 'method not allowed' }, { Allow: 'POST' });
  }
  if (!acceptsJson(request)) {
    return jsonResponse(cors, 406, { error: 'Accept must include application/json or text/event-stream' });
  }

  const opened = await authorizeApi(request, { ...deps, cors });
  if (!opened.ok) return opened.response;

  let message;
  try { message = await request.json(); } catch {
    return rpc(cors, 400, null, null, { code: -32700, message: 'parse error' });
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    const id = message && typeof message === 'object' && !Array.isArray(message) ? message.id ?? null : null;
    return rpc(cors, 400, id, null, { code: -32600, message: 'invalid request' });
  }

  const versionHeader = request.headers.get('MCP-Protocol-Version');
  if (versionHeader && !PROTOCOL_VERSIONS.includes(versionHeader)) {
    return rpc(cors, 400, Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null, null, {
      code: -32600,
      message: `unsupported MCP-Protocol-Version: ${versionHeader}`,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
    return jsonResponse(cors, 202, null);
  }

  try {
    const result = await dispatch(message, opened.ctx);
    if (result?.rpcError) return rpc(cors, 200, message.id, null, result.rpcError);
    return rpc(cors, 200, message.id, result, null);
  } catch (err) {
    console.error('mcp request failed', message.method, err?.message || err);
    return rpc(cors, 200, message.id, null, { code: -32603, message: 'request failed' });
  }
}
